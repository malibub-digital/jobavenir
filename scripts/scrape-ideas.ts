import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractIdeaWithAI, ExtractedIdea } from '../src/lib/idea-extractor';
import { pool, queryDb, initDatabaseSchema, isSqlite, insertIdea, DbIdea } from '../src/lib/db';

dotenv.config();

const GOOGLE_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/16Nd67c8et6d5Ts2zsqcWO_mJb7jtfqV5XiO0cWS9Vu0/export?format=csv&gid=280735573';

interface SourceRow {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  url: string;
  statusTechnical: string;
  scraperType: string;
  frequency?: string;
  description?: string;
  etag?: string | null;
  lastModifiedHeader?: string | null;
}

interface ScrapeResult {
  modified: boolean;
  etag?: string | null;
  lastModified?: string | null;
  posts: Array<{
    title: string;
    content: string;
    excerpt: string;
    link: string;
    date: string;
  }>;
}

/**
 * Nettoie et normalise une URL (ajoute https:// si absent)
 */
function normalizeUrl(rawUrl: string): string {
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/$/, '');
}

/**
 * Génère un slug URL propre
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 80);
}

/**
 * Télécharge et filtre les sources dédiées aux Idées et Innovations depuis Google Sheets
 */
async function fetchIdeaSources(): Promise<SourceRow[]> {
  const primaryCachePath = path.resolve(process.cwd(), 'src/data/sources_cache.csv');
  const legacyCachePath = path.resolve(process.cwd(), '.dev/sources_cache.csv');
  let text = '';

  console.log('[Ideas Scraper] Récupération de l\'inventaire Google Sheets...');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GOOGLE_SHEET_CSV_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/csv,text/plain;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000)
      });
      if (res.ok) {
        text = await res.text();
        try {
          const cacheDir = path.dirname(primaryCachePath);
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(primaryCachePath, text, 'utf-8');
        } catch (_) {}
        break;
      }
    } catch (err: any) {
      console.warn(`[Ideas Scraper] Tentative ${attempt}/3 : Réseau lent (${err?.message || err}).`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!text) {
    if (fs.existsSync(primaryCachePath)) {
      text = fs.readFileSync(primaryCachePath, 'utf-8');
    } else if (fs.existsSync(legacyCachePath)) {
      text = fs.readFileSync(legacyCachePath, 'utf-8');
    } else {
      throw new Error('Impossible d\'accéder aux sources Google Sheets ou aux caches locaux.');
    }
  }

  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => l.includes('ID Source'));
  if (headerIdx === -1) {
    throw new Error('En-tête "ID Source" non trouvée dans le CSV.');
  }

  const sources: SourceRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts: string[] = [];
    let inQuotes = false;
    let current = '';
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());

    const id = parts[0];
    const name = parts[1]?.replace(/^"|"$/g, '');
    const category = parts[2]?.replace(/^"|"$/g, '');
    const subCategory = parts[3]?.replace(/^"|"$/g, '');
    const url = parts[5]?.replace(/^"|"$/g, '');
    const statusTechnical = parts[7]?.replace(/^"|"$/g, '');
    const scraperType = parts[8]?.replace(/^"|"$/g, '');
    const frequency = parts[9]?.replace(/^"|"$/g, '');
    const description = parts[10]?.replace(/^"|"$/g, '');

    if (id && id.startsWith('SRC_')) {
      // Filtrer sur les catégories d'inspiration d'idées ou incubateurs
      const isIdeaCandidate = 
        category?.includes('Idées & Innovation') ||
        category?.includes('Études & Filières') ||
        category?.includes('Incubateurs') ||
        description?.toLowerCase().includes('micro-') ||
        description?.toLowerCase().includes('low-tech') ||
        description?.toLowerCase().includes('technologies frugales');

      if (isIdeaCandidate && statusTechnical === 'ACTIF_200' && url && url !== '-') {
        sources.push({
          id,
          name,
          category,
          subCategory,
          url: normalizeUrl(url),
          statusTechnical,
          scraperType,
          frequency,
          description
        });
      }
    }
  }

  console.log(`[Ideas Scraper] ${sources.length} sources d'idées & innovation prêtes (Statut ACTIF_200).`);
  return sources;
}

/**
 * Parse un flux RSS / Atom
 */
