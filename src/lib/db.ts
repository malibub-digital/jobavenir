import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

export const isSqlite = !process.env.DATABASE_URL || 
  process.env.DATABASE_URL.startsWith('sqlite:') || 
  process.env.DATABASE_URL.endsWith('.sqlite') || 
  process.env.DATABASE_URL.endsWith('.db');

let sqliteDbInstance: any = null;

function getSqlitePath(): string {
  if (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('sqlite:') || process.env.DATABASE_URL.endsWith('.sqlite') || process.env.DATABASE_URL.endsWith('.db'))) {
    return process.env.DATABASE_URL.replace(/^sqlite:\/\//, '').replace(/^sqlite:/, '');
  }
  const defaultDir = path.resolve(process.cwd(), '.dev');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return path.resolve(defaultDir, 'jobavenir.sqlite');
}

export async function getSqliteDb(): Promise<any> {
  if (!sqliteDbInstance) {
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = getSqlitePath();
    sqliteDbInstance = new DatabaseSync(dbPath);
    sqliteDbInstance.exec('PRAGMA journal_mode = WAL;');
    sqliteDbInstance.exec('PRAGMA foreign_keys = ON;');
  }
  return sqliteDbInstance;
}

// Pool PostgreSQL natif (uniquement instancié si DATABASE_URL est postgresql://)
export const pool = !isSqlite ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
}) : ({
  query: async (text: string, params: any[] = []) => {
    return queryDb(text, params);
  },
  connect: async () => {
    return {
      query: async (text: string, params: any[] = []) => queryDb(text, params),
      release: () => {}
    };
  },
  end: async () => {
    if (sqliteDbInstance) {
      sqliteDbInstance.close();
      sqliteDbInstance = null;
    }
  }
} as any);

const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    sub_category TEXT,
    url TEXT NOT NULL,
    status_technical TEXT,
    scraper_type TEXT,
    frequency TEXT DEFAULT 'QUOTIDIEN',
    last_scraped_at TEXT,
    etag TEXT,
    last_modified_header TEXT,
    failure_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'Organisme Partenaire',
    location TEXT NOT NULL DEFAULT 'Bamako, Mali',
    contract_type TEXT NOT NULL DEFAULT 'Autre',
    opportunity_type TEXT NOT NULL DEFAULT 'JOB',
    category TEXT DEFAULT 'Général',
    domain TEXT,
    salary TEXT,
    deadline TEXT,
    published_date TEXT NOT NULL DEFAULT CURRENT_DATE,
    featured INTEGER DEFAULT 0,
    excerpt TEXT NOT NULL,
    description TEXT,
    original_url TEXT,
    original_source TEXT DEFAULT 'Partenaire JobAvenir',
    source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    how_to_apply TEXT,
    requirements TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    content_hash TEXT UNIQUE,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_published_date ON jobs(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_contract_type ON jobs(contract_type);
CREATE INDEX IF NOT EXISTS idx_jobs_opportunity_type ON jobs(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);
`;

const PG_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    sub_category VARCHAR(100),
    url TEXT NOT NULL,
    status_technical VARCHAR(50),
    scraper_type VARCHAR(50),
    frequency VARCHAR(50) DEFAULT 'QUOTIDIEN',
    last_scraped_at TIMESTAMP WITH TIME ZONE,
    etag TEXT,
    last_modified_header TEXT,
    failure_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sources ADD COLUMN IF NOT EXISTS etag TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_modified_header TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS failure_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL DEFAULT 'Organisme Partenaire',
    location VARCHAR(255) NOT NULL DEFAULT 'Bamako, Mali',
    contract_type VARCHAR(50) NOT NULL DEFAULT 'Autre',
    opportunity_type VARCHAR(50) NOT NULL DEFAULT 'JOB',
    category VARCHAR(100) DEFAULT 'Général',
    domain VARCHAR(100),
    salary VARCHAR(100),
    deadline VARCHAR(100),
    published_date DATE NOT NULL DEFAULT CURRENT_DATE,
    featured BOOLEAN DEFAULT FALSE,
    excerpt TEXT NOT NULL,
    description TEXT,
    original_url TEXT,
    original_source VARCHAR(255) DEFAULT 'Partenaire JobAvenir',
    source_id VARCHAR(50) REFERENCES sources(id) ON DELETE SET NULL,
    how_to_apply TEXT,
    requirements JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    content_hash VARCHAR(64) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS opportunity_type VARCHAR(50) DEFAULT 'JOB';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_jobs_published_date ON jobs(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_contract_type ON jobs(contract_type);
CREATE INDEX IF NOT EXISTS idx_jobs_opportunity_type ON jobs(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);
`;

/**
 * Exécute une requête SQL de manière transparente sur SQLite ou PostgreSQL
 */
export async function queryDb(sql: string, params: any[] = []): Promise<{ rows: any[], rowCount: number }> {
  if (!isSqlite) {
    const res = await pool.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
  }

  const db = await getSqliteDb();

  // Adapter les requêtes PostgreSQL spécifiques vers SQLite
  let sqliteSql = sql
    // Remplacement des paramètres positionnels $1, $2, etc. par ?
    .replace(/\$(\d+)/g, '?')
    // NOW() -> datetime('now')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // to_char(published_date, 'YYYY-MM-DD') -> strftime('%Y-%m-%d', published_date)
    .replace(/to_char\s*\(\s*published_date\s*,\s*'YYYY-MM-DD'\s*\)/gi, "strftime('%Y-%m-%d', published_date)")
    // EXCLUDED.field -> excluded.field
    .replace(/EXCLUDED\./g, "excluded.")
    // '[]'::jsonb ou '{}'::jsonb
    .replace(/::jsonb/gi, '')
    // NULLS FIRST n'est pas nécessaire ou géré en SQLite de base
    .replace(/NULLS FIRST/gi, '');

  const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sqliteSql);

  try {
    const stmt = db.prepare(sqliteSql);
    if (isSelect) {
      const rows = stmt.all(...params);
      return { rows: rows as any[], rowCount: rows.length };
    } else {
      const info = stmt.run(...params);
      return { rows: [], rowCount: Number(info.changes || 0) };
    }
  } catch (err) {
    console.error('[DB-SQLite Error]', err, 'SQL:', sqliteSql, 'Params:', params);
    throw err;
  }
}

