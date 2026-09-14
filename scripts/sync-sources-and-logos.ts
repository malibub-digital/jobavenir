import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { pool, isSqlite, initDatabaseSchema, getSourceById, updateSourceLogo } from '../src/lib/db';
import { resolveSourceLogo } from '../src/lib/source-logo-fetcher';

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
 * Télécharge le CSV du Google Sheet avec fallback local
 */
async function fetchSourcesCsv(): Promise<SourceRow[]> {
  const primaryCachePath = path.resolve(process.cwd(), 'src/data/sources_cache.csv');
  const legacyCachePath = path.resolve(process.cwd(), '.dev/sources_cache.csv');
  let text = '';

  console.log('[SyncSources] Téléchargement de l\'inventaire Google Sheets...');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(GOOGLE_SHEET_CSV_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/csv,text/plain;q=0.9,*/*;q=0.8'
        },
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
    } catch (netErr: any) {
      console.warn(`[SyncSources] Essai ${attempt}/3 : Erreur réseau (${netErr?.message || netErr}).`);
      if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!text) {
    if (fs.existsSync(primaryCachePath)) {
      console.log('[SyncSources] Utilisation du cache local (src/data/sources_cache.csv).');
      text = fs.readFileSync(primaryCachePath, 'utf-8');
    } else if (fs.existsSync(legacyCachePath)) {
      console.log('[SyncSources] Utilisation du cache local (.dev/sources_cache.csv).');
      text = fs.readFileSync(legacyCachePath, 'utf-8');
    } else {
      throw new Error('Impossible de charger les sources : aucun flux ni cache disponible.');
    }
  }

  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => l.includes('ID Source'));
  if (headerIdx === -1) throw new Error('En-tête "ID Source" introuvable dans le CSV.');

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

  return sources;
}

/**
 * Synchronise les sources dans la table SQL (Postgres / SQLite)
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

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const targetId = args.find((_, i) => args[i - 1] === '--id') || args.find(a => a.startsWith('SRC_'));
  const limitArg = args.find((_, i) => args[i - 1] === '--limit');
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  console.log('=== SYNCHRONISATION DES SOURCES ET GESTION DES LOGOS ===');
  console.log(`Mode BDD : ${isSqlite ? 'SQLite' : 'PostgreSQL'}`);
  if (force) console.log('Option --force activée : régénération même si logo_url existe déjà.');
  if (targetId) console.log(`Cible spécifique : ${targetId}`);

  await initDatabaseSchema();

  const allSources = await fetchSourcesCsv();
  console.log(`[SyncSources] ${allSources.length} sources lues depuis le fichier maître.`);

  // Filtrer sur les sources valides ayant une URL exploitable
  const validSources = allSources.filter(s => {
    const isStatusValid = s.statusTechnical === 'ACTIF_200' || s.statusTechnical === 'ACTIF_403';
    const hasUrl = s.url && s.url.startsWith('http');
    return isStatusValid && hasUrl;
  });

  console.log(`[SyncSources] ${validSources.length} sources valides détectées (ACTIF_200 / ACTIF_403 avec URL).`);

  // Enregistrer ou mettre à jour la configuration des sources en DB
  await syncSourcesToDb(validSources);
  console.log('[SyncSources] Configuration des sources synchronisée en base de données.');

  // Déterminer la liste à traiter pour les logos
  let sourcesToProcess = validSources;
  if (targetId) {
    sourcesToProcess = validSources.filter(s => s.id === targetId);
    if (sourcesToProcess.length === 0) {
      console.warn(`[SyncSources] Aucune source valide trouvée pour l'ID ${targetId}.`);
      process.exit(0);
    }
  }

  if (limit) {
    sourcesToProcess = sourcesToProcess.slice(0, limit);
  }

  console.log(`\nTraitement des logos pour ${sourcesToProcess.length} source(s)...`);

  let skippedCount = 0;
  let generatedCount = 0;

  for (const s of sourcesToProcess) {
    // Vérification de la présence du logo en DB
    const existing = await getSourceById(s.id);
    if (!force && existing && existing.logoUrl) {
      // Vérifier que le fichier existe physiquement sur le disque
      const localFilePath = path.join(process.cwd(), 'public', existing.logoUrl.replace(/^\//, ''));
      if (fs.existsSync(localFilePath)) {
        skippedCount++;
        continue;
      }
    }

    console.log(`\n▶ [${s.id}] ${s.name} (${s.url})`);
    console.log(`   Recherche de logo web ou création de logo de repli...`);

    try {
      const logoUrl = await resolveSourceLogo({
        id: s.id,
        name: s.name,
        url: s.url
      });

      await updateSourceLogo(s.id, logoUrl);
      console.log(`   ✅ Logo enregistré en base : ${logoUrl}`);
      generatedCount++;
    } catch (err: any) {
      console.error(`   ❌ Échec pour ${s.id}:`, err?.message || err);
    }
  }

  console.log('\n=== BILAN ===');
  console.log(`Sources traitées avec génération de logo : ${generatedCount}`);
  console.log(`Sources ignorées (logo déjà présent) : ${skippedCount}`);
  console.log('Terminé avec succès.');
  process.exit(0);
}

main().catch(err => {
  console.error('[SyncSources Fatal]', err);
  process.exit(1);
});
