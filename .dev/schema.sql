-- Schéma de base de données PostgreSQL pour JobAvenir
-- Exécuter ce script sur la base PostgreSQL pour initialiser les tables

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