/**
 * Initialise le schéma de la base de données (SQLite en local ou PostgreSQL en production)
 */
export async function initDatabaseSchema() {
  if (isSqlite) {
    const db = await getSqliteDb();
    db.exec(SQLITE_SCHEMA_SQL);
    console.log(`[DB] Schéma SQLite initialisé avec succès (${getSqlitePath()}).`);
    return;
  }

  const client = await pool.connect();
  try {
    const schemaPath = path.resolve(process.cwd(), '.dev/schema.sql');
    let sql = PG_SCHEMA_SQL;
    if (fs.existsSync(schemaPath)) {
      sql = fs.readFileSync(schemaPath, 'utf-8');
    }
    await client.query(sql);
    console.log('[DB] Schéma PostgreSQL initialisé avec succès.');
  } catch (err) {
    console.error('[DB] Erreur lors de l\'initialisation du schéma PG:', err);
  } finally {
    client.release();
  }
}

export interface DbJob {
  slug: string;
  title: string;
  company: string;
  location: string;
  contractType: string;
  opportunityType?: string;
  category: string;
  domain?: string;
  salary?: string;
  deadline?: string;
  publishedDate: string;
  featured: boolean;
  excerpt: string;
  description?: string;
  originalUrl?: string;
  originalSource: string;
  howToApply?: string;
  requirements?: string[];
  metadata?: Record<string, any>;
}

/**
 * Récupère les offres depuis SQLite ou PostgreSQL
 */
export async function getAllDbJobs(): Promise<DbJob[]> {
  try {
    const res = await queryDb(`
      SELECT 
        slug, title, company, location,
        contract_type as "contractType",
        COALESCE(opportunity_type, 'JOB') as "opportunityType",
        category, domain, salary, deadline,
        to_char(published_date, 'YYYY-MM-DD') as "publishedDate",
        featured, excerpt, description,
        original_url as "originalUrl",
        original_source as "originalSource",
        how_to_apply as "howToApply",
        requirements,
        COALESCE(metadata, '{}'::jsonb) as "metadata"
      FROM jobs
      WHERE is_active = true
      ORDER BY published_date DESC, id DESC
    `);
    
    return res.rows.map(r => ({
      ...r,
      featured: Boolean(r.featured),
      requirements: typeof r.requirements === 'string' ? JSON.parse(r.requirements || '[]') : (r.requirements || []),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {})
    }));
  } catch (err) {
    console.warn('[DB] Impossible de récupérer les offres SQL:', err);
    return [];
  }
}

/**
 * Retourne les offres dynamiques unifiées
 */
