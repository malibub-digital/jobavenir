# Design Doc : Gestion Simplifiée des Opportunités et Diffusion Réseaux Sociaux

**Date :** 2026-10-15  
**Auteur :** Antigravity & Sylvain  
**Statut :** Validé / En attente d'implémentation  

---

## 1. Vision & Principes Directeurs

Le portail **JobAvenir** référence des opportunités d'emploi, de stage, de formation, de projets et d'idées business.

Pour éliminer la charge quotidienne de modération et de maintenance manuelle :
1. **Zéro action manuelle obligatoire (Prêt à l'emploi par défaut) :**
   - Chaque opportunité collectée est immédiatement planifiée avec un horodatage par défaut (`social_publish_at = NOW() + 1 heure`).
   - Les 3 textes pour les réseaux sociaux (**WhatsApp**, **Telegram**, **TikTok**) sont générés automatiquement lors de la collecte ou de l'affichage initial.
   - Les textes exploitent la richesse des balises **Open Graph** déjà en place (carte d'aperçu dynamique avec image de catégorie/logo, titre accrocheur et détails télégraphiques).
2. **Modération "par exception" en 1 clic :**
   - Si une opportunité est inadéquate ou expirée, l'administrateur peut la **dépublier en un seul clic direct** depuis la carte dans le listing `/opportunites`.
   - Si l'offre est dépubliée (`is_active = false`), elle disparaît immédiatement pour le public et sa diffusion sur les réseaux sociaux est neutralisée.
3. **Zone de réglages "In-Page" sans modale :**
   - Sur la fiche détaillée (`/opportunites/[slug]` et `/idees/[slug]`), un panneau dépliable discret permet d'ajuster l'horodatage ou de retoucher un texte si nécessaire, sans encombrer l'écran sur mobile.
4. **Visibilité réservée à l'administrateur :**
   - Les visiteurs non authentifiés ne voient que les offres publiées.
   - L'administrateur authentifié peut afficher les offres dépubliées (avec badge d'alerte et filtre dédié) pour les réactiver si besoin.

---

## 2. Modèle de Données & Persistance

Les tables `jobs` et `ideas` intègrent des colonnes pour la diffusion sociale, compatibles SQLite et PostgreSQL.

### 2.1 Schéma des tables

* `is_active` : `BOOLEAN` (PG) / `INTEGER` (SQLite), défaut `1` / `true`.
* `social_publish_at` : `TIMESTAMP WITH TIME ZONE` (PG) / `TEXT` (SQLite ISO8601).
  - Par défaut : calculé automatiquement à la date de collecte + 1 heure (ou date de publication).
* `social_status` : `VARCHAR(50) DEFAULT 'SCHEDULED'` :
  - Valeurs : `'SCHEDULED'` (planifié par défaut), `'PUBLISHED'` (diffusé), `'PAUSED'` (en pause / offre dépubliée), `'DRAFT'` (brouillon).
* `social_whatsapp` : `TEXT` (texte pré-généré prêt pour diffusion WhatsApp).
* `social_telegram` : `TEXT` (texte pré-généré prêt pour diffusion Telegram).
* `social_tiktok` : `TEXT` (script court / description vidéo pour TikTok).

### 2.2 Migrations et requêtes dans `src/lib/db.ts`
- Mises à jour transparentes via `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ...` et `ALTER TABLE ideas ADD COLUMN IF NOT EXISTS ...`.
- Indexation sur `(is_active, social_status, social_publish_at)` pour les requêtes des futurs robots de diffusion :
  ```sql
  SELECT * FROM jobs 
  WHERE is_active = true 
    AND social_status = 'SCHEDULED' 
    AND social_publish_at <= NOW()
  ORDER BY social_publish_at ASC;
  ```
- Ajout d'une fonction utilitaire `generateSocialTexts(item)` qui produit les textes optimisés si les colonnes sont vides en base.

---

## 3. Format des Textes Réseaux Sociaux & Optimisation Open Graph

Comme chaque page `/opportunites/[slug]` dispose déjà d'un aperçu enrichi (grande image Open Graph, titre propre sans doublon de site, faits clés comme lieu, type et date limite), les messages sociaux sont concis et incitent au clic :

### 3.1 WhatsApp
```text
📢 *[TITRE]*
🏢 [ENTREPRISE/ORGANISME] • 📍 [LIEU] • 📄 [CONTRAT]

👉 Détails complets et candidature :
https://job.malihub.digital/opportunites/[SLUG]
```

### 3.2 Telegram
```text
🚀 *[TITRE]*
🏢 *Organisme :* [ENTREPRISE]
📍 *Lieu :* [LIEU]
⏳ *Date limite :* [DEADLINE]

🔗 *Consulter et postuler :*
https://job.malihub.digital/opportunites/[SLUG]

#EmploiMali #MaliJobs #Recrutement #Bamako
```

### 3.3 TikTok (Script court pour créateur / vidéo automatisée)
```text
🎬 Hook : "Une nouvelle opportunité vient de tomber au Mali !"
📌 Poste : [TITRE]
🏢 Organisme : [ENTREPRISE] • 📍 [LIEU]
💡 Postule avant le [DEADLINE]
👉 Lien direct dans la bio ou sur JobAvenir Mali !

#Mali #Bamako #JobAvenir #EmploiMali
```

---

## 4. API Backend : `/api/admin/opportunity`

Endpoint SSR Astro (`src/pages/api/admin/opportunity.ts`) :
- **Sécurité :** Authentification obligatoire via le token du cookie `ml_admin_token` (SHA-256 de `CMS_ADMIN_SECRET`). Retourne `401 Unauthorized` si absent ou non conforme.
- **Actions rapides supportées :**
  1. **Bascule de publication (`togglePublish`)** :
     - Reçoit `{ type: "job" | "idea", slug: string, isActive: boolean }`.
     - Si `isActive` passe à `false` : `is_active = false` et `social_status = 'PAUSED'`.
     - Si `isActive` passe à `true` : `is_active = true` et `social_status = 'SCHEDULED'`.
     - Réponse instantanée pour les boutons 1-clic.
  2. **Mise à jour complète (`updateDetails`)** :
     - Reçoit `{ type, slug, isActive, socialPublishAt, socialStatus, socialWhatsapp, socialTelegram, socialTiktok }`.
     - Sauvegarde les modifications personnalisées de l'administrateur.

---

## 5. Interface Utilisateur & Ergonomie Mobile-First

### 5.1 Listing Général `/opportunites/index.astro`
- **En mode visiteur normal :** Seules les opportunités actives (`is_active = true`) sont renvoyées.
- **En mode administrateur :**
  - Les offres inactives sont également incluses avec une apparence estompée et un badge visible `"🔴 Dépubliée / Hors-ligne"`.
  - Un filtre rapide **[Toutes] [Publiées] [Dépubliées]** est proposé.
  - Chaque carte d'opportunité affiche un bouton d'action directe :
    - Si publiée : bouton **"🚫 Dépublier"** (1 clic direct, mise à jour immédiate sans rechargement lourd).
    - Si dépubliée : bouton **"✅ Republier"**.

### 5.2 Fiche Détaillée `/opportunites/[slug].astro` et `/idees/[slug].astro`
- Un composant `OpportunityAdminPanel.astro` est inséré en haut du contenu :
  - **Bandeau de statut :** Indique clairement l'état en ligne et la prochaine date de diffusion sociale planifiée.
  - **Bouton 1-clic :** "Dépublier l'annonce" / "Republier".
  - **Bouton dépliable :** "⚙️ Modifier la programmation sociale".
  - Au clic, le panneau s'ouvre dans la page (100% compatible mobile, aucun débordement). Les champs sont déjà pré-remplis avec la date par défaut et les textes générés. Un bouton "Enregistrer" valide les modifications.

---

## 6. Automatisation des Scripts de Collecte

Dans `scripts/scrape.ts` et `scripts/scrape-ideas.ts` :
- Lors de l'insertion de nouvelles opportunités :
  - Calcul automatique de `social_publish_at` (1 heure après l'insertion).
  - Génération automatique des textes `social_whatsapp`, `social_telegram`, `social_tiktok`.
  - `social_status` fixé à `'SCHEDULED'`.
- De cette façon, toute nouvelle opportunité arrivant par scraping est immédiatement prête pour les futurs robots de publication.

---

## 7. Plan de Validation

1. **Migration DB :** Démarrer le serveur / exécuter un script pour vérifier que les colonnes sont créées sur la base SQLite sans erreur.
2. **Scraping / Remplissage :** Vérifier que les offres existantes ont des textes sociaux générés et un horodatage par défaut.
3. **Bascule 1-clic :**
   - Connecté en admin, cliquer sur "🚫 Dépublier" sur une offre -> vérifier que l'offre passe en inactif.
   - En navigation privée / déconnecté -> vérifier que l'offre dépubliée n'apparaît plus dans le listing ni par son URL directe.
4. **Programmation sociale :**
   - Modifier une date et un texte dans le panneau de la fiche -> vérifier l'enregistrement en base.
