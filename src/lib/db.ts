import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { generateSocialTexts, calculateDefaultSocialPublishAt } from './social-generator';

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
    description TEXT,
    is_active INTEGER DEFAULT 1,
    discovery_status TEXT DEFAULT 'OFFICIAL',
    last_scraped_at TEXT,
    etag TEXT,
    last_modified_header TEXT,
    failure_count INTEGER DEFAULT 0,
    logo_url TEXT,
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
    social_publish_at TEXT,
    social_status TEXT DEFAULT 'SCHEDULED',
    social_whatsapp TEXT,
    social_telegram TEXT,
    social_tiktok TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_published_date ON jobs(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_contract_type ON jobs(contract_type);
CREATE INDEX IF NOT EXISTS idx_jobs_opportunity_type ON jobs(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);

CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    sector TEXT NOT NULL,
    zone_cible TEXT DEFAULT 'Bamako, Mali',
    demarrage_level TEXT NOT NULL,
    besoin_identifie TEXT NOT NULL,
    concept TEXT NOT NULL,
    public_cible TEXT NOT NULL,
    competences_cles TEXT DEFAULT '[]',
    premiere_action TEXT NOT NULL,
    source_inspiration_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
    is_active INTEGER DEFAULT 1,
    social_publish_at TEXT,
    social_status TEXT DEFAULT 'SCHEDULED',
    social_whatsapp TEXT,
    social_telegram TEXT,
    social_tiktok TEXT,
    content_hash TEXT UNIQUE,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ideas_sector ON ideas(sector);
CREATE INDEX IF NOT EXISTS idx_ideas_demarrage_level ON ideas(demarrage_level);
CREATE INDEX IF NOT EXISTS idx_ideas_is_active ON ideas(is_active);
CREATE INDEX IF NOT EXISTS idx_ideas_content_hash ON ideas(content_hash);
CREATE INDEX IF NOT EXISTS idx_ideas_slug ON ideas(slug);
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
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    discovery_status VARCHAR(50) DEFAULT 'OFFICIAL',
    last_scraped_at TIMESTAMP WITH TIME ZONE,
    etag TEXT,
    last_modified_header TEXT,
    failure_count INT DEFAULT 0,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sources ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS discovery_status VARCHAR(50) DEFAULT 'OFFICIAL';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS etag TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_modified_header TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS failure_count INT DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS logo_url TEXT;

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
    social_publish_at TIMESTAMP WITH TIME ZONE,
    social_status VARCHAR(50) DEFAULT 'SCHEDULED',
    social_whatsapp TEXT,
    social_telegram TEXT,
    social_tiktok TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS opportunity_type VARCHAR(50) DEFAULT 'JOB';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS social_publish_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS social_status VARCHAR(50) DEFAULT 'SCHEDULED';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS social_whatsapp TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS social_telegram TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS social_tiktok TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_published_date ON jobs(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_contract_type ON jobs(contract_type);
CREATE INDEX IF NOT EXISTS idx_jobs_opportunity_type ON jobs(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);

CREATE TABLE IF NOT EXISTS ideas (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    sector VARCHAR(100) NOT NULL,
    zone_cible VARCHAR(100) DEFAULT 'Bamako, Mali',
    demarrage_level VARCHAR(50) NOT NULL,
    besoin_identifie TEXT NOT NULL,
    concept TEXT NOT NULL,
    public_cible TEXT NOT NULL,
    competences_cles JSONB DEFAULT '[]'::jsonb,
    premiere_action TEXT NOT NULL,
    source_inspiration_id VARCHAR(50) REFERENCES sources(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    social_publish_at TIMESTAMP WITH TIME ZONE,
    social_status VARCHAR(50) DEFAULT 'SCHEDULED',
    social_whatsapp TEXT,
    social_telegram TEXT,
    social_tiktok TEXT,
    content_hash VARCHAR(64) UNIQUE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS social_publish_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS social_status VARCHAR(50) DEFAULT 'SCHEDULED';
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS social_whatsapp TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS social_telegram TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS social_tiktok TEXT;

CREATE INDEX IF NOT EXISTS idx_ideas_sector ON ideas(sector);
CREATE INDEX IF NOT EXISTS idx_ideas_demarrage_level ON ideas(demarrage_level);
CREATE INDEX IF NOT EXISTS idx_ideas_is_active ON ideas(is_active);
CREATE INDEX IF NOT EXISTS idx_ideas_content_hash ON ideas(content_hash);
CREATE INDEX IF NOT EXISTS idx_ideas_slug ON ideas(slug);
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

  // Adapter les requêtes PostgreSQL spécifiques vers SQLite en respectant l'ordre des paramètres positionnels
  const paramIndices: number[] = [];
  let sqliteSql = sql
    // Détecte les $1, $2 et enregistre leur ordre d'apparition
    .replace(/\$(\d+)/g, (_, idx) => {
      paramIndices.push(parseInt(idx, 10) - 1);
      return '?';
    })
    // NOW() -> datetime('now')
    .replace(/\bNOW\(\)/gi, "datetime('now')")
    // to_char(published_date, 'YYYY-MM-DD') ou to_char(j.published_date, 'YYYY-MM-DD') -> strftime('%Y-%m-%d', ...)
    .replace(/to_char\s*\(\s*([a-zA-Z0-9_.]+)\s*,\s*'YYYY-MM-DD'\s*\)/gi, "strftime('%Y-%m-%d', $1)")
    // EXCLUDED.field -> excluded.field
    .replace(/EXCLUDED\./g, "excluded.")
    // '[]'::jsonb ou '{}'::jsonb
    .replace(/::jsonb/gi, '')
    // NULLS FIRST n'est pas nécessaire ou géré en SQLite de base
    .replace(/NULLS FIRST/gi, '');

  const reorderedParams = (paramIndices.length > 0 
    ? paramIndices.map(i => params[i]) 
    : params).map(val => (typeof val === 'boolean' ? (val ? 1 : 0) : val));

  const isSelect = /^\s*(SELECT|PRAGMA)/i.test(sqliteSql);

  try {
    const stmt = db.prepare(sqliteSql);
    if (isSelect) {
      const rows = stmt.all(...reorderedParams);
      return { rows: rows as any[], rowCount: rows.length };
    } else {
      const info = stmt.run(...reorderedParams);
      return { rows: [], rowCount: Number(info.changes || 0) };
    }
  } catch (err) {
    console.error('[DB-SQLite Error]', err, 'SQL:', sqliteSql, 'Params:', reorderedParams);
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
    try {
      const sourceCols = db.prepare("PRAGMA table_info(sources)").all();
      const sourceColNames = sourceCols.map((c: any) => c.name);
      if (!sourceColNames.includes('logo_url')) {
        db.exec("ALTER TABLE sources ADD COLUMN logo_url TEXT;");
      }
      if (!sourceColNames.includes('description')) {
        db.exec("ALTER TABLE sources ADD COLUMN description TEXT;");
      }
      if (!sourceColNames.includes('is_active')) {
        db.exec("ALTER TABLE sources ADD COLUMN is_active INTEGER DEFAULT 1;");
      }
      if (!sourceColNames.includes('discovery_status')) {
        db.exec("ALTER TABLE sources ADD COLUMN discovery_status TEXT DEFAULT 'OFFICIAL';");
      }

      const jobCols = db.prepare("PRAGMA table_info(jobs)").all();
      const jobColNames = jobCols.map((c: any) => c.name);
      if (!jobColNames.includes('social_publish_at')) db.exec("ALTER TABLE jobs ADD COLUMN social_publish_at TEXT;");
      if (!jobColNames.includes('social_status')) db.exec("ALTER TABLE jobs ADD COLUMN social_status TEXT DEFAULT 'SCHEDULED';");
      if (!jobColNames.includes('social_whatsapp')) db.exec("ALTER TABLE jobs ADD COLUMN social_whatsapp TEXT;");
      if (!jobColNames.includes('social_telegram')) db.exec("ALTER TABLE jobs ADD COLUMN social_telegram TEXT;");
      if (!jobColNames.includes('social_tiktok')) db.exec("ALTER TABLE jobs ADD COLUMN social_tiktok TEXT;");

      const ideaCols = db.prepare("PRAGMA table_info(ideas)").all();
      const ideaColNames = ideaCols.map((c: any) => c.name);
      if (!ideaColNames.includes('social_publish_at')) db.exec("ALTER TABLE ideas ADD COLUMN social_publish_at TEXT;");
      if (!ideaColNames.includes('social_status')) db.exec("ALTER TABLE ideas ADD COLUMN social_status TEXT DEFAULT 'SCHEDULED';");
      if (!ideaColNames.includes('social_whatsapp')) db.exec("ALTER TABLE ideas ADD COLUMN social_whatsapp TEXT;");
      if (!ideaColNames.includes('social_telegram')) db.exec("ALTER TABLE ideas ADD COLUMN social_telegram TEXT;");
      if (!ideaColNames.includes('social_tiktok')) db.exec("ALTER TABLE ideas ADD COLUMN social_tiktok TEXT;");
    } catch (err) {
      console.warn('[DB] Migration SQLite warning:', err);
    }
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
  isActive?: boolean;
  socialPublishAt?: string;
  socialStatus?: string;
  socialWhatsapp?: string;
  socialTelegram?: string;
  socialTiktok?: string;
}

/**
 * Récupère les offres depuis SQLite ou PostgreSQL
 */
export async function getAllDbJobs(options?: { includeInactive?: boolean }): Promise<DbJob[]> {
  try {
    const whereClause = options?.includeInactive ? '' : 'WHERE j.is_active = true';
    const res = await queryDb(`
      SELECT 
        j.slug, j.title, j.company, j.location,
        j.contract_type as "contractType",
        COALESCE(j.opportunity_type, 'JOB') as "opportunityType",
        j.category, j.domain, j.salary, j.deadline,
        to_char(j.published_date, 'YYYY-MM-DD') as "publishedDate",
        j.featured, j.excerpt, j.description,
        j.original_url as "originalUrl",
        j.original_source as "originalSource",
        j.source_id as "sourceId",
        s.logo_url as "sourceLogoUrl",
        j.how_to_apply as "howToApply",
        j.requirements,
        COALESCE(j.metadata, '{}'::jsonb) as "metadata",
        j.is_active as "isActive",
        j.social_publish_at as "socialPublishAt",
        j.social_status as "socialStatus",
        j.social_whatsapp as "socialWhatsapp",
        j.social_telegram as "socialTelegram",
        j.social_tiktok as "socialTiktok"
      FROM jobs j
      LEFT JOIN sources s ON j.source_id = s.id
      ${whereClause}
      ORDER BY j.published_date DESC, j.id DESC
    `);
    
    return res.rows.map(r => ({
      ...r,
      featured: Boolean(r.featured),
      isActive: Boolean(r.isActive),
      requirements: typeof r.requirements === 'string' ? JSON.parse(r.requirements || '[]') : (r.requirements || []),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {})
    }));
  } catch (err) {
    console.warn('[DB] Impossible de récupérer les offres SQL:', err);
    return [];
  }
}

/**
 * Formate de manière sécurisée une date (string, Date ou timestamp) en format YYYY-MM-DD
 */
export function safeFormatDate(val: any, fallbackToday: boolean = true): string {
  if (!val) {
    return fallbackToday ? new Date().toISOString().slice(0, 10) : '';
  }
  if (val instanceof Date) {
    return !isNaN(val.getTime()) ? val.toISOString().slice(0, 10) : (fallbackToday ? new Date().toISOString().slice(0, 10) : '');
  }
  if (typeof val === 'string') {
    if (val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      return val.slice(0, 10);
    }
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return fallbackToday ? new Date().toISOString().slice(0, 10) : '';
}

/**
 * Retourne les opportunités dynamiques unifiées (Jobs, Stages, Formations, Projets, Annonces ET Idées business)
 */
export async function getUnifiedJobs(options?: { includeInactive?: boolean }): Promise<any[]> {
  const [dbJobs, dbIdeas] = await Promise.all([
    getAllDbJobs(options),
    getAllDbIdeas(options ? { includeInactive: options.includeInactive } : undefined)
  ]);

  const unifiedJobs = dbJobs.map(j => ({
    slug: j.slug,
    body: j.description || '',
    isIdea: false,
    url: `/opportunites/${j.slug}`,
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
      publishedDate: safeFormatDate(j.publishedDate),
      featured: j.featured,
      excerpt: j.excerpt,
      originalUrl: j.originalUrl,
      originalSource: j.originalSource,
      sourceId: j.sourceId,
      sourceLogoUrl: j.sourceLogoUrl,
      howToApply: j.howToApply,
      requirements: Array.isArray(j.requirements) ? j.requirements : [],
      metadata: j.metadata || {},
      isActive: j.isActive !== undefined ? j.isActive : true,
      socialPublishAt: j.socialPublishAt,
      socialStatus: j.socialStatus || 'SCHEDULED',
      socialWhatsapp: j.socialWhatsapp,
      socialTelegram: j.socialTelegram,
      socialTiktok: j.socialTiktok
    }
  }));

  const unifiedIdeas = dbIdeas.map(i => ({
    slug: i.slug,
    body: `${i.concept}\n\n**Besoin identifié :** ${i.besoinIdentifie}\n\n**Première action recommandée (48h) :** ${i.premiereAction}`,
    isIdea: true,
    url: `/idees/${i.slug}`,
    data: {
      title: i.title,
      company: 'Auto-emploi / Micro-entreprise',
      location: i.zoneCible || 'Bamako, Mali',
      contractType: 'Idée business',
      opportunityType: 'IDEA',
      category: i.sector,
      domain: i.demarrageLevel,
      salary: `Démarrage ${i.demarrageLevel.toLowerCase()}`,
      deadline: null,
      publishedDate: safeFormatDate(i.createdAt),
      featured: false,
      excerpt: `${(i.concept || '').slice(0, 180)}... Action 48h : ${i.premiereAction || ''}`,
      originalUrl: `/idees/${i.slug}`,
      originalSource: i.metadata?.source_name || 'Inspiration locale JobAvenir',
      howToApply: `Action immédiate sans capital : ${i.premiereAction}`,
      requirements: Array.isArray(i.competencesCles) ? i.competencesCles : [],
      metadata: {
        ...(i.metadata || {}),
        isIdea: true,
        demarrageLevel: i.demarrageLevel,
        premiereAction: i.premiereAction,
        publicCible: i.publicCible
      },
      isActive: i.isActive !== undefined ? i.isActive : true,
      socialPublishAt: i.socialPublishAt,
      socialStatus: i.socialStatus || 'SCHEDULED',
      socialWhatsapp: i.socialWhatsapp,
      socialTelegram: i.socialTelegram,
      socialTiktok: i.socialTiktok
    }
  }));

  return [...unifiedJobs, ...unifiedIdeas];
}

/**
 * Récupère une offre spécifique par son slug
 */
export async function getJobBySlug(slug: string, options?: { includeInactive?: boolean }): Promise<any | null> {
  try {
    const whereActive = options?.includeInactive ? '' : 'AND j.is_active = true';
    const res = await queryDb(`
      SELECT 
        j.slug, j.title, j.company, j.location,
        j.contract_type as "contractType",
        COALESCE(j.opportunity_type, 'JOB') as "opportunityType",
        j.category, j.domain, j.salary, j.deadline,
        to_char(j.published_date, 'YYYY-MM-DD') as "publishedDate",
        j.featured, j.excerpt, j.description,
        j.original_url as "originalUrl",
        j.original_source as "originalSource",
        j.source_id as "sourceId",
        s.logo_url as "sourceLogoUrl",
        j.how_to_apply as "howToApply",
        j.requirements,
        COALESCE(j.metadata, '{}'::jsonb) as "metadata",
        j.is_active as "isActive",
        j.social_publish_at as "socialPublishAt",
        j.social_status as "socialStatus",
        j.social_whatsapp as "socialWhatsapp",
        j.social_telegram as "socialTelegram",
        j.social_tiktok as "socialTiktok"
      FROM jobs j
      LEFT JOIN sources s ON j.source_id = s.id
      WHERE j.slug = $1 ${whereActive}
      LIMIT 1
    `, [slug]);

    if (res.rows.length === 0) {
      // Fallback si c'est une idée demandée
      const idea = await getIdeaBySlug(slug, options);
      if (idea) {
        return {
          slug: idea.slug,
          body: `${idea.concept}\n\n${idea.besoinIdentifie}`,
          isIdea: true,
          data: {
            title: idea.title,
            company: 'Auto-emploi / Micro-entreprise',
            location: idea.zoneCible || 'Bamako, Mali',
            contractType: 'Idée business',
            opportunityType: 'IDEA',
            category: idea.sector,
            domain: idea.demarrageLevel,
            salary: `Démarrage ${idea.demarrageLevel.toLowerCase()}`,
            deadline: null,
            publishedDate: safeFormatDate(idea.createdAt),
            featured: false,
            excerpt: idea.concept,
            originalUrl: `/idees/${idea.slug}`,
            originalSource: idea.metadata?.source_name || 'JobAvenir',
            howToApply: idea.premiereAction,
            requirements: idea.competencesCles || [],
            metadata: { ...idea.metadata, isIdea: true },
            isActive: idea.isActive !== undefined ? idea.isActive : true,
            socialPublishAt: idea.socialPublishAt,
            socialStatus: idea.socialStatus || 'SCHEDULED',
            socialWhatsapp: idea.socialWhatsapp,
            socialTelegram: idea.socialTelegram,
            socialTiktok: idea.socialTiktok
          }
        };
      }
      return null;
    }
    const j = res.rows[0];
    const requirements = typeof j.requirements === 'string' ? JSON.parse(j.requirements || '[]') : (j.requirements || []);
    const metadata = typeof j.metadata === 'string' ? JSON.parse(j.metadata || '{}') : (j.metadata || {});

    return {
      slug: j.slug,
      body: j.description || '',
      isIdea: false,
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
        sourceId: j.sourceId,
        sourceLogoUrl: j.sourceLogoUrl,
        howToApply: j.howToApply,
        requirements: Array.isArray(requirements) ? requirements : [],
        metadata: metadata,
        isActive: Boolean(j.isActive),
        socialPublishAt: j.socialPublishAt,
        socialStatus: j.socialStatus || 'SCHEDULED',
        socialWhatsapp: j.socialWhatsapp,
        socialTelegram: j.socialTelegram,
        socialTiktok: j.socialTiktok
      }
    };
  } catch (err) {
    console.warn('[DB] Erreur getJobBySlug:', err);
    return null;
  }
}

/**
 * Archive automatiquement les offres obsolètes :
 * 1. Les offres dont la date limite est échue (deadline < CURRENT_DATE)
 * 2. Les offres sans date limite publiées depuis plus de olderThanDays jours (défaut: 30 jours)
 * Retourne le nombre total d'offres archivées.
 */
export async function archiveExpiredJobs(options?: { olderThanDays?: number }): Promise<number> {
  try {
    const olderThanDays = options?.olderThanDays ?? 30;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thresholdDate = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // 1. Sélection des offres actives avec deadline
    const resDeadlines = await queryDb(`
      SELECT id, deadline FROM jobs 
      WHERE is_active = true 
        AND deadline IS NOT NULL 
        AND deadline != ''
    `);

    const expiredIds: number[] = [];

    for (const row of resDeadlines.rows) {
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

    // 2. Sélection des offres sans date limite publiées depuis plus de olderThanDays jours
    const resNoDeadlines = await queryDb(`
      SELECT id FROM jobs
      WHERE is_active = true
        AND (deadline IS NULL OR deadline = '')
        AND published_date < $1
    `, [thresholdDate]);

    for (const row of resNoDeadlines.rows) {
      if (!expiredIds.includes(row.id)) {
        expiredIds.push(row.id);
      }
    }

    if (expiredIds.length > 0) {
      const idList = expiredIds.join(',');
      await queryDb(`UPDATE jobs SET is_active = false, social_status = 'ARCHIVED', updated_at = NOW() WHERE id IN (${idList})`);
      console.log(`[DB] 🧹 Cycle de vie : ${expiredIds.length} offre(s) expirée(s) ou obsolètes (> ${olderThanDays}j) archivée(s) (is_active = false).`);
    }

    return expiredIds.length;
  } catch (err) {
    console.error('[DB] Erreur lors de l\'archivage des offres expirées:', err);
    return 0;
  }
}

export interface DbIdea {
  id?: number;
  slug: string;
  title: string;
  sector: string;
  zoneCible: string;
  demarrageLevel: 'Très faible' | 'Modéré' | 'Conséquent';
  besoinIdentifie: string;
  concept: string;
  publicCible: string;
  competencesCles: string[];
  premiereAction: string;
  sourceInspirationId?: string | null;
  isActive?: boolean;
  socialPublishAt?: string;
  socialStatus?: string;
  socialWhatsapp?: string;
  socialTelegram?: string;
  socialTiktok?: string;
  contentHash?: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Récupère toutes les idées actives avec filtres optionnels
 */
export async function getAllDbIdeas(filters?: { sector?: string; demarrageLevel?: string; zone?: string; includeInactive?: boolean }): Promise<DbIdea[]> {
  try {
    const whereActive = filters?.includeInactive ? '1=1' : 'is_active = true';
    let sql = `
      SELECT 
        id, slug, title, sector,
        zone_cible as "zoneCible",
        demarrage_level as "demarrageLevel",
        besoin_identifie as "besoinIdentifie",
        concept,
        public_cible as "publicCible",
        competences_cles as "competencesCles",
        premiere_action as "premiereAction",
        source_inspiration_id as "sourceInspirationId",
        is_active as "isActive",
        social_publish_at as "socialPublishAt",
        social_status as "socialStatus",
        social_whatsapp as "socialWhatsapp",
        social_telegram as "socialTelegram",
        social_tiktok as "socialTiktok",
        content_hash as "contentHash",
        COALESCE(metadata, '{}'::jsonb) as "metadata",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM ideas
      WHERE ${whereActive}
    `;
    const params: any[] = [];

    if (filters?.sector && filters.sector !== 'tous') {
      params.push(filters.sector);
      sql += ` AND LOWER(sector) = LOWER($${params.length})`;
    }

    if (filters?.demarrageLevel && filters.demarrageLevel !== 'tous') {
      params.push(filters.demarrageLevel);
      sql += ` AND LOWER(demarrage_level) = LOWER($${params.length})`;
    }

    if (filters?.zone && filters.zone !== 'tous') {
      params.push(`%${filters.zone}%`);
      sql += ` AND LOWER(zone_cible) LIKE LOWER($${params.length})`;
    }

    sql += ` ORDER BY id DESC`;

    const res = await queryDb(sql, params);

    return res.rows.map(r => ({
      ...r,
      isActive: Boolean(r.isActive),
      competencesCles: typeof r.competencesCles === 'string' ? JSON.parse(r.competencesCles || '[]') : (r.competencesCles || []),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      createdAt: safeFormatDate(r.createdAt),
      updatedAt: safeFormatDate(r.updatedAt)
    }));
  } catch (err) {
    console.warn('[DB] Impossible de récupérer les idées SQL:', err);
    return [];
  }
}

/**
 * Récupère une fiche idée par son slug
 */
export async function getIdeaBySlug(slug: string, options?: { includeInactive?: boolean }): Promise<DbIdea | null> {
  try {
    const whereActive = options?.includeInactive ? '' : 'AND is_active = true';
    const res = await queryDb(`
      SELECT 
        id, slug, title, sector,
        zone_cible as "zoneCible",
        demarrage_level as "demarrageLevel",
        besoin_identifie as "besoinIdentifie",
        concept,
        public_cible as "publicCible",
        competences_cles as "competencesCles",
        premiere_action as "premiereAction",
        source_inspiration_id as "sourceInspirationId",
        is_active as "isActive",
        social_publish_at as "socialPublishAt",
        social_status as "socialStatus",
        social_whatsapp as "socialWhatsapp",
        social_telegram as "socialTelegram",
        social_tiktok as "socialTiktok",
        content_hash as "contentHash",
        COALESCE(metadata, '{}'::jsonb) as "metadata",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM ideas
      WHERE slug = $1 ${whereActive}
      LIMIT 1
    `, [slug]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    return {
      ...r,
      isActive: Boolean(r.isActive),
      competencesCles: typeof r.competencesCles === 'string' ? JSON.parse(r.competencesCles || '[]') : (r.competencesCles || []),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
      createdAt: safeFormatDate(r.createdAt),
      updatedAt: safeFormatDate(r.updatedAt)
    };
  } catch (err) {
    console.warn('[DB] Erreur getIdeaBySlug:', err);
    return null;
  }
}

/**
 * Insère ou met à jour une idée en base (déduplication par content_hash)
 */
export async function insertIdea(idea: DbIdea): Promise<boolean> {
  try {
    const competencesJson = JSON.stringify(idea.competencesCles || []);
    const metadataJson = JSON.stringify(idea.metadata || {});

    // Génération automatique des champs sociaux si non fournis
    let socialPublishAt = idea.socialPublishAt;
    let socialStatus = idea.socialStatus || 'SCHEDULED';
    let socialWhatsapp = idea.socialWhatsapp;
    let socialTelegram = idea.socialTelegram;
    let socialTiktok = idea.socialTiktok;

    if (!socialPublishAt) {
      socialPublishAt = calculateDefaultSocialPublishAt(idea.createdAt);
    }

    if (!socialWhatsapp || !socialTelegram || !socialTiktok) {
      const generated = generateSocialTexts({
        title: idea.title,
        company: 'Projet d\'entreprise',
        location: idea.zoneCible || 'Bamako, Mali',
        contractType: 'Idée business',
        slug: idea.slug,
        isIdea: true
      });
      if (!socialWhatsapp) socialWhatsapp = generated.whatsapp;
      if (!socialTelegram) socialTelegram = generated.telegram;
      if (!socialTiktok) socialTiktok = generated.tiktok;
    }

    await queryDb(`
      INSERT INTO ideas (
        slug, title, sector, zone_cible, demarrage_level,
        besoin_identifie, concept, public_cible,
        competences_cles, premiere_action, source_inspiration_id,
        content_hash, metadata, is_active,
        social_publish_at, social_status, social_whatsapp, social_telegram, social_tiktok
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, $15, $16, $17, $18)
      ON CONFLICT (content_hash) DO UPDATE SET
        title = EXCLUDED.title,
        sector = EXCLUDED.sector,
        zone_cible = EXCLUDED.zone_cible,
        demarrage_level = EXCLUDED.demarrage_level,
        besoin_identifie = EXCLUDED.besoin_identifie,
        concept = EXCLUDED.concept,
        public_cible = EXCLUDED.public_cible,
        competences_cles = EXCLUDED.competences_cles,
        premiere_action = EXCLUDED.premiere_action,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      idea.slug,
      idea.title,
      idea.sector,
      idea.zoneCible || 'Bamako, Mali',
      idea.demarrageLevel,
      idea.besoinIdentifie,
      idea.concept,
      idea.publicCible,
      competencesJson,
      idea.premiereAction,
      idea.sourceInspirationId || null,
      idea.contentHash,
      metadataJson,
      socialPublishAt,
      socialStatus,
      socialWhatsapp,
      socialTelegram,
      socialTiktok
    ]);

    return true;
  } catch (err) {
    console.error('[DB] Erreur insertIdea:', err);
    return false;
  }
}

export interface DbSource {
  id: string;
  name: string;
  category?: string;
  subCategory?: string;
  url: string;
  statusTechnical?: string;
  scraperType?: string;
  frequency?: string;
  description?: string;
  isActive?: boolean;
  discoveryStatus?: string;
  lastScrapedAt?: string;
  etag?: string;
  lastModifiedHeader?: string;
  failureCount?: number;
  logoUrl?: string | null;
  createdAt?: string;
}

export async function getSourceById(id: string): Promise<DbSource | null> {
  try {
    const res = await queryDb(
      `SELECT id, name, category, sub_category as "subCategory", url, 
              status_technical as "statusTechnical", scraper_type as "scraperType",
              frequency, description, is_active as "isActive",
              discovery_status as "discoveryStatus",
              last_scraped_at as "lastScrapedAt",
              failure_count as "failureCount",
              logo_url as "logoUrl",
              created_at as "createdAt"
       FROM sources WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      ...r,
      isActive: Boolean(r.isActive)
    };
  } catch (err) {
    console.error(`[DB] Erreur getSourceById(${id}):`, err);
    return null;
  }
}

export async function updateSourceLogo(id: string, logoUrl: string | null): Promise<boolean> {
  try {
    await queryDb(
      `UPDATE sources SET logo_url = $2 WHERE id = $1`,
      [id, logoUrl]
    );
    return true;
  } catch (err) {
    console.error(`[DB] Erreur updateSourceLogo(${id}):`, err);
    return false;
  }
}

export async function getAllSources(options: { 
  onlyActive?: boolean; 
  category?: string;
  statusTechnical?: string;
  discoveryStatus?: string;
  search?: string;
} = {}): Promise<DbSource[]> {
  try {
    let sql = `
      SELECT id, name, category, sub_category as "subCategory", url, 
             status_technical as "statusTechnical", scraper_type as "scraperType",
             frequency, description, is_active as "isActive",
             discovery_status as "discoveryStatus",
             last_scraped_at as "lastScrapedAt",
             failure_count as "failureCount",
             logo_url as "logoUrl",
             created_at as "createdAt"
      FROM sources
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (options.onlyActive) {
      sql += ` AND (is_active = 1 OR is_active = true)`;
    }
    if (options.category) {
      sql += ` AND category = $${pIdx++}`;
      params.push(options.category);
    }
    if (options.statusTechnical) {
      sql += ` AND status_technical = $${pIdx++}`;
      params.push(options.statusTechnical);
    }
    if (options.discoveryStatus) {
      sql += ` AND discovery_status = $${pIdx++}`;
      params.push(options.discoveryStatus);
    }
    if (options.search) {
      sql += ` AND (name ILIKE $${pIdx} OR url ILIKE $${pIdx} OR description ILIKE $${pIdx} OR id ILIKE $${pIdx})`;
      params.push(`%${options.search}%`);
      pIdx++;
    }

    sql += ` ORDER BY id ASC`;

    const res = await queryDb(sql, params);
    return res.rows.map(r => ({
      ...r,
      isActive: Boolean(r.isActive)
    }));
  } catch (err) {
    console.error('[DB] Erreur getAllSources:', err);
    return [];
  }
}

export async function toggleSourceActive(id: string, isActive?: boolean): Promise<{ success: boolean; isActive: boolean }> {
  try {
    const current = await queryDb(`SELECT is_active FROM sources WHERE id = $1`, [id]);
    if (current.rows.length === 0) throw new Error('Source introuvable');
    
    const curVal = Boolean(current.rows[0].is_active);
    const targetState = isActive !== undefined ? isActive : !curVal;
    const dbVal = targetState ? 1 : 0;

    await queryDb(`UPDATE sources SET is_active = $2 WHERE id = $1`, [id, dbVal]);
    return { success: true, isActive: targetState };
  } catch (err: any) {
    console.error(`[DB] Erreur toggleSourceActive(${id}):`, err);
    throw err;
  }
}

export async function upsertSource(source: Partial<DbSource> & { id?: string; name: string; url: string }): Promise<string> {
  const isUpdate = Boolean(source.id);
  let sourceId = source.id;

  if (!isUpdate) {
    // Générer nouvel ID SRC_XXX basé sur le MAX existant
    const maxRes = await queryDb(`SELECT id FROM sources WHERE id LIKE 'SRC_%' ORDER BY id DESC LIMIT 50`);
    let maxNum = 0;
    for (const row of maxRes.rows) {
      const num = parseInt(row.id.replace('SRC_', ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
    sourceId = `SRC_${String(maxNum + 1).padStart(3, '0')}`;
  }

  const isActiveVal = source.isActive !== false ? 1 : 0;
  const statusTech = source.statusTechnical || 'ACTIF_200';
  const scraperType = source.scraperType || 'API_OU_DOM_MONITOR';
  const frequency = source.frequency || 'QUOTIDIEN';
  const discoveryStatus = source.discoveryStatus || 'OFFICIAL';

  await queryDb(
    `INSERT INTO sources (
      id, name, category, sub_category, url, status_technical,
      scraper_type, frequency, description, is_active, discovery_status, logo_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      sub_category = EXCLUDED.sub_category,
      url = EXCLUDED.url,
      status_technical = EXCLUDED.status_technical,
      scraper_type = EXCLUDED.scraper_type,
      frequency = EXCLUDED.frequency,
      description = EXCLUDED.description,
      is_active = EXCLUDED.is_active,
      discovery_status = EXCLUDED.discovery_status,
      logo_url = COALESCE(EXCLUDED.logo_url, sources.logo_url)`,
    [
      sourceId,
      source.name,
      source.category || 'Général',
      source.subCategory || '',
      source.url,
      statusTech,
      scraperType,
      frequency,
      source.description || '',
      isActiveVal,
      discoveryStatus,
      source.logoUrl || null
    ]
  );

  return sourceId!;
}