function parseRssFeed(xmlText: string, limit = 5): Array<{ title: string; content: string; excerpt: string; link: string; date: string }> {
  const posts: Array<{ title: string; content: string; excerpt: string; link: string; date: string }> = [];
  const itemMatches = xmlText.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const itemXml of itemMatches.slice(0, limit)) {
    const rawTitle = (itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '';
    const title = rawTitle.replace(/<[^>]+>/g, '').trim();

    let link = (itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1] || '';
    if (!link) {
      const hrefMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefMatch) link = hrefMatch[1];
    }
    link = link.trim();

    const rawContent = (itemXml.match(/<(?:content:encoded|content|description)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:content:encoded|content|description)>/i) || [])[1] || '';
    const content = rawContent.trim();
    const cleanExcerpt = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);

    const rawDate = (itemXml.match(/<(?:pubDate|published|updated)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|published|updated)>/i) || [])[1] || '';
    let parsedDate = new Date().toISOString().split('T')[0];
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) parsedDate = d.toISOString().split('T')[0];
    }

    if (title && link) {
      posts.push({
        title,
        content: content || title,
        excerpt: cleanExcerpt,
        link,
        date: parsedDate
      });
    }
  }

  return posts;
}

/**
 * Scraper RSS avec gestion HTTP 304 (ETag / Last-Modified)
 */
async function scrapeRssSource(
  feedUrl: string,
  limit = 5,
  currentEtag?: string | null,
  currentLastModified?: string | null
): Promise<ScrapeResult> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
    };
    if (currentEtag) headers['If-None-Match'] = currentEtag;
    if (currentLastModified) headers['If-Modified-Since'] = currentLastModified;

    const res = await fetch(feedUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (res.status === 304) return { modified: false, posts: [] };
    if (!res.ok) return { modified: false, posts: [] };

    const xml = await res.text();
    const posts = parseRssFeed(xml, limit);

    return {
      modified: true,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      posts
    };
  } catch (err) {
    return { modified: false, posts: [] };
  }
}

/**
 * Scraper HTML générique pour les articles et études de cas
 */
async function scrapeHtmlSource(
  sourceUrl: string,
  limit = 5,
  currentEtag?: string | null,
  currentLastModified?: string | null
): Promise<ScrapeResult> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (currentEtag) headers['If-None-Match'] = currentEtag;
    if (currentLastModified) headers['If-Modified-Since'] = currentLastModified;

    const res = await fetch(sourceUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (res.status === 304) return { modified: false, posts: [] };
    if (!res.ok) return { modified: false, posts: [] };

    const html = await res.text();
    const posts: Array<{ title: string; content: string; excerpt: string; link: string; date: string }> = [];
    const base = new URL(sourceUrl);

    // Extraction des articles et fiches de tutoriels / cas d'usage
    const articleRegex = /<(?:article|div)[^>]*class=["'][^"']*(?:post|entry|tutorial|card|item|case-study)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div)>/gi;
    let match;
    const seenLinks = new Set<string>();

    while ((match = articleRegex.exec(html)) !== null && posts.length < limit) {
      const block = match[1];
      const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      let href = linkMatch[1].trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      if (href.startsWith('/')) href = `${base.origin}${href}`;

      let title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 10) {
        const hMatch = block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
        if (hMatch) title = hMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      if (title && title.length >= 10 && !seenLinks.has(href)) {
        seenLinks.add(href);
        const cleanContent = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        posts.push({
          title,
          content: cleanContent,
          excerpt: cleanContent.slice(0, 300),
          link: href,
          date: new Date().toISOString().split('T')[0]
        });
      }
    }

    return {
      modified: true,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
      posts
    };
  } catch {
    return { modified: false, posts: [] };
  }
}

/**
 * Routeur de collecte pour une source d'idées
 */
async function scrapeIdeaSource(source: SourceRow, limit = 4): Promise<ScrapeResult> {
  const url = source.url;

  // 1. Si la source est configurée RSS_FEED
  if (source.scraperType === 'RSS_FEED') {
    // Si l'URL se termine déjà par un suffixe RSS ou pas
    const directRes = await scrapeRssSource(url, limit, source.etag, source.lastModifiedHeader);
    if (directRes.modified && directRes.posts.length > 0) return directRes;

    // Tester les chemins conventionnels
    for (const suffix of ['/feed', '/feed/', '/rss.xml', '/rss']) {
      const feedRes = await scrapeRssSource(`${url}${suffix}`, limit, source.etag, source.lastModifiedHeader);
      if (feedRes.modified && feedRes.posts.length > 0) return feedRes;
    }
  }

  // 2. Détection RSS si disponible sur le domaine
  for (const pathSuffix of ['/feed', '/rss.xml', '/feed/']) {
    const rssRes = await scrapeRssSource(`${url}${pathSuffix}`, limit, source.etag, source.lastModifiedHeader);
    if (rssRes.modified && rssRes.posts.length > 0) {
      return rssRes;
    }
  }

  // 3. Fallback HTML
  return await scrapeHtmlSource(url, limit, source.etag, source.lastModifiedHeader);
}

/**
 * Point d'entrée principal pour le scraping d'idées
 */
