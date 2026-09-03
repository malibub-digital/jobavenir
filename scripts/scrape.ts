import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractJobWithAI, ExtractedJob } from '../src/lib/ai-extractor';
import { pool, initDatabaseSchema, isSqlite, archiveExpiredJobs } from '../src/lib/db';

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
 * Télécharge et parse le CSV de l'inventaire Google Sheets
 */
async function fetchMasterSources(): Promise<SourceRow[]> {
  const primaryCachePath = path.resolve(process.cwd(), 'src/data/sources_cache.csv');
  const legacyCachePath = path.resolve(process.cwd(), '.dev/sources_cache.csv');
  let text = '';

  console.log('[Scraper] Téléchargement du fichier Google Sheets Master Sources...');

  // Tentative de téléchargement avec retry (jusqu'à 3 essais avec timeout progressif)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GOOGLE_SHEET_CSV_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/csv,text/plain;q=0.9,*/*;q=0.8'
        },
        signal: AbortSignal.timeout(20000)
      });
      if (res.ok) {
        text = await res.text();
        // Mettre à jour le cache
        try {
          const cacheDir = path.dirname(primaryCachePath);
          if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(primaryCachePath, text, 'utf-8');
        } catch (_) {}
        break;
      } else {
        throw new Error(`Code HTTP ${res.status}`);
      }
    } catch (netErr: any) {
      console.warn(`[Scraper] Tentative ${attempt}/3 : Réseau indisponible ou lent pour Google Sheets (${netErr?.message || netErr}).`);
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Si le téléchargement direct a échoué, on bascule sur le cache disponible
  if (!text) {
    if (fs.existsSync(primaryCachePath)) {
      console.log('[Scraper] Utilisation du fichier de cache de secours (src/data/sources_cache.csv).');
      text = fs.readFileSync(primaryCachePath, 'utf-8');
    } else if (fs.existsSync(legacyCachePath)) {
      console.log('[Scraper] Utilisation de la copie locale en cache (.dev/sources_cache.csv).');
      text = fs.readFileSync(legacyCachePath, 'utf-8');
    } else {
      throw new Error('Impossible de charger les sources : réseau inaccessible et aucun fichier de cache disponible.');
    }
  }

  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => l.includes('ID Source'));

  if (headerIdx === -1) {
    throw new Error('Ligne d\'en-tête "ID Source" non trouvée dans le CSV.');
  }

  const sources: SourceRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parsing CSV simple tenant compte des guillemets
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

    if (id && id.startsWith('SRC_')) {
      sources.push({
        id,
        name,
        category,
        subCategory,
        url,
        statusTechnical,
        scraperType
      });
    }
  }

  console.log(`[Scraper] ${sources.length} sources chargées depuis le Google Sheet.`);
  return sources;
}

/**
 * Synchronise les sources dans PostgreSQL sans écraser les métadonnées de scrape existantes
 */
async function syncSourcesToDb(sources: SourceRow[]) {
  for (const s of sources) {
    await pool.query(
      `INSERT INTO sources (id, name, category, sub_category, url, status_technical, scraper_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         sub_category = EXCLUDED.sub_category,
         url = EXCLUDED.url,
         status_technical = EXCLUDED.status_technical,
         scraper_type = EXCLUDED.scraper_type`,
      [s.id, s.name, s.category, s.subCategory, s.url, s.statusTechnical, s.scraperType]
    );
  }
}

/**
 * Récupère le prochain lot de sources à scraper selon last_scraped_at
 */
async function getNextBatchSources(batchSize: number): Promise<SourceRow[]> {
  const res = await pool.query(
    `SELECT 
       id, name, category, sub_category as "subCategory", url, 
       status_technical as "statusTechnical", scraper_type as "scraperType",
       etag, last_modified_header as "lastModifiedHeader"
     FROM sources
     WHERE status_technical = 'ACTIF_200'
     ORDER BY last_scraped_at ASC NULLS FIRST
     LIMIT $1`,
    [batchSize]
  );
  return res.rows;
}

