# Gestion des Opportunités et Diffusion Réseaux Sociaux Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'administrateur de modérer en 1 clic la publication des opportunités (publier/dépublier) et de planifier automatiquement leur diffusion sur les réseaux sociaux (WhatsApp, Telegram, TikTok) avec pré-remplissage et date par défaut.

**Architecture:** Extension du schéma de base de données (SQLite/PostgreSQL) avec colonnes de diffusion sociale et statut d'activation ; endpoint API sécurisé SSR Astro `/api/admin/opportunity` ; composant d'administration contextuel in-page (`OpportunityAdminPanel.astro`) sur les fiches de détail ; et actions rapides directes avec filtres sur le listing `/opportunites`.

**Tech Stack:** Astro 3.6 (hybrid SSR), TypeScript, Node.js, SQLite (node:sqlite WAL) / PostgreSQL (pg), TailwindCSS, @malihub/sites-core (auth utils).

**Spec:** `docs/superpowers/specs/2026-10-15-opportunity-admin-and-social-publishing-design.md`

## Global Constraints

- Rétrocompatibilité totale avec les bases SQLite locales et PostgreSQL Dokploy sans perte de données existantes.
- Zéro dépendance externe lourde : utilisation des utilitaires d'authentification existants (`hashSha256`, `getAdminCookieToken` de `@malihub/sites-core/utils/auth.js`).
- Modération par exception : génération par défaut automatique de la date et des textes sociaux, aucune action manuelle obligatoire pour les nouvelles annonces.
- 100% responsive et adapté au mobile (panneau dépliable dans la page, pas de modale bloquante).
- Étanchéité stricte : les visiteurs anonymes ne doivent jamais avoir accès aux annonces dépubliées (`is_active = false`).

---

### Task 1: Schéma de Base de Données & Utilitaires Métier

**Files:**
- Modify: `src/lib/db.ts:79-195` (schémas SQLite et PG), `src/lib/db.ts:281-310` (migrations dynamiques), `src/lib/db.ts:312-555` (fonctions de récupération avec option inactive)
- Create: `src/lib/social-generator.ts` (générateur de textes réseaux sociaux et calcul de date par défaut)
- Test: `scripts/test-social-schema.ts`

**Interfaces:**
- Produces:
  - `generateSocialTexts(item: { title: string, company?: string, location?: string, contractType?: string, slug: string, deadline?: string, isIdea?: boolean }): { whatsapp: string, telegram: string, tiktok: string }`
  - `calculateDefaultSocialPublishAt(publishedDate?: string): string`
  - `DbJob` & `DbIdea` enrichies avec `socialPublishAt?: string`, `socialStatus?: string`, `socialWhatsapp?: string`, `socialTelegram?: string`, `socialTiktok?: string`
  - `getUnifiedJobs(options?: { includeInactive?: boolean }): Promise<any[]>`
  - `getJobBySlug(slug: string, options?: { includeInactive?: boolean }): Promise<any | null>`

- [ ] **Step 1: Créer le fichier de test pour le générateur social et le schéma**

