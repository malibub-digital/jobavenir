import dotenv from 'dotenv';
import crypto from 'crypto';
import { extractJobWithAI, ExtractedJob } from '../src/lib/ai-extractor';
import { pool, initDatabaseSchema } from '../src/lib/db';

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
  console.log('[Scraper] Téléchargement du fichier Google Sheets Master Sources...');
  const res = await fetch(GOOGLE_SHEET_CSV_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) {
    throw new Error(`Échec de récupération Google Sheets (${res.status})`);
  }

  const text = await res.text();
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

    const res = await fetch(endpoint, { headers });

    // 304 Not Modified -> Aucun changement sur la source distante
    if (res.status === 304) {
      return { modified: false, posts: [] };
    }

    if (!res.ok) {
      // Fallback sans filtre de catégories si l'API renvoie 400 (ex: catégories inexistantes sur ce site WP)
      if (res.status === 400) {
        const fallbackEndpoint = `${sourceUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=${limit}`;
        const fallbackRes = await fetch(fallbackEndpoint, { headers });
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
    console.error(`[Scraper] Erreur réseau lors du scraping ${sourceUrl}:`, e);
    return { modified: false, posts: [] };
  }
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

  const hasDb = Boolean(process.env.DATABASE_URL);
  if (hasDb) {
    await initDatabaseSchema();
  } else {
    console.log('[Notice] Mode sans PostgreSQL connecté (affichage console du résultat).');
  }

  const allSources = await fetchMasterSources();
  const activeSources = allSources.filter(s => s.statusTechnical === 'ACTIF_200');
  console.log(`[Scraper] ${activeSources.length} sources prêtes (Statut ACTIF_200).`);

  const batchSize = parseInt(process.env.SCRAPE_BATCH_SIZE || '10', 10);
  let targetBatch: SourceRow[] = [];

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

  let totalProcessed = 0;
  let totalNew = 0;
  let totalCached = 0;
  let totalSkippedHttp = 0;

  for (const source of targetBatch) {
    console.log(`\n--------------------------------------------------`);
    console.log(`[Source ${source.id}] ${source.name} (${source.url})`);

    // Scraping avec support HTTP Caching (ETag / Last-Modified)
    const scrapeRes = await scrapeWordPressSource(
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
        console.warn('      ⚠️ Échec d\'extraction IA pour cette annonce.');
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
              slug, title, company, location, contract_type, category, domain,
              salary, deadline, published_date, excerpt, description,
              original_url, original_source, source_id, how_to_apply,
              requirements, content_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (content_hash) DO UPDATE SET
              title = EXCLUDED.title,
              deadline = EXCLUDED.deadline,
              updated_at = NOW()`,
            [
              slug,
              extracted.title,
              extracted.company,
              extracted.location,
              extracted.contractType,
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
              hash
            ]
          );
          console.log('         💾 Sauvegardée dans PostgreSQL.');
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