/**
 * Parse un flux RSS ou Atom XML en publications standardisées
 */
function parseRssFeed(xmlText: string, limit = 5): Array<{ title: string; content: string; excerpt: string; link: string; date: string }> {
  const posts: Array<{ title: string; content: string; excerpt: string; link: string; date: string }> = [];
  
  // Support des balises <item> (RSS) et <entry> (Atom)
  const itemMatches = xmlText.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const itemXml of itemMatches.slice(0, limit)) {
    // Extraction du titre
    const rawTitle = (itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || '';
    const title = rawTitle.replace(/<[^>]+>/g, '').trim();

    // Extraction du lien
    let link = (itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1] || '';
    if (!link) {
      // Cas Atom : <link href="..." />
      const hrefMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefMatch) link = hrefMatch[1];
    }
    link = link.trim();

    // Extraction de la description / contenu complet
    const rawContent = (itemXml.match(/<(?:content:encoded|content|description)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:content:encoded|content|description)>/i) || [])[1] || '';
    const content = rawContent.trim();
    const cleanExcerpt = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

    // Extraction de la date
    const rawDate = (itemXml.match(/<(?:pubDate|published|updated)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:pubDate|published|updated)>/i) || [])[1] || '';
    let parsedDate = new Date().toISOString().split('T')[0];
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        parsedDate = d.toISOString().split('T')[0];
      }
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
 * Récupère les offres depuis un flux RSS ou Atom avec HTTP Caching
 */
