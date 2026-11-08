# Campagnes d'Innovation & Mode Pré-lancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place le système de campagnes d'innovation (`/concours/[slug]` et page secrète `/concours/[slug]/[secret]`), l'interrupteur `siteMode` (`PRELAUNCH` / `LIVE`) sur la page d'accueil sans perte de l'existant, la section Sponsoring et l'article modèle des 10 lauréats (`/actualites/modele-laureat-innovation`).

**Architecture:** Configuration centralisée dans `src/data/campaigns.json` et `site.config.json`. Un composant modulaire `src/components/CampaignLanding.astro` affiche la landing page de campagne (réutilisé sur `/` en mode `PRELAUNCH` et sur `/concours/[slug]` en tout temps). La page secrète non indexée `/concours/[slug]/[secret].astro` valide le `secretToken` avant d'afficher les 4 questions vidéo (< 3 min) et les boutons d'envoi direct au jury. Le système d'articles `/actualites/[slug].astro` est enrichi pour afficher une fiche modèle "Lauréat Innovation" partageable.

**Tech Stack:** Astro 5 (SSR `prerender = false`), Tailwind CSS, TypeScript, Markdown (`gray-matter`).

**Spec:** `docs/superpowers/specs/2026-11-08-campagne-innovation-design.md`

## Global Constraints

- `siteMode` dans `site.config.json` pilote `/` (`"PRELAUNCH"` vs `"LIVE"`) sans supprimer aucune ligne du portail d'offres actuel dans `src/pages/index.astro`.
- Un seul appel à l'action communautaire (rejoindre WhatsApp / Telegram) pour accéder aux consignes du concours ET recevoir régulièrement les opportunités (emploi, stage, formation, appel à projets, idées business, actu économique).
- La page secrète utilise un `secretToken` lisible mais non prédictible (`candidature-video-bamako-7k9`) et inclut `<meta name="robots" content="noindex, nofollow" />`.
- La section Partenaires Institutionnels (`APEJ`, `EOJ`, `PartiCIP`) est intégralement conservée sur la Landing Page.

---

### Task 1: Configuration centralisée (`site.config.json` & `src/data/campaigns.json`)

**Files:**
- Modify: `site.config.json`
- Create: `src/data/campaigns.json`

**Interfaces:**
- Produces: `siteConfig.siteMode` (`"PRELAUNCH" | "LIVE"`), `siteConfig.activeCampaignSlug` (`string`), et le catalogue `src/data/campaigns.json` exportant la liste `campaigns`.

- [ ] **Step 1: Ajouter `siteMode` et `activeCampaignSlug` dans `site.config.json`**

Ajouter en haut de `site.config.json` :
```json
  "siteMode": "PRELAUNCH",
  "activeCampaignSlug": "innovation-2026",
```

- [ ] **Step 2: Créer `src/data/campaigns.json` avec les deux campagnes (Lancement & Agricole)**

Créer `src/data/campaigns.json` contenant :
- Campagne 1 : `slug: "innovation-2026"`, `secretToken: "candidature-video-bamako-7k9"`, `status: "ACTIVE"`, dotation `3 × 100 000 FCFA` + `10 Lauréats Vitrine Officielle`, liens WhatsApp/Telegram temporaires remplaçables en 10s, les 4 questions simples pour la vidéo de moins de 3 minutes, l'URL du modèle `/actualites/modele-laureat-innovation`, et la configuration Sponsoring.
- Campagne 2 : `slug: "innovation-agricole"`, `secretToken: "candidature-agri-sikasso-4m2"`, `status: "UPCOMING"`, secteur `agriculture_elevage`, prête pour la prochaine vague.

- [ ] **Step 3: Vérifier la validité JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('site.config.json')); JSON.parse(require('fs').readFileSync('src/data/campaigns.json')); console.log('JSON OK');"`
Expected: `JSON OK`

---

### Task 2: Modèle d'Article Lauréat (`/actualites/modele-laureat-innovation` & enrichissement `[slug].astro`)

**Files:**
- Modify: `src/pages/actualites/[slug].astro`
- Modify: `src/pages/actualites/index.astro`
- Create: `src/content/actualites/modele-laureat-innovation.md`
- Modify: `src/data/pages/news.json`

**Interfaces:**
- Consumes: `src/content/actualites/*.md`
- Produces: Route `/actualites/modele-laureat-innovation` avec bandeau explicite de démonstration, encadré fiche projet (porteur, ville, secteur, besoin de financement), appel aux investisseurs/partenaires et boutons de partage (WhatsApp, Facebook, LinkedIn, Copier le lien).

