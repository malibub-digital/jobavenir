import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { pool, queryDb, initDatabaseSchema, isSqlite } from '../src/lib/db';

const GOOGLE_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/16Nd67c8et6d5Ts2zsqcWO_mJb7jtfqV5XiO0cWS9Vu0/export?format=csv&gid=280735573';

interface SourceMasterRow {
  id: string;
  name: string;
  category: string;
  subCategory: string;
  url: string;
  statusTechnical: string;
  scraperType: string;
  frequency: string;
  description: string;
}

export async function fetchCsvContent(): Promise<string> {
  const primaryCachePath = path.resolve(process.cwd(), 'src/data/sources_cache.csv');
  const legacyCachePath = path.resolve(process.cwd(), '.dev/sources_cache.csv');
  let text = '';

  console.log('[SeedSources] Téléchargement depuis Google Sheets...');
  try {
    const res = await fetch(GOOGLE_SHEET_CSV_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/csv,text/plain;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) {
      text = await res.text();
      try {
        fs.mkdirSync(path.dirname(primaryCachePath), { recursive: true });
        fs.writeFileSync(primaryCachePath, text, 'utf-8');
      } catch (_) {}
    }
  } catch (err: any) {
    console.warn(`[SeedSources] Téléchargement direct échoué (${err.message}). Utilisation du cache local.`);
  }

  if (!text) {
    if (fs.existsSync(primaryCachePath)) {
      text = fs.readFileSync(primaryCachePath, 'utf-8');
    } else if (fs.existsSync(legacyCachePath)) {
      text = fs.readFileSync(legacyCachePath, 'utf-8');
    } else {
      throw new Error('Aucune source trouvée ni en ligne ni dans le cache.');
    }
  }

  return text;
}

export function parseSourcesCsv(csvText: string): SourceMasterRow[] {
  const lines = csvText.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => l.includes('ID Source'));
  if (headerIdx === -1) throw new Error('En-tête "ID Source" non trouvée.');

  const results: SourceMasterRow[] = [];

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
    const name = (parts[1] || '').replace(/^"|"$/g, '').trim();
    const category = (parts[2] || '').replace(/^"|"$/g, '').trim();
    const subCategory = (parts[3] || '').replace(/^"|"$/g, '').trim();
    const url = (parts[5] || '').replace(/^"|"$/g, '').trim();
    const statusTechnical = (parts[7] || '').replace(/^"|"$/g, '').trim();
    const scraperType = (parts[8] || '').replace(/^"|"$/g, '').trim();
    const frequency = (parts[9] || 'QUOTIDIEN').replace(/^"|"$/g, '').trim() || 'QUOTIDIEN';
    const description = (parts[10] || '').replace(/^"|"$/g, '').trim();

    if (id && id.startsWith('SRC_')) {
      results.push({
        id,
        name: name || id,
        category,
        subCategory,
        url: url && url !== '-' ? url : '',
        statusTechnical: statusTechnical || 'ACTIF_200',
        scraperType: scraperType || 'API_OU_DOM_MONITOR',
        frequency,
        description
      });
    }
  }

  return results;
}

export async function seedSourcesToDb() {
  await initDatabaseSchema();
  const csvText = await fetchCsvContent();
  const sources = parseSourcesCsv(csvText);

  console.log(`[SeedSources] Enregistrement de ${sources.length} sources dans la DB...`);
  let inserted = 0;
  let updated = 0;

  for (const s of sources) {
    const existing = await queryDb('SELECT id, is_active FROM sources WHERE id = $1', [s.id]);
    const isActive = s.statusTechnical.includes('ACTIF') ? 1 : 0;

    if (existing.rows.length === 0) {
      await queryDb(
        `INSERT INTO sources (
          id, name, category, sub_category, url, status_technical, 
          scraper_type, frequency, description, is_active, discovery_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OFFICIAL')`,
        [s.id, s.name, s.category, s.subCategory, s.url, s.statusTechnical, s.scraperType, s.frequency, s.description, isActive]
      );
      inserted++;
    } else {
      await queryDb(
        `UPDATE sources SET
          name = $2,
          category = $3,
          sub_category = $4,
          url = $5,
          status_technical = $6,
          scraper_type = $7,
          frequency = $8,
          description = COALESCE(NULLIF($9, ''), description)
        WHERE id = $1`,
        [s.id, s.name, s.category, s.subCategory, s.url, s.statusTechnical, s.scraperType, s.frequency, s.description]
      );
      updated++;
    }
  }

  console.log(`[SeedSources] Opération terminée : ${inserted} insérées, ${updated} mises à jour.`);
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('seed-sources')) {
  seedSourcesToDb().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
