import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const FALLBACK_SCHEMA_SQL = `
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL DEFAULT 'Organisme Partenaire',
    location VARCHAR(255) NOT NULL DEFAULT 'Bamako, Mali',
    contract_type VARCHAR(50) NOT NULL DEFAULT 'Autre',
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
    content_hash VARCHAR(64) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_published_date ON jobs(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_contract_type ON jobs(contract_type);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash);
`;

/**
 * Initialise le schéma de la base de données si nécessaire
 */
export async function initDatabaseSchema() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB] Aucune DATABASE_URL fournie, schéma ignoré.');
    return;
  }
  const client = await pool.connect();
  try {
    const schemaPath = path.resolve(process.cwd(), '.dev/schema.sql');
    let sql = FALLBACK_SCHEMA_SQL;
    if (fs.existsSync(schemaPath)) {
      sql = fs.readFileSync(schemaPath, 'utf-8');
    }
    await client.query(sql);
    console.log('[DB] Schéma PostgreSQL initialisé avec succès.');
  } catch (err) {
    console.error('[DB] Erreur lors de l\'initialisation du schéma:', err);
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
}

/**
 * Récupère les offres depuis PostgreSQL si disponible
 */
export async function getAllDbJobs(): Promise<DbJob[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const res = await pool.query(`
      SELECT 
        slug, title, company, location,
        contract_type as "contractType",
        category, domain, salary, deadline,
        to_char(published_date, 'YYYY-MM-DD') as "publishedDate",
        featured, excerpt, description,
        original_url as "originalUrl",
        original_source as "originalSource",
        how_to_apply as "howToApply",
        requirements
      FROM jobs
      WHERE is_active = true
      ORDER BY published_date DESC, id DESC
    `);
    return res.rows;
  } catch (err) {
    console.warn('[DB] Impossible de récupérer les offres SQL:', err);
    return [];
  }
}

/**
 * Retourne les offres dynamiques depuis PostgreSQL
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
      requirements: Array.isArray(j.requirements) ? j.requirements : []
    }
  }));
}

/**
 * Récupère une offre spécifique par son slug depuis PostgreSQL
 */
export async function getJobBySlug(slug: string): Promise<any | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const res = await pool.query(`
      SELECT 
        slug, title, company, location,
        contract_type as "contractType",
        category, domain, salary, deadline,
        to_char(published_date, 'YYYY-MM-DD') as "publishedDate",
        featured, excerpt, description,
        original_url as "originalUrl",
        original_source as "originalSource",
        how_to_apply as "howToApply",
        requirements
      FROM jobs
      WHERE slug = $1 AND is_active = true
      LIMIT 1
    `, [slug]);

    if (res.rows.length === 0) return null;
    const j = res.rows[0];
    return {
      slug: j.slug,
      body: j.description || '',
      data: {
        title: j.title,
        company: j.company,
        location: j.location,
        contractType: j.contractType,
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
        requirements: Array.isArray(j.requirements) ? j.requirements : []
      }
    };
  } catch (err) {
    console.warn('[DB] Erreur getJobBySlug:', err);
    return null;
  }
}


