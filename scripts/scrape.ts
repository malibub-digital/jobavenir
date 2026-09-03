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
 * Récupère les offres récentes depuis une source WordPress REST API (ex: MaliTravail)
 */
async function scrapeWordPressSource(sourceUrl: string, limit = 3) {
  try {
    // Filtrer directement sur les catégories d'offres réelles (ex: 8: Emploi, 10: Stage, 7: Concours)
    const endpoint = `${sourceUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts?categories=8,10,7,30,13&per_page=${limit}`;
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (!res.ok) return [];

    const posts = await res.json();
    return posts.map((p: any) => ({
      title: p.title?.rendered || '',
      content: p.content?.rendered || '',
      excerpt: p.excerpt?.rendered || '',
      link: p.link,
      date: p.date?.split('T')?.[0] || new Date().toISOString().split('T')[0]
    }));
  } catch (e) {
    console.error(`[Scraper] Erreur lors du scraping WP ${sourceUrl}:`, e);
    return [];
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
  console.log(`Modèle configuré : ${process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat'}`);

  const hasDb = Boolean(process.env.DATABASE_URL);
  if (hasDb) {
    await initDatabaseSchema();
  } else {
    console.log('[Notice] Mode sans PostgreSQL connecté (affichage console du résultat).');
  }

  const allSources = await fetchMasterSources();
  const activeSources = allSources.filter(s => s.statusTechnical === 'ACTIF_200');
  console.log(`[Scraper] ${activeSources.length} sources prêtes (Statut ACTIF_200).`);

  // Sélection pour l'ingestion : MaliTravail (SRC_017)
  const targetSource = activeSources.find(s => s.id === 'SRC_017') || activeSources[0];
  console.log(`\n[Scraper] Exécution sur la source : ${targetSource.name} (${targetSource.url})`);

  if (hasDb) {
    // Garantir que la source existe dans la table sources (contrainte de clé étrangère)
    await pool.query(
      `INSERT INTO sources (id, name, category, sub_category, url, status_technical, scraper_type, last_scraped_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         url = EXCLUDED.url,
         last_scraped_at = NOW()`,
      [
        targetSource.id,
        targetSource.name,
        targetSource.category,
        targetSource.subCategory,
        targetSource.url,
        targetSource.statusTechnical,
        targetSource.scraperType
      ]
    );
  }

  // Récupération des 5 dernières annonces
  const rawPosts = await scrapeWordPressSource(targetSource.url, 5);
  console.log(`[Scraper] ${rawPosts.length} publications récupérées. Démarrage de l'analyse IA...\n`);

  for (const post of rawPosts) {
    const rawContent = `${post.title}\n\n${post.content}`;
    const hash = crypto.createHash('sha256').update(post.link + rawContent).digest('hex');

    console.log(`-> Analyse de l'annonce : "${post.title}"...`);
    const extracted = await extractJobWithAI(rawContent, post.title);

    if (!extracted) {
      console.warn('   ⚠️ Échec d\'extraction IA pour cette annonce.');
      continue;
    }

    console.log('   ✅ Offre structurée avec succès :');
    console.log(`      Titre        : ${extracted.title}`);
    console.log(`      Entreprise   : ${extracted.company}`);
    console.log(`      Lieu         : ${extracted.location}`);
    console.log(`      Type contrat : ${extracted.contractType}`);
    console.log(`      Date limite  : ${extracted.deadline || 'Non spécifiée'}`);
    console.log(`      Résumé       : ${extracted.excerpt}`);

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
            targetSource.name,
            targetSource.id,
            extracted.howToApply || null,
            JSON.stringify(extracted.requirements || []),
            hash
          ]
        );
        console.log('   💾 Sauvegardée en base de données PostgreSQL.');
      } catch (dbErr) {
        console.error('   ❌ Erreur d\'insertion en base:', dbErr);
      }
    }
  }

  if (hasDb && closePool) {
    await pool.end();
  }

  console.log('\n=== FIN DU CYCLE DE SCRAPING ===');
}

// Exécution directe si appelé en CLI
if (process.argv[1]?.includes('scrape.ts')) {
  runScraper(true).catch(err => {
    console.error('[Scraper Fatal]', err);
    process.exit(1);
  });
}

