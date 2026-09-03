# Documentation Technique : Pipeline de Scraping & Ingestion JobAvenir

Ce document consigne l'architecture, les tests d'extraction IA, la modélisation de données et le guide d'exécution pour permettre la reprise et l'évolution du système d'ingestion d'offres d'emploi.

---

## 1. Inventaire des Sources & Analyse de faisabilité

- **Fichier source central** : [Google Spreadsheet Public](https://docs.google.com/spreadsheets/d/16Nd67c8et6d5Ts2zsqcWO_mJb7jtfqV5XiO0cWS9Vu0/edit?usp=sharing)
- **Feuille principale** : `Master Sources` (`gid=280735573`)
- **Accès programmatique direct sans OAuth** :
  ```
  https://docs.google.com/spreadsheets/d/16Nd67c8et6d5Ts2zsqcWO_mJb7jtfqV5XiO0cWS9Vu0/export?format=csv&gid=280735573
  ```
- **Total sources répertoriées** : 211
  - `ACTIF_200` : **121 sources** (directement exploitables via HTTP/API/RSS sans proxy complexe).
  - `ACTIF_403` : **30 sources** (protégées par Cloudflare ou anti-bot, nécessiteront un headless browser type Playwright plus tard).
  - `SQUAT` : **2 sources** (domaines expirés/piratés, explicitement bannis).
  - Autres : **58 sources** (inaccessibles ou à vérifier manuellement).

---

## 2. Évaluation & Choix des Modèles IA (OpenRouter)

Nous avons testé en conditions réelles plusieurs modèles via OpenRouter :

| Modèle | Test JSON | Rapidité | Fiabilité & Remarques |
|---|---|---|---|
| `deepseek/deepseek-chat` | ✅ Excellent | ~3.5s - 4s | **Très précis**, respecte scrupuleusement la structure JSON demandée. |
| `google/gemini-2.5-flash` | ✅ Excellent | ~1.5s - 2s | **Ultra rapide**, très bonne compréhension du français et des formats locaux maliens. |
| Modèles gratuits (`:free`) | ⚠️ Instable | Variable | Traces de thinking (*reasoning*) parasites saturant les tokens ou erreurs `429 Too Many Requests`. |

### Règle de configuration du modèle
Le choix du modèle est **entièrement configurable** via la variable d'environnement :
```env
OPENROUTER_MODEL=deepseek/deepseek-chat
# ou alternative ultra-rapide :
# OPENROUTER_MODEL=google/gemini-2.5-flash
```

---

## 3. Schéma de Base de Données (PostgreSQL)

Le schéma normalisé correspond à la collection Astro existante (`src/content/config.ts`) et prépare l'indexation dynamique :

```sql
-- Table des sources de veille
CREATE TABLE IF NOT EXISTS sources (
    id VARCHAR(50) PRIMARY KEY,          -- ex: 'SRC_001', 'SRC_017'
    name VARCHAR(255) NOT NULL,          -- Nom de l'organisme ou portail
    category VARCHAR(100),               -- ex: 'Institutions publiques', 'Plateformes & presse'
    sub_category VARCHAR(100),
    url TEXT NOT NULL,
    status_technical VARCHAR(50),        -- 'ACTIF_200', 'ACTIF_403', etc.
    scraper_type VARCHAR(50),            -- 'API_OU_DOM_MONITOR', 'HTML_GENERIC_PARSER'
    frequency VARCHAR(50) DEFAULT 'QUOTIDIEN',
    last_scraped_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table des offres d'emploi / formations / stages
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL DEFAULT 'Organisme Partenaire',
    location VARCHAR(255) NOT NULL DEFAULT 'Bamako, Mali',
    contract_type VARCHAR(50) NOT NULL DEFAULT 'Autre', -- 'CDI', 'CDD', 'Stage', 'Intérim', etc.
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
    content_hash VARCHAR(64) UNIQUE,     -- Hash SHA256 pour dédoublonnage strict
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_published_date ON jobs(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_contract_type ON jobs(contract_type);
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs(is_active);
```

---

## 4. Déploiement & Dokploy

- **Dokploy Cible** : `https://deploy.malihub.digital/`
- **Projet** : `jobavenir` (ID: `d1r2gSudcCKohST5WXLJT`)
- **Environnement** : `production` (ID: `ODGj3SUXg5BlfkANmkMlS`)
- **Service Web actuel** : `web` (ID: `nnCY12vN_g6_rYkWbXIij`, URL: `https://job.malihub.digital`)

### Configuration PostgreSQL Dokploy :
- **Name** : `db`
- **App Name (Dokploy Container)** : `jobavenir-db-x41cxy`
- **Postgres ID** : `09fx6KK7CjGpEmYU8DFsU`
- **Database Name** : `jobavenir`
- **Database User** : `jobavenir_user`
- **Database Password** : `eTfpd1bf3njnQI4AFT4i`

### Connexion interne (Réseau Docker Dokploy) :
Lorsque l'application et la base sont dans le même projet Dokploy, elles partagent le réseau interne Docker :
```env
DATABASE_URL="postgresql://jobavenir_user:eTfpd1bf3njnQI4AFT4i@jobavenir-db-x41cxy:5432/jobavenir"
```
*(Alternative si alias réseau court : `jobavenir-db:5432`)*


---

## 5. Fonctionnement du Scraper (PoC)

Le script de scraping TypeScript est placé dans `scripts/scrape.ts` et s'exécute par :
```bash
npm run scrape
```

### Pipeline d'exécution :
1. Télécharge les sources `ACTIF_200` depuis le Google Sheet unifié.
2. Pour chaque source ciblée (ex: MaliTravail, flux RSS ou HTML d'organismes) :
   - Extrait les annonces récentes.
   - Calcule un hash d'unicité `content_hash` pour ne pas ré-analyser les offres déjà stockées.
   - Soumet le texte brut au modèle IA configuré (`deepseek/deepseek-chat` ou `gemini-2.5-flash`).
   - Insère ou met à jour la ligne dans la base de données PostgreSQL.
3. Un cron récurrent Dokploy déclenche `npm run scrape` selon la fréquence choisie (ex: 2x par jour).