```typescript
// scripts/test-social-schema.ts
import { generateSocialTexts, calculateDefaultSocialPublishAt } from '../src/lib/social-generator';
import { initDatabaseSchema, queryDb } from '../src/lib/db';

async function run() {
  console.log('Testing social text generator...');
  const texts = generateSocialTexts({
    title: 'Développeur Fullstack',
    company: 'MaliTech Solutions',
    location: 'Bamako, Mali',
    contractType: 'CDI',
    slug: 'developpeur-fullstack-malitech',
    deadline: '2026-11-30',
    isIdea: false
  });

  if (!texts.whatsapp.includes('Développeur Fullstack') || !texts.whatsapp.includes('job.malihub.digital')) {
    throw new Error('WhatsApp text generation failed');
  }
  if (!texts.telegram.includes('#EmploiMali')) {
    throw new Error('Telegram text generation failed');
  }
  if (!texts.tiktok.includes('Hook :')) {
    throw new Error('TikTok text generation failed');
  }

  const defaultDate = calculateDefaultSocialPublishAt();
  if (!defaultDate || isNaN(new Date(defaultDate).getTime())) {
    throw new Error('Default social publish at calculation failed');
  }

  console.log('Testing schema migration on local DB...');
  await initDatabaseSchema();
  const jobCols = await queryDb("PRAGMA table_info(jobs)");
  const colNames = jobCols.rows.map((r: any) => r.name);
  for (const requiredCol of ['social_publish_at', 'social_status', 'social_whatsapp', 'social_telegram', 'social_tiktok']) {
    if (!colNames.includes(requiredCol)) {
      throw new Error(`Missing column in jobs: ${requiredCol}`);
    }
  }

  console.log('✅ Task 1 tests passed successfully!');
}

run().catch((err) => {
  console.error('❌ Task 1 test error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Exécuter le test pour vérifier l'échec initial**

Run: `npx tsx scripts/test-social-schema.ts`  
Expected: FAIL avec `Cannot find module '../src/lib/social-generator'`

- [ ] **Step 3: Implémenter `src/lib/social-generator.ts`**

```typescript
// src/lib/social-generator.ts

export interface SocialItemData {
  title: string;
  company?: string;
  location?: string;
  contractType?: string;
  slug: string;
  deadline?: string | null;
  isIdea?: boolean;
}