async function scrapeRssSource(
  feedUrl: string,
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

    const res = await fetch(feedUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (res.status === 304) {
      return { modified: false, posts: [] };
    }
    if (!res.ok) {
      return { modified: false, posts: [] };
    }

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
 * Scraper HTML universel heuristique pour sites web sans API ni RSS direct
 */
async function scrapeGenericHtmlSource(
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

    const res = await fetch(sourceUrl, { headers, signal: AbortSignal.timeout(12000) });
    if (res.status === 304) {
      return { modified: false, posts: [] };
    }
    if (!res.ok) {
      return { modified: false, posts: [] };
    }

    const html = await res.text();
    const posts: Array<{ title: string; content: string; excerpt: string; link: string; date: string }> = [];
    const base = new URL(sourceUrl);

    // 1. Chercher les blocs d'articles / cartes d'offres
    const articleRegex = /<(?:article|div)[^>]*class=["'][^"']*(?:job|offre|post|item|annonce|article)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div)>/gi;
    let match;
    const seenLinks = new Set<string>();

    while ((match = articleRegex.exec(html)) !== null && posts.length < limit) {
      const block = match[1];
      const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;

      let href = linkMatch[1].trim();
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      if (href.startsWith('/')) {
        href = `${base.origin}${href}`;
      }

      let title = linkMatch[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 5) {
        const titleMatch = block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
        if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      if (title && title.length >= 8 && !seenLinks.has(href)) {
        seenLinks.add(href);
        const cleanContent = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        posts.push({
          title,
          content: cleanContent,
          excerpt: cleanContent.slice(0, 200),
          link: href,
          date: new Date().toISOString().split('T')[0]
        });
      }
    }

    // 2. Fallback si aucun bloc spécifique n'a été extrait : scanner les liens <a> avec mots-clés d'emploi
    if (posts.length === 0) {
      const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      while ((match = aRegex.exec(html)) !== null && posts.length < limit) {
        let href = match[1].trim();
        let anchorText = match[2].replace(/<[^>]+>/g, '').trim();
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || anchorText.length < 10) continue;

        const isOpportunityRelated = /(?:recrutement|emploi|offre|stage|formation|avis|concours|poste)/i.test(anchorText + ' ' + href);
        if (isOpportunityRelated && !seenLinks.has(href)) {
          if (href.startsWith('/')) href = `${base.origin}${href}`;
          seenLinks.add(href);
          posts.push({
            title: anchorText,
            content: anchorText,
            excerpt: anchorText,
            link: href,
            date: new Date().toISOString().split('T')[0]
          });
        }
      }
    }

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
 * Récupère les offres récentes depuis une source WordPress REST API
 * Supporte le HTTP Caching conditionnel (If-None-Match / If-Modified-Since)
 */
async function scrapeWordPressSource(
  sourceUrl: string,
  limit = 5,
  currentEtag?: string | null,
  currentLastModified?: string | null
): Promise<ScrapeResult> {
  try {
    const endpoint = `${sourceUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?categories=8,10,7,30,13&per_page=${limit}`;
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (currentEtag) {
      headers['If-None-Match'] = currentEtag;
    }
    if (currentLastModified) {
      headers['If-Modified-Since'] = currentLastModified;
    }

    const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(10000) });

    // 304 Not Modified -> Aucun changement sur la source distante
    if (res.status === 304) {
      return { modified: false, posts: [] };
    }

    if (!res.ok) {
      // Fallback sans filtre de catégories si l'API renvoie 400 (ex: catégories inexistantes sur ce site WP)
      if (res.status === 400) {
        const fallbackEndpoint = `${sourceUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=${limit}`;
        const fallbackRes = await fetch(fallbackEndpoint, { headers, signal: AbortSignal.timeout(10000) });
        if (!fallbackRes.ok) return { modified: false, posts: [] };
        const posts = await fallbackRes.json();
        return {
          modified: true,
          etag: fallbackRes.headers.get('etag'),
          lastModified: fallbackRes.headers.get('last-modified'),
          posts: Array.isArray(posts) ? posts.map((p: any) => ({
            title: p.title?.rendered || '',
            content: p.content?.rendered || '',
            excerpt: p.excerpt?.rendered || '',
            link: p.link,
            date: p.date?.split('T')?.[0] || new Date().toISOString().split('T')[0]
          })) : []
        };
      }
      return { modified: false, posts: [] };
    }

    const newEtag = res.headers.get('etag');
    const newLastModified = res.headers.get('last-modified');
    const posts = await res.json();

    return {
      modified: true,
      etag: newEtag,
      lastModified: newLastModified,
      posts: Array.isArray(posts) ? posts.map((p: any) => ({
        title: p.title?.rendered || '',
        content: p.content?.rendered || '',
        excerpt: p.excerpt?.rendered || '',
        link: p.link,
        date: p.date?.split('T')?.[0] || new Date().toISOString().split('T')[0]
      })) : []
    };
  } catch (e) {
    return { modified: false, posts: [] };
  }
}

/**
 * Routeur de scraping multi-stratégie pour une source :
 * 1. Test WordPress REST API
 * 2. Si échec / 404, détection de flux RSS standard (/feed, /rss.xml)
 * 3. Si échec, extraction HTML générique heuristique
 */
async function scrapeUnifiedSource(
  sourceUrl: string,
  limit = 5,
  currentEtag?: string | null,
  currentLastModified?: string | null
): Promise<ScrapeResult> {
  const cleanUrl = sourceUrl.replace(/\/$/, '');

  // Stratégie 1 : WordPress REST API
  const wpRes = await scrapeWordPressSource(cleanUrl, limit, currentEtag, currentLastModified);
  if (!wpRes.modified || (wpRes.posts && wpRes.posts.length > 0)) {
    return wpRes;
  }

  // Stratégie 2 : Détection RSS / Atom
  for (const feedPath of ['/feed', '/rss.xml', '/feed/', '/rss']) {
    const feedRes = await scrapeRssSource(`${cleanUrl}${feedPath}`, limit, currentEtag, currentLastModified);
    if (!feedRes.modified || (feedRes.posts && feedRes.posts.length > 0)) {
      return feedRes;
    }
  }

  // Stratégie 3 : Scraper HTML Générique
  return await scrapeGenericHtmlSource(cleanUrl, limit, currentEtag, currentLastModified);
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
 * Point d'entrée du scraper (appelable par cron ou en CLI standalone)
 */
export async function runScraper(closePool = false) {
  console.log('=== DÉMARRAGE DU SCRAPER JOBAVENIR ===');
  console.log(`Modèle IA configuré : ${process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat'}`);

  const hasDb = true;
  await initDatabaseSchema();
  if (isSqlite) {
    console.log('[Notice] Mode SQLite actif pour le développement local (.dev/jobavenir.sqlite).');
  } else {
    console.log('[Notice] Connexion PostgreSQL active.');
  }

  // Nettoyage et archivage automatique du cycle de vie des offres expirées
  if (hasDb) {
    const expiredCount = await archiveExpiredJobs();
    if (expiredCount > 0) {
      console.log(`[Scraper] 🧹 Cycle de vie : ${expiredCount} offre(s) expirée(s) désactivée(s).`);
    }
  }

  const allSources = await fetchMasterSources();
  const activeSources = allSources.filter(s => s.statusTechnical === 'ACTIF_200');
  console.log(`[Scraper] ${activeSources.length} sources prêtes (Statut ACTIF_200).`);

  const cliSourceId = process.argv[2]?.startsWith('SRC_') ? process.argv[2] : null;
  const batchSize = parseInt(process.env.SCRAPE_BATCH_SIZE || '10', 10);
  let targetBatch: SourceRow[] = [];

  if (cliSourceId) {
    const found = activeSources.find(s => s.id === cliSourceId) || allSources.find(s => s.id === cliSourceId);
    if (found) {
      targetBatch = [found];
      console.log(`[Scraper] 🎯 Source ciblée par CLI : ${found.name} (${found.id}) - ${found.url}`);
    } else {
      console.warn(`[Scraper] Source ${cliSourceId} introuvable dans l'inventaire.`);
    }
  }

  if (targetBatch.length === 0) {
    if (hasDb) {
      // 1. Synchronisation de l'inventaire en base
      await syncSourcesToDb(activeSources);
      // 2. Échelonnement : sélection du lot prioritaire (sources jamais scrapées ou les plus anciennes)
      targetBatch = await getNextBatchSources(batchSize);
      console.log(`[Scraper] Lot sélectionné : ${targetBatch.length} sources prioritaires (taille lot = ${batchSize}).`);
    } else {
      // Mode local / démo sans DB : prendre la première source WP (SRC_017 MaliTravail ou similaire)
      const demoSource = activeSources.find(s => s.id === 'SRC_017') || activeSources[0];
      targetBatch = [demoSource];
      console.log(`[Scraper] Mode démo : traitement ciblé sur ${demoSource.name} (${demoSource.id}).`);
    }
  }

  let totalProcessed = 0;
  let totalNew = 0;
  let totalCached = 0;
  let totalSkippedHttp = 0;

  for (const source of targetBatch) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[Source ${source.id}] ${source.name} (${source.url})`);

    // Scraping multi-stratégie (WP REST API -> Flux RSS/Atom -> Extracteur HTML heuristique)
    const scrapeRes = await scrapeUnifiedSource(
      source.url,
      5,
      source.etag,
      source.lastModifiedHeader
    );

    if (!scrapeRes.modified) {
      console.log(`⚡ HTTP 304 / Aucun changement détecté pour ${source.name} (0 transfert, 0 token).`);
      totalSkippedHttp++;
      if (hasDb) {
        await pool.query(
          `UPDATE sources SET last_scraped_at = NOW(), failure_count = 0 WHERE id = $1`,
          [source.id]
        );
      }
      continue;
    }

    // Mise à jour des métadonnées HTTP de la source
    if (hasDb) {
      await pool.query(
        `UPDATE sources SET 
           last_scraped_at = NOW(), 
           etag = $2, 
           last_modified_header = $3,
           failure_count = 0 
         WHERE id = $1`,
        [source.id, scrapeRes.etag || null, scrapeRes.lastModified || null]
      );
    }

    const rawPosts = scrapeRes.posts;
    console.log(`[Scraper] ${rawPosts.length} publications récupérées. Vérification pré-LLM...`);

    for (const post of rawPosts) {
      totalProcessed++;
      const rawContent = `${post.title}\n\n${post.content}`;
      // Hash canonique strict combinant URL et titre
      const hash = crypto.createHash('sha256').update(post.link + post.title).digest('hex');

      // Garde-fou 1 : Vérification pré-LLM en base de données (0 token consommé si déjà connu)
      if (hasDb) {
        const existing = await pool.query('SELECT id FROM jobs WHERE content_hash = $1 LIMIT 1', [hash]);
        if (existing.rows.length > 0) {
          console.log(`   ⏭️ Déjà en base (${hash.slice(0, 8)}) : "${post.title.slice(0, 45)}..." [0 token]`);
          totalCached++;
          continue;
        }
      }

      console.log(`   ✨ Nouvelle annonce détectée : "${post.title.slice(0, 60)}..."`);
      console.log('      -> Envoi au LLM pour structuration...');
      const extracted = await extractJobWithAI(rawContent, post.title);

      if (!extracted) {
        console.log('      ⏩ Annonce ignorée (non retenue par le filtre de pertinence).');
        continue;
      }

      totalNew++;
      console.log('      ✅ Offre structurée :');
      console.log(`         Titre        : ${extracted.title}`);
      console.log(`         Entreprise   : ${extracted.company}`);
      console.log(`         Lieu         : ${extracted.location}`);
      console.log(`         Type contrat : ${extracted.contractType}`);
      console.log(`         Date limite  : ${extracted.deadline || 'Non spécifiée'}`);

      if (hasDb) {
        const slug = `${slugify(extracted.title)}-${hash.slice(0, 6)}`;
        try {
          await pool.query(
            `INSERT INTO jobs (
              slug, title, company, location, contract_type, opportunity_type, category, domain,
              salary, deadline, published_date, excerpt, description,
              original_url, original_source, source_id, how_to_apply,
              requirements, metadata, content_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (content_hash) DO UPDATE SET
              title = EXCLUDED.title,
              opportunity_type = EXCLUDED.opportunity_type,
              deadline = EXCLUDED.deadline,
              updated_at = NOW()`,
            [
              slug,
              extracted.title,
              extracted.company || 'Organisme Partenaire',
              extracted.location || 'Bamako, Mali',
              extracted.contractType || 'Autre',
              extracted.opportunityType || (extracted.contractType === 'Stage' || extracted.contractType === 'Apprentissage' ? 'STAGE' : 'JOB'),
              extracted.category,
              extracted.domain || null,
              extracted.salary || null,
              extracted.deadline || null,
              extracted.publishedDate || post.date,
              extracted.excerpt,
              post.content,
              post.link,
              source.name,
              source.id,
              extracted.howToApply || null,
              JSON.stringify(extracted.requirements || []),
              JSON.stringify(extracted.metadata || {}),
              hash
            ]
          );
          console.log(`         💾 Sauvegardée en base (${isSqlite ? 'SQLite' : 'PostgreSQL'}).`);
        } catch (dbErr) {
          console.error('         ❌ Erreur insertion DB:', dbErr);
        }
      }
    }
  }

  console.log('\n==================================================');
  console.log('=== BILAN DE PERFORMANCE DU RUN ===');
  console.log(`- Sources inspectées           : ${targetBatch.length}`);
  console.log(`- Sources économisées via HTTP : ${totalSkippedHttp} (HTTP 304)`);
  console.log(`- Annonces déjà en base        : ${totalCached} (0 token dépensé)`);
  console.log(`- Nouvelles annonces traitées  : ${totalNew}`);
  console.log('==================================================');

  if (hasDb && closePool) {
    await pool.end();
  }
}

// Exécution directe si appelé en CLI
if (process.argv[1]?.includes('scrape.ts')) {
  runScraper(true).catch(err => {
    console.error('[Scraper Fatal]', err);
    process.exit(1);
  });
}