- [ ] **Step 1: Passer `src/pages/actualites/[slug].astro` en SSR dynamique (`export const prerender = false;`) et supporter les métadonnées Lauréat**

Dans `src/pages/actualites/[slug].astro` :
- Ajouter `export const prerender = false;` en ligne 2 (pour servir dynamiquement tout fichier `.md` présent dans `src/content/actualites/`).
- Corriger `og:site_name` et les titres en `Mali Job`.
- Lire les champs optionnels du frontmatter : `isPlaceholderModel`, `laureateBadge`, `projectOwner`, `projectLocation`, `projectSector`, `projectStage`, `fundingGoal`, `contactCta`.
- Afficher en haut de l'article (si `isPlaceholderModel === true`) un bandeau ambre/or très visible :
  `✨ MODÈLE DE DÉMONSTRATION — Voici un aperçu concret de la page officielle qui sera rédigée et publiée sur Mali Job pour chacun des 10 projets lauréats du Concours d'Innovation.`
- Afficher une carte récapitulative "Fiche Lauréat & Opportunité d'Investissement" + en bas d'article un bloc **"🤝 Soutenir ce projet, devenir partenaire ou investir"** et une barre de partage en 1 clic (WhatsApp, Facebook, LinkedIn, Copier le lien).

- [ ] **Step 2: Créer l'article modèle `src/content/actualites/modele-laureat-innovation.md` et l'ajouter dans `src/data/pages/news.json`**

Créer `src/content/actualites/modele-laureat-innovation.md` illustrant un projet malien inspirant (ex: *« [Modèle Lauréat] AgroFroid Solaire : Conservation solaire mobile pour les coopératives maraîchères de Sikasso et Bamako »*), structuré exactement selon les 4 axes (L'équipe, Le problème & la solution, L'impact et l'usage de la dotation, Le besoin de financement pour passer à l'échelle).

---

### Task 3: Composant `CampaignLanding.astro` & Routes `/concours/[slug]` et `/concours/[slug]/[secret]`

**Files:**
- Create: `src/components/CampaignLanding.astro`
- Create: `src/pages/concours/[slug]/index.astro`
- Create: `src/pages/concours/[slug]/[secret].astro`

**Interfaces:**
- Consumes: `src/data/campaigns.json`, `site.config.json`
- Produces:
  - Composant `CampaignLanding.astro`
  - Page publique `/concours/[slug]`
  - Page secrète non indexée `/concours/[slug]/[secret]`

- [ ] **Step 1: Créer `src/components/CampaignLanding.astro`**

Inclut dans l'ordre :
1. **Hero Campagne & Pré-lancement** (avec les illustrations Mali Job `jobavenir-4.webp` et `jobavenir-5.webp`, badge d'annonce que les offres vérifiées arrivent bientôt, titre sur le Concours d'Innovation `3 × 100 000 FCFA` + `10 Lauréats publiés`).
2. **Bloc CTA Unique Communauté (WhatsApp & Telegram)** :
   - *"Rejoignez le groupe WhatsApp ou Telegram officiel pour : 1. Obtenir le lien secret et les consignes de participation au concours d'innovation — 2. Recevoir régulièrement nos offres d'emploi, stages, formations, appels à projets, idées business et actualités économiques."*
3. **Section "Ce qu'il y a à gagner" + Aperçu du Modèle de Page Lauréat** :
   - Carte 1 : **3 Grands Prix "Impulsion" de 100 000 FCFA** + mise en avant officielle.
   - Carte 2 : **Les 10 Lauréats "Vitrine Officielle"** rédigés et publiés sur Mali Job pour communiquer et lever des fonds.
   - **Aperçu interactif de la Page Modèle Lauréat** : encadré visuel montrant une maquette de l'article avec bouton **"👀 Voir le modèle de page Lauréat en taille réelle (`/actualites/modele-laureat-innovation`)"**.
4. **Section "Comment participer en 3 étapes simples"** (1. Rejoindre le groupe WhatsApp/Telegram $\rightarrow$ 2. Ouvrir le lien des consignes partagé dans le groupe $\rightarrow$ 3. Envoyer une vidéo simple de moins de 3 min au téléphone).
5. **Section "En préparation : Votre futur portail national des opportunités"** (aperçu des rubriques Emplois, Stages, Formations, Appels à projets & Projets agricoles à venir, Idées Business).
6. **Section "Devenir Sponsor / Soutenir l'Innovation au Mali"** : bloc dédié aux entreprises, ONG, institutions et membres de la diaspora souhaitant sponsoriser une dotation ou une campagne thématique (ex. Agriculture), avec boutons de contact (`/contact?sujet=sponsor` et email/WhatsApp).
7. **Section "Partenaires & Cadre Institutionnel" (`APEJ`, `EOJ`, `PartiCIP`)** : conservée intégralement pour la crédibilité du site.