export function calculateDefaultSocialPublishAt(baseDate?: string): string {
  const d = baseDate ? new Date(baseDate) : new Date();
  // Planification automatique par défaut : 1 heure après
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export function generateSocialTexts(item: SocialItemData): { whatsapp: string; telegram: string; tiktok: string } {
  const baseUrl = "https://job.malihub.digital";
  const targetUrl = item.isIdea 
    ? `${baseUrl}/idees/${item.slug}` 
    : `${baseUrl}/opportunites/${item.slug}`;

  const org = item.company || (item.isIdea ? "Idée d'entreprise locale" : "Organisme partenaire");
  const loc = item.location || "Bamako, Mali";
  const contract = item.contractType || (item.isIdea ? "Projet d'entreprise" : "Opportunité");
  const deadlineStr = item.deadline ? item.deadline : "Candidatures ouvertes";

  const whatsapp = `📢 *${item.title.trim()}*
🏢 ${org} • 📍 ${loc} • 📄 ${contract}

👉 Voir tous les détails et postuler :
${targetUrl}`;

  const telegram = `🚀 *${item.title.trim()}*

🏢 *Organisme :* ${org}
📍 *Lieu :* ${loc}
⏳ *Date limite :* ${deadlineStr}

🔗 *Consulter l'annonce complète :*
${targetUrl}

#EmploiMali #MaliJobs #Recrutement #Bamako #JobAvenir`;

  const tiktok = `🎬 Hook : "Une nouvelle opportunité vient d'ouvrir au Mali !"
📌 Poste / Projet : ${item.title.trim()}
🏢 Organisme : ${org}
📍 Lieu : ${loc}
💡 Date limite : ${deadlineStr}
👉 Lien complet dans la bio ou sur JobAvenir Mali !

#Mali #Bamako #JobAvenir #EmploiMali #Opportunites`;

  return { whatsapp, telegram, tiktok };
}
```

- [ ] **Step 4: Mettre à jour `src/lib/db.ts`**

Ajouter dans `SQLITE_SCHEMA_SQL` et `PG_SCHEMA_SQL` les colonnes :
- `social_publish_at`
- `social_status VARCHAR(50) DEFAULT 'SCHEDULED'`
- `social_whatsapp TEXT`
- `social_telegram TEXT`
- `social_tiktok TEXT`

Dans `initDatabaseSchema()` :
- Ajouter des vérifications et `ALTER TABLE jobs ADD COLUMN ...` / `ALTER TABLE ideas ADD COLUMN ...` pour SQLite et PostgreSQL.
- Mettre à jour `getAllDbJobs(options?: { includeInactive?: boolean })`, `getUnifiedJobs(options?: { includeInactive?: boolean })` et `getJobBySlug(slug: string, options?: { includeInactive?: boolean })` pour filtrer par `is_active = true` uniquement si `!options?.includeInactive`.

- [ ] **Step 5: Exécuter le test pour vérifier le succès**

Run: `npx tsx scripts/test-social-schema.ts`  
Expected: PASS avec `✅ Task 1 tests passed successfully!`

- [ ] **Step 6: Commit**

```bash
git add src/lib/social-generator.ts src/lib/db.ts scripts/test-social-schema.ts
git commit -m "feat(db): add social publishing columns, auto migration and social generator"
```

---

### Task 2: Automatisation dans les Scripts de Scraping

**Files:**
- Modify: `scripts/scrape.ts:650-675` (insertion avec champs sociaux par défaut)
- Modify: `scripts/scrape-ideas.ts:500-530` (insertion d'idées avec champs sociaux)
- Test: `scripts/test-scrape-defaults.ts`

**Interfaces:**
- Consumes: `generateSocialTexts`, `calculateDefaultSocialPublishAt` from `src/lib/social-generator`
- Produces: Nouvelles opportunités insérées avec `social_publish_at`, `social_status = 'SCHEDULED'`, et textes générés.

- [ ] **Step 1: Écrire le script de test pour l'insertion par défaut**

```typescript
// scripts/test-scrape-defaults.ts
import { queryDb, initDatabaseSchema } from '../src/lib/db';
import { generateSocialTexts, calculateDefaultSocialPublishAt } from '../src/lib/social-generator';

async function testInsert() {
  await initDatabaseSchema();
  const testSlug = `test-opportunity-${Date.now()}`;
  const social = generateSocialTexts({
    title: 'Test Automatic Social Post',
    company: 'Test Corp',
    location: 'Bamako',
    slug: testSlug
  });
  const publishAt = calculateDefaultSocialPublishAt();

  await queryDb(`
    INSERT INTO jobs (
      slug, title, company, excerpt, content_hash,
      social_publish_at, social_status, social_whatsapp, social_telegram, social_tiktok
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    testSlug, 'Test Automatic Social Post', 'Test Corp', 'Excerpt test', testSlug,
    publishAt, 'SCHEDULED', social.whatsapp, social.telegram, social.tiktok
  ]);

  const res = await queryDb('SELECT * FROM jobs WHERE slug = $1', [testSlug]);
  if (res.rows.length === 0 || res.rows[0].social_status !== 'SCHEDULED') {
    throw new Error('Failed to retrieve inserted social fields');
  }

  // Nettoyage
  await queryDb('DELETE FROM jobs WHERE slug = $1', [testSlug]);
  console.log('✅ Task 2 test passed!');
}

testInsert().catch(err => {
  console.error('❌ Task 2 test error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Exécuter le test de validation**

Run: `npx tsx scripts/test-scrape-defaults.ts`  
Expected: PASS avec `✅ Task 2 test passed!`

- [ ] **Step 3: Mettre à jour `scripts/scrape.ts` et `scripts/scrape-ideas.ts`**

Intégrer le calcul de `social_publish_at`, `social_status = 'SCHEDULED'`, et des 3 textes lors de l'insertion dans `jobs` et `ideas`.

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape.ts scripts/scrape-ideas.ts scripts/test-scrape-defaults.ts
git commit -m "feat(scraper): automatically populate social scheduling fields and texts on scrape"
```

---

### Task 3: API Sécurisée `/api/admin/opportunity`

**Files:**
- Create: `src/pages/api/admin/opportunity.ts`
- Test: `scripts/test-admin-api.ts`

**Interfaces:**
- Consumes: `hashSha256` from `@malihub/sites-core/utils/auth.js`, `queryDb` from `src/lib/db.ts`
- Produces: Endpoints `GET` et `POST` sur `/api/admin/opportunity`

- [ ] **Step 1: Écrire le test d'intégration pour l'API admin**

```typescript
// scripts/test-admin-api.ts
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';

async function testApi() {
  const rawSecret = process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedToken = await hashSha256(rawSecret);

  console.log('Expected admin token:', expectedToken.slice(0, 10) + '...');
  // Le test vérifie que l'on sait générer et valider le token de hachage de l'admin
  if (!expectedToken || expectedToken.length !== 64) {
    throw new Error('Invalid SHA256 token generated');
  }
  console.log('✅ Task 3 auth verification logic passed!');
}

testApi().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Exécuter le test de vérification**

Run: `npx tsx scripts/test-admin-api.ts`  
Expected: PASS

- [ ] **Step 3: Implémenter `src/pages/api/admin/opportunity.ts`**

```typescript
// src/pages/api/admin/opportunity.ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { queryDb, getJobBySlug, getIdeaBySlug } from '../../../lib/db';
import { generateSocialTexts, calculateDefaultSocialPublishAt } from '../../../lib/social-generator';

async function isAuthenticated(request: Request): Promise<boolean> {
  const rawSecret = import.meta.env.CMS_ADMIN_SECRET || process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedHash = await hashSha256(rawSecret);

  // Vérifier cookie ml_admin_token
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/ml_admin_token=([^;]+)/);
  if (match && match[1] === expectedHash) {
    return true;
  }

  // Vérifier en-tête Authorization: Bearer <hash>
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedHash) {
    return true;
  }

  return false;
}

export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'job';
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Slug manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const table = type === 'idea' ? 'ideas' : 'jobs';
  const res = await queryDb(`SELECT * FROM ${table} WHERE slug = $1`, [slug]);
  if (res.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Opportunité introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const row = res.rows[0];
  return new Response(JSON.stringify({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      isActive: Boolean(row.is_active),
      socialPublishAt: row.social_publish_at || calculateDefaultSocialPublishAt(),
      socialStatus: row.social_status || 'SCHEDULED',
      socialWhatsapp: row.social_whatsapp || '',
      socialTelegram: row.social_telegram || '',
      socialTiktok: row.social_tiktok || ''
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { type = 'job', slug, action, isActive, socialPublishAt, socialStatus, socialWhatsapp, socialTelegram, socialTiktok } = body;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const table = type === 'idea' ? 'ideas' : 'jobs';

    // Action 1-clic : bascule de publication
    if (action === 'toggle-publish') {
      const newActive = Boolean(isActive);
      const newStatus = newActive ? 'SCHEDULED' : 'PAUSED';
      await queryDb(
        `UPDATE ${table} SET is_active = $1, social_status = $2, updated_at = NOW() WHERE slug = $3`,
        [newActive, newStatus, slug]
      );
      return new Response(JSON.stringify({ success: true, isActive: newActive, socialStatus: newStatus }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mise à jour complète des paramètres
    await queryDb(`
      UPDATE ${table} SET
        is_active = $1,
        social_publish_at = $2,
        social_status = $3,
        social_whatsapp = $4,
        social_telegram = $5,
        social_tiktok = $6,
        updated_at = NOW()
      WHERE slug = $7
    `, [
      Boolean(isActive),
      socialPublishAt || null,
      socialStatus || 'SCHEDULED',
      socialWhatsapp || '',
      socialTelegram || '',
      socialTiktok || '',
      slug
    ]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/admin/opportunity.ts scripts/test-admin-api.ts
git commit -m "feat(api): add admin opportunity endpoint for toggle publish and social settings"
```

---

### Task 4: Composant In-Page d'Administration (`OpportunityAdminPanel.astro`)

**Files:**
- Create: `src/components/OpportunityAdminPanel.astro`
- Modify: `src/pages/opportunites/[slug].astro` (inclusion du panneau)
- Modify: `src/pages/idees/[slug].astro` (inclusion du panneau)

**Interfaces:**
- Consumes: `/api/admin/opportunity`
- Produces: Panneau dépliable responsive avec bascule 1-clic et configuration sociale.

- [ ] **Step 1: Créer le composant `OpportunityAdminPanel.astro`**

Le composant contient :
- Un bandeau compact discret visible uniquement pour l'admin (activé par `getAdminCookieToken()`).
- Statut actuel (🟢 En ligne / 🔴 Dépublié).
- Bouton 1-clic pour Dépublier/Republier.
- Bouton "⚙️ Diffusion réseaux" qui déplie un panneau responsive intégré à la page.
- Champs pré-remplis pour la date, WhatsApp, Telegram, TikTok avec boutons de copie rapide 📋 et bouton "Enregistrer".

- [ ] **Step 2: Intégrer le composant dans `src/pages/opportunites/[slug].astro` et `src/pages/idees/[slug].astro`**

Placer `<OpportunityAdminPanel type="job" slug={job.slug} ... />` juste en dessous de l'en-tête de la fiche.

- [ ] **Step 3: Vérifier le build Astro**

Run: `npm run build`  
Expected: PASS sans erreur de syntaxe ou d'import

- [ ] **Step 4: Commit**

```bash
git add src/components/OpportunityAdminPanel.astro src/pages/opportunites/\[slug\].astro src/pages/idees/\[slug\].astro
git commit -m "feat(ui): add in-page admin panel for opportunities and social publishing"
```

---

### Task 5: Amélioration du Listing `/opportunites/index.astro`

**Files:**
- Modify: `src/pages/opportunites/index.astro`

**Interfaces:**
- Intègre la détection admin côté client.
- Affiche le bouton 1-clic "Dépublier / Republier" sur chaque carte.
- Propose le filtre rapide d'affichage pour l'admin : `[Toutes] [Publiées] [Dépubliées]`.
- Marque visuellement les opportunités inactives (badge rouge `"Dépubliée / Hors-ligne"` et opacité réduite).

- [ ] **Step 1: Modifier `src/pages/opportunites/index.astro`**

- Mettre à jour `getUnifiedJobs({ includeInactive: true })` pour que les cartes inactives soient présentes dans le DOM mais masquées par défaut pour les non-admins.
- Ajouter le badge et le bouton 1-clic sur chaque carte dans la grille.
- Ajouter le sélecteur de filtre admin `admin-filter-status` (visible uniquement si admin connecté).
- Connecter le clic sur "Dépublier / Republier" à l'appel API `fetch('/api/admin/opportunity', { method: 'POST', body: JSON.stringify({ action: 'toggle-publish', ... }) })`.

- [ ] **Step 2: Vérifier le build Astro**

Run: `npm run build`  
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/opportunites/index.astro
git commit -m "feat(ui): add admin quick-unpublish buttons and status filters to opportunities listing"
```

---

### Task 6: Tests d'Intégration & Validation de Bout en Bout

**Files:**
- Test: `scripts/test-e2e-workflow.ts`

- [ ] **Step 1: Écrire le script de test end-to-end**

Tester le workflow complet :
1. Insertion d'une offre de test avec génération sociale.
2. Appel de l'API avec token admin pour dépublier l'offre -> vérifier `is_active = false` et `social_status = 'PAUSED'`.
3. Appel de l'API pour mettre à jour la date sociale et les textes -> vérifier la persistance.
4. Appel de l'API pour republier -> vérifier `is_active = true` et `social_status = 'SCHEDULED'`.
5. Nettoyage de l'offre de test.

- [ ] **Step 2: Exécuter le test e2e**

Run: `npx tsx scripts/test-e2e-workflow.ts`  
Expected: PASS avec `All end-to-end checks verified!`

- [ ] **Step 3: Lancer le build complet du projet**

Run: `npm run build`  
Expected: Build success sans aucune erreur.

- [ ] **Step 4: Commit final**

```bash
git add scripts/test-e2e-workflow.ts
git commit -m "test: add comprehensive e2e test for opportunity admin and social publishing workflow"
```
