# Design Doc : Gestion des Opportunités et Planification Réseaux Sociaux par l'Administrateur

**Date :** 2026-10-15  
**Auteur :** Antigravity & Sylvain  
**Statut :** Validé / En attente d'implémentation  

---

## 1. Contexte & Objectifs

Le portail **JobAvenir** centralise des opportunités d'emploi, de stage, de formation, de projets et d'idées d'entreprise collectées automatiquement par des scripts de scraping ou rédigées manuellement.

L'administrateur du site, authentifié via le système d'authentification existant (cookie `ml_admin_token` validé par le secret `CMS_ADMIN_SECRET`), doit pouvoir :
1. **Gérer la publication** de chaque opportunité : basculer entre **Publié** et **Dépublié** (`is_active`). Par défaut, les opportunités collectées arrivent publiées ; l'admin doit pouvoir dépublier une offre à tout moment et la republier si nécessaire.
2. **Préparer la diffusion sur les réseaux sociaux** :
   - Définir une date et heure de publication planifiée (`social_publish_at`).
   - Définir un statut de publication sociale (`DRAFT`, `SCHEDULED`, `PUBLISHED`).
   - Rédiger ou pré-remplir automatiquement 3 textes dédiés pour :
     - **WhatsApp** (style direct, puces claires, liens faciles à ouvrir).
     - **Telegram** (style informatif avec émojis attractifs et hashtags ciblés).
     - **TikTok** (script court / hook accrocheur, points forts du poste/idée, appel à l'action en bio).
   - Ces champs permettront aux futurs scripts d'automatisation de récupérer les offres prêtes à être publiées à l'horodatage convenu.
3. **Expérience utilisateur mobile-first** :
   - Éviter les modales fenêtrées rigides susceptibles d'être tronquées ou pénibles sur smartphone.
   - Proposer une zone / panneau de configuration dépliable directement dans la page (*In-page collapsible drawer / section*), parfaitement responsive.
4. **Visibilité pour l'administrateur** :
   - Les visiteurs non-authentifiés ne voient que les offres publiées (`is_active = true`).
   - L'administrateur peut visualiser les offres dépubliées sur le listing `/opportunites` avec un filtre dédié *(Toutes / Publiées / Dépubliées)* et un badge distinctif.

---

## 2. Architecture & Modèle de Données

Les modifications s'appliquent de manière rétrocompatible et transparente aux deux tables de contenu : `jobs` (offres, stages, formations, concours) et `ideas` (idées business).

### 2.1 Évolution du Schéma SQL (SQLite & PostgreSQL)

Nouvelles colonnes ajoutées :
* `social_publish_at` : `TIMESTAMP WITH TIME ZONE` (PostgreSQL) / `TEXT` (SQLite format ISO8601).
* `social_status` : `VARCHAR(50) DEFAULT 'DRAFT'` (valeurs: `DRAFT`, `SCHEDULED`, `PUBLISHED`, `FAILED`).
* `social_whatsapp` : `TEXT` (contenu personnalisé pour WhatsApp).
* `social_telegram` : `TEXT` (contenu personnalisé pour Telegram).
* `social_tiktok` : `TEXT` (script / description courte pour TikTok).

Ces colonnes sont accompagnées d'un index sur `(is_active, social_status, social_publish_at)` pour permettre aux futurs cron-jobs de collecter rapidement les messages à envoyer.

Dans `src/lib/db.ts` :
- Mise à jour des chaînes `SQLITE_SCHEMA_SQL` et `PG_SCHEMA_SQL`.
- Ajout de directives `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ...` et `ALTER TABLE ideas ADD COLUMN IF NOT EXISTS ...` dans `initDatabaseSchema()` pour migrer les bases de données existantes sans perte de données.
- Enrichissement des interfaces `DbJob` et `DbIdea` ainsi que des fonctions de requêtage `getAllDbJobs()`, `getUnifiedJobs(options?: { includeInactive?: boolean })` et `getJobBySlug(slug: string, options?: { includeInactive?: boolean })`.

---

## 3. API Backend : `/api/admin/opportunity`

Un endpoint dynamique SSR Astro est créé dans `src/pages/api/admin/opportunity.ts` (`export const prerender = false`).

### 3.1 Authentification & Autorisation
Toute requête vérifie la validité du jeton admin :
- Récupération du token depuis le cookie `ml_admin_token` ou l'en-tête `Authorization: Bearer <token>`.
- Comparaison avec le hachage SHA-256 du secret `CMS_ADMIN_SECRET` (avec timing-safe comparison ou correspondance de hash).
- Si invalide : retour immédiat `401 Unauthorized` `{ error: "Accès refusé" }`.

### 3.2 Méthodes supportées
* **`GET /api/admin/opportunity?type=job|idea&slug=<slug>`** :
  - Renvoie les détails complets de l'opportunité (statut `is_active`, `social_publish_at`, `social_status`, `social_whatsapp`, `social_telegram`, `social_tiktok`).
* **`POST /api/admin/opportunity`** :
  - Corps JSON :
    ```json
    {
      "type": "job" | "idea",
      "slug": "string",
      "isActive": boolean,
      "socialPublishAt": string | null,
      "socialStatus": "DRAFT" | "SCHEDULED" | "PUBLISHED",
      "socialWhatsapp": string,
      "socialTelegram": string,
      "socialTiktok": string
    }
    ```
  - Met à jour l'enregistrement ciblé dans la table appropriée (`jobs` ou `ideas`) avec `updated_at = NOW()`.
  - Renvoie `{ success: true, updated: { ... } }`.

---

## 4. Générateur de Contenus Réseaux Sociaux

Pour faciliter le travail de l'administrateur, une fonction utilitaire côté client (ou partagée) génère des textes pré-remplis optimisés :

1. **WhatsApp :**
   ```text
   📢 *OPPORTUNITÉ MALI — [TITRE]*
   🏢 Organisme : [ENTREPRISE/SECTEUR]
   📍 Lieu : [LIEU]
   📄 Type : [TYPE DE CONTRAT]
   
   👉 Consultez les détails et postulez ici :
   https://job.malihub.digital/opportunites/[SLUG]
   ```
2. **Telegram :**
   ```text
   🚀 *[TITRE]*
   
   📍 *Lieu :* [LIEU]
   🏢 *Organisme :* [ENTREPRISE]
   ⏳ *Date limite :* [DEADLINE ou "Dès que possible"]
   
   🔗 *Consulter l'offre complète :*
   https://job.malihub.digital/opportunites/[SLUG]
   
   #EmploiMali #MaliJobs #Recrutement #Bamako
   ```
3. **TikTok (Script vidéo court) :**
   ```text
   🎬 [ACCROCHE] : "Tu cherches une opportunité au Mali en ce moment ? Regarde ça !"
   
   📌 Poste : [TITRE]
   📍 Lieu : [LIEU]
   🏢 Entreprise : [ENTREPRISE]
   
   💡 Conseil express : Prépare ton CV et postule avant le [DEADLINE].
   👉 Lien de l'offre disponible dans la bio ou sur JobAvenir Mali !
   
   Hashtags : #Mali #Bamako #JobAvenir #EmploiMali #Opportunites
   ```

L'administrateur peut modifier ces textes à sa guise ou cliquer sur "✨ Générer / Réinitialiser" pour recalculer les propositions.

---

## 5. Interface Utilisateur & Intégration

### 5.1 Composant `OpportunityAdminPanel.astro`
Un composant autonome est injecté sur :
- `src/pages/opportunites/[slug].astro`
- `src/pages/idees/[slug].astro`

**Comportement :**
- Côté client, vérifie si l'administrateur est connecté (`getAdminCookieToken()`).
- Si non connecté : le composant reste totalement invisible et inerte.
- Si connecté :
  - Affiche un bandeau d'administration élégant avec le statut actuel (🟢 *En ligne* ou 🔴 *Dépublié*).
  - Un bouton d'action *"⚙️ Gérer l'opportunité & Réseaux sociaux"* permet de déplier le panneau intégré.
  - Le panneau se déploie avec une transition fluide au sein de la page (responsive mobile et desktop).
  - Contrôles disponibles :
    - Switch interactif "Publié / Dépublié" avec retour immédiat.
    - Date & heure de publication planifiée.
    - Statut de diffusion sociale.
    - Édition des 3 blocs WhatsApp, Telegram, TikTok avec boutons de copie presse-papier 📋.
    - Bouton d'enregistrement avec message de confirmation toast.

### 5.2 Vue Listing `src/pages/opportunites/index.astro`
- En mode admin, la page permet d'afficher les offres dépubliées (avec un filtre supplémentaire "Toutes / Publiées / Dépubliées").
- Les cartes des offres dépubliées affichent un badge rouge `"Hors-ligne / Dépublié"` et un contour distinctif.
- Un bouton d'action rapide sur chaque carte permet à l'admin de basculer la publication en un clic.

---

## 6. Stratégie de Test & Validation

1. **Test unitaire et d'intégration base de données :**
   - Migration de la base locale SQLite via `initDatabaseSchema()`.
   - Vérification de la présence des colonnes `social_publish_at`, `social_whatsapp`, etc.
2. **Test de sécurité API :**
   - Requête non authentifiée vers `/api/admin/opportunity` -> doit retourner `401`.
   - Requête avec cookie/token admin valide -> mise à jour effective en base.
3. **Test fonctionnel UI (Desktop & Mobile) :**
   - Connexion admin sur `/login`.
   - Visite d'une opportunité sur `/opportunites/[slug]`.
   - Dépliage du panneau d'administration.
   - Dépublication de l'offre -> vérification de la persistance.
   - Génération des textes réseaux sociaux + planification horaire -> enregistrement.
   - Déconnexion admin -> vérification que l'offre dépubliée n'est plus visible pour les visiteurs ordinaires.