- [ ] **Step 2: Créer `src/pages/concours/[slug]/index.astro`**

Page SSR (`export const prerender = false;`) qui charge la campagne depuis `src/data/campaigns.json` via `Astro.params.slug`, génère les balises OpenGraph/Twitter et affiche `<CampaignLanding campaign={campaign} isHomePrelaunch={false} />`.

- [ ] **Step 3: Créer la page secrète `src/pages/concours/[slug]/[secret].astro`**

Page SSR (`export const prerender = false;`) :
- Vérifie que `campaign` existe et que `Astro.params.secret === campaign.secretToken` (sinon `return Astro.redirect(\`/concours/\${campaign.slug}\`)`).
- Injecte `<meta name="robots" content="noindex, nofollow" />`.
- Affiche :
  - Bandeau "🔒 Page réservée aux membres de la communauté WhatsApp / Telegram Mali Job".
  - Rappel des dotations (`3 × 100 000 FCFA` + `10 pages Lauréats officielles`) avec lien direct vers `/actualites/modele-laureat-innovation` (*"Voir à quoi ressemblera votre page si vous êtes sélectionné"*).
  - **Les 4 questions simples pour votre vidéo de moins de 3 minutes** (1. Qui êtes-vous & votre équipe ? 2. Quel problème concret résolvez-vous ? 3. À quoi serviront les 100 000 FCFA & quels sont vos besoins de financement ? 4. Quelle est votre vision pour la suite ?) + conseils simples (téléphone, lumière du jour, montrer le terrain/produit).
  - **Boutons d'envoi de la vidéo** : Bouton WhatsApp Jury (`https://wa.me/...`) et Bouton Telegram Jury (`https://t.me/...`) + rappel de la date limite.

---

### Task 4: Interrupteur `siteMode` dans `src/pages/index.astro`, `MinimalHeader.astro` & `contact.astro`

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/MinimalHeader.astro`
- Modify: `src/pages/contact.astro`

**Interfaces:**
- Consumes: `siteConfig.siteMode`, `siteConfig.activeCampaignSlug`, `src/data/campaigns.json`, `src/components/CampaignLanding.astro`
- Produces: Bascule transparente entre le mode `PRELAUNCH` et le mode `LIVE`.

- [ ] **Step 1: Intégrer le switch `isPrelaunch` dans `src/pages/index.astro`**

Dans `src/pages/index.astro` :
- Importer `CampaignLanding` et `campaignsData`.
- Définir `const isPrelaunch = siteConfig.siteMode === "PRELAUNCH";` et récupérer la campagne active.
- Si `isPrelaunch` est vrai : afficher `<CampaignLanding campaign={activeCampaign} isHomePrelaunch={true} />` entre `<MinimalHeader slot="header" />` et `<Footer slot="footer" ... />`.
- Si `isPrelaunch` est faux (`"LIVE"`) : afficher un bandeau d'annonce de la campagne active en haut de page (pointant vers `/concours/${activeCampaign.slug}`) suivi de 100 % des sections actuelles du portail (Hero recherche, 3 piliers, 3 voies, dernières opportunités, idées, partenaires).

- [ ] **Step 2: Adapter `src/components/MinimalHeader.astro` pour le mode `PRELAUNCH` et ajouter l'option Sponsoring dans `src/pages/contact.astro`**

- Dans `MinimalHeader.astro` : lorsque `siteConfig.siteMode === "PRELAUNCH"`, afficher une navigation épurée orientée campagne (`Accueil`, `Concours Innovation`, `Modèle Lauréat`, `À propos`, `Devenir Sponsor / Contact`) pour éviter que les visiteurs ne tombent sur des listes d'annonces non validées, tout en conservant la navigation complète dès que `siteMode` passe à `"LIVE"`.
- Dans `src/pages/contact.astro` : ajouter l'option `"Sponsoriser une campagne d'innovation (Entreprise / ONG / Institution)"` dans le sélecteur de sujet et la pré-sélectionner automatiquement si l'URL contient `?sujet=sponsor`.

- [ ] **Step 3: Vérifier le build Astro complet**

Run: `npm run build`
Expected: Build réussi sans erreur TypeScript ni Astro.