export async function runIdeaScraper(closePool = false) {
  console.log('=== DÉMARRAGE DU SCRAPER D\'IDÉES DE PROJETS (JOBAVENIR) ===');
  await initDatabaseSchema();

  const allSources = await fetchIdeaSources();

  // Synchroniser les sources d'idées dans la table sources pour respecter la clé étrangère
  for (const s of allSources) {
    await queryDb(`
      INSERT INTO sources (id, name, category, sub_category, url, status_technical, scraper_type, frequency)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        sub_category = EXCLUDED.sub_category,
        url = EXCLUDED.url,
        status_technical = EXCLUDED.status_technical,
        scraper_type = EXCLUDED.scraper_type,
        frequency = EXCLUDED.frequency
    `, [s.id, s.name, s.category, s.subCategory, s.url, s.statusTechnical, s.scraperType, s.frequency || 'HEBDOMADAIRE']);
  }

  const cliSourceId = process.argv[2]?.startsWith('SRC_') ? process.argv[2] : null;

  let targetSources: SourceRow[] = [];
  if (cliSourceId) {
    const found = allSources.find(s => s.id === cliSourceId);
    if (found) {
      targetSources = [found];
      console.log(`[Ideas Scraper] 🎯 Source ciblée : ${found.name} (${found.id})`);
    } else {
      console.warn(`[Ideas Scraper] Source ${cliSourceId} introuvable parmi les sources d'idées.`);
    }
  } else {
    // Échantillon par défaut (ex: 5 sources prioritaires)
    targetSources = allSources.slice(0, 5);
  }

  let totalNewIdeas = 0;
  let totalProcessed = 0;
  let totalCached = 0;

  for (const source of targetSources) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[Source ${source.id}] ${source.name} (${source.url})`);

    const result = await scrapeIdeaSource(source, 3);
    if (!result.modified || result.posts.length === 0) {
      console.log(`   ⏭️ Aucun nouveau contenu ou source inchangée.`);
      continue;
    }

    console.log(`   📄 ${result.posts.length} publication(s) brute(s) trouvée(s).`);

    for (const post of result.posts) {
      totalProcessed++;
      // Déduplication stricte pré-LLM via hash de l'article source
      const rawContentHash = crypto.createHash('sha256').update(source.id + post.link + post.title).digest('hex');

      // Vérifier si cette source exacte a déjà généré une idée
      const existing = await queryDb(
        'SELECT id FROM ideas WHERE content_hash = $1 OR metadata->>\'source_url\' = $2 LIMIT 1',
        [rawContentHash, post.link]
      );

      if (existing.rows.length > 0) {
        console.log(`   ⏭️ Déjà traitée (${post.title.slice(0, 40)}...) [0 token].`);
        totalCached++;
        continue;
      }

      console.log(`   💡 Envoi au LLM pour contextualisation au Mali : "${post.title.slice(0, 60)}..."`);
      const rawText = `${post.title}\n\n${post.content}`;
      const extracted = await extractIdeaWithAI(rawText, post.title);

      if (!extracted) {
        console.log(`      🛡️ Contenu écarté (pas d'opportunité d'entreprise concrète pour le Mali).`);
        continue;
      }

      const ideaSlug = `${slugify(extracted.title)}-${rawContentHash.slice(0, 6)}`;
      const ideaRecord: DbIdea = {
        slug: ideaSlug,
        title: extracted.title,
        sector: extracted.sector,
        zoneCible: extracted.zoneCible,
        demarrageLevel: extracted.demarrageLevel,
        besoinIdentifie: extracted.besoinIdentifie,
        concept: extracted.concept,
        publicCible: extracted.publicCible,
        competencesCles: extracted.competencesCles,
        premiereAction: extracted.premiereAction,
        sourceInspirationId: source.id,
        contentHash: rawContentHash,
        metadata: {
          source_name: source.name,
          source_url: post.link,
          original_title: post.title,
          published_date: post.date
        }
      };

      const inserted = await insertIdea(ideaRecord);
      if (inserted) {
        totalNewIdeas++;
        console.log(`      ✅ Idée insérée en base :`);
        console.log(`         Titre : ${extracted.title}`);
        console.log(`         Secteur : ${extracted.sector}`);
        console.log(`         Niveau : ${extracted.demarrageLevel}`);
        console.log(`         1ère Action 48h : ${extracted.premiereAction}`);
      }
    }
  }

  console.log('\n==================================================');
  console.log('=== BILAN DU SCRAPING D\'IDÉES ===');
  console.log(`- Publications inspectées : ${totalProcessed}`);
  console.log(`- Déjà en base (0 token) : ${totalCached}`);
  console.log(`- Nouvelles idées créées : ${totalNewIdeas}`);
  console.log('==================================================');

  if (closePool) {
    await pool.end();
  }
}

if (process.argv[1]?.includes('scrape-ideas.ts')) {
  runIdeaScraper(true).catch(err => {
    console.error('[Ideas Scraper Fatal]', err);
    process.exit(1);
  });
}