export async function getUnifiedJobs(): Promise<any[]> {
  const dbJobs = await getAllDbJobs();
  return dbJobs.map(j => ({
    slug: j.slug,
    body: j.description || '',
    data: {
      title: j.title,
      company: j.company,
      location: j.location,
      contractType: j.contractType,
      opportunityType: j.opportunityType || 'JOB',
      category: j.category,
      domain: j.domain,
      salary: j.salary,
      deadline: j.deadline,
      publishedDate: j.publishedDate,
      featured: j.featured,
      excerpt: j.excerpt,
      originalUrl: j.originalUrl,
      originalSource: j.originalSource,
      howToApply: j.howToApply,
      requirements: Array.isArray(j.requirements) ? j.requirements : [],
      metadata: j.metadata || {}
    }
  }));
}

/**
 * Récupère une offre spécifique par son slug
 */
export async function getJobBySlug(slug: string): Promise<any | null> {
  try {
    const res = await queryDb(`
      SELECT 
        slug, title, company, location,
        contract_type as "contractType",
        COALESCE(opportunity_type, 'JOB') as "opportunityType",
        category, domain, salary, deadline,
        to_char(published_date, 'YYYY-MM-DD') as "publishedDate",
        featured, excerpt, description,
        original_url as "originalUrl",
        original_source as "originalSource",
        how_to_apply as "howToApply",
        requirements,
        COALESCE(metadata, '{}'::jsonb) as "metadata"
      FROM jobs
      WHERE slug = $1 AND is_active = true
      LIMIT 1
    `, [slug]);

    if (res.rows.length === 0) return null;
    const j = res.rows[0];
    const requirements = typeof j.requirements === 'string' ? JSON.parse(j.requirements || '[]') : (j.requirements || []);
    const metadata = typeof j.metadata === 'string' ? JSON.parse(j.metadata || '{}') : (j.metadata || {});

    return {
      slug: j.slug,
      body: j.description || '',
      data: {
        title: j.title,
        company: j.company,
        location: j.location,
        contractType: j.contractType,
        opportunityType: j.opportunityType || 'JOB',
        category: j.category,
        domain: j.domain,
        salary: j.salary,
        deadline: j.deadline,
        publishedDate: j.publishedDate,
        featured: Boolean(j.featured),
        excerpt: j.excerpt,
        originalUrl: j.originalUrl,
        originalSource: j.originalSource,
        howToApply: j.howToApply,
        requirements: Array.isArray(requirements) ? requirements : [],
        metadata: metadata
      }
    };
  } catch (err) {
    console.warn('[DB] Erreur getJobBySlug:', err);
    return null;
  }
}

/**
 * Archive automatiquement les offres dont la date limite est échue (deadline < CURRENT_DATE)
 * Retourne le nombre d'offres archivées.
 */
export async function archiveExpiredJobs(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Les deadlines peuvent être au format 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss' ou 'DD/MM/YYYY'
    // Pour assurer une compatibilité optimale sous SQLite et PostgreSQL :
    // 1. On sélectionne les offres actives avec une deadline renseignée
    const res = await queryDb(`
      SELECT id, deadline FROM jobs 
      WHERE is_active = true 
        AND deadline IS NOT NULL 
        AND deadline != ''
    `);

    const expiredIds: number[] = [];

    for (const row of res.rows) {
      const deadlineStr = String(row.deadline).trim();
      let deadlineDate: Date | null = null;

      // Format ISO standard : 2026-09-01
      if (/^\d{4}-\d{2}-\d{2}/.test(deadlineStr)) {
        deadlineDate = new Date(deadlineStr.slice(0, 10));
      } 
      // Format FR courant : 31/12/2026 ou 31-12-2026
      else if (/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/.test(deadlineStr)) {
        const parts = deadlineStr.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        if (parts) {
          deadlineDate = new Date(`${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
        }
      }

      if (deadlineDate && !isNaN(deadlineDate.getTime())) {
        const isoDeadline = deadlineDate.toISOString().split('T')[0];
        if (isoDeadline < today) {
          expiredIds.push(row.id);
        }
      }
    }

    if (expiredIds.length > 0) {
      for (const id of expiredIds) {
        await queryDb(`UPDATE jobs SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
      }
      console.log(`[DB] 🧹 Cycle de vie : ${expiredIds.length} offre(s) expirée(s) archivée(s) (is_active = false).`);
    }

    return expiredIds.length;
  } catch (err) {
    console.error('[DB] Erreur lors de l\'archivage des offres expirées:', err);
    return 0;
  }
}
