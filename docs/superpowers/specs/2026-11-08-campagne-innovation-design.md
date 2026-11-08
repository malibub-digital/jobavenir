# Spécification — Système de Campagnes d'Innovation & Mode Pré-lancement Mali Job

**Date :** 2026-11-08  
**Projet :** Mali Job (`job.malihub.digital`)  
**Statut :** Validé

---

## 1. Objectif & Contexte

Avant l'ouverture publique du catalogue d'annonces d'emploi (en attente de validation), **Mali Job** lance une campagne d'acquisition d'audience sur les réseaux sociaux autour d'un **Concours d'Innovation** :
- **3 Grands Prix "Impulsion" de 100 000 FCFA** chacun + mise en avant officielle.
- **10 Lauréats "Vitrine Officielle" (Coup de Projecteur)** dont le projet sera rédigé par l'équipe et publié sous forme d'article vitrine dédié sur le site (`/actualites/[slug]`), leur offrant une URL officielle crédible pour communiquer, trouver des partenaires et lever des fonds.
- **Mécanisme d'acquisition en entonnoir (Funnel)** :
  1. Un seul appel à l'action sur la Landing Page : **rejoindre le groupe WhatsApp ou Telegram** (pour recevoir le lien des consignes du concours ET recevoir régulièrement les opportunités d'emploi, stage, formation, appel à projets, idées business, actualités économiques).
  2. Depuis le groupe communautaire, partage d'une **URL secrète non indexée** (`/concours/[slug]/[secretToken]`) expliquant comment envoyer une courte vidéo (< 3 minutes) présentant l'équipe, le projet, le besoin de financement et la vision future.

Le dispositif doit également :
- Préserver 100 % du travail actuel sur la page d'accueil ([src/pages/index.astro](file:///home/sylvain/Dev/malihub/job/src/pages/index.astro)) grâce à un interrupteur simple (`siteMode: "PRELAUNCH" | "LIVE"` dans [site.config.json](file:///home/sylvain/Dev/malihub/job/site.config.json)).
- Offrir une URL dédiée par campagne (`/concours/[slug]`) dès la première campagne, réutilisable pour les futures campagnes (notamment la prochaine **Campagne Innovation Agricole**) lorsque le portail sera en mode `LIVE`.
- Conserver la section **Partenaires Institutionnels (APEJ, EOJ, PartiCIP)** pour garantir la crédibilité du dispositif.
- Intégrer une section **Devenir Sponsor / Soutenir l'Innovation** pour attirer de nouveaux partenaires financiers.
- Proposer dès maintenant un **article modèle placeholder** (`/actualites/modele-laureat-innovation`) montrant concrètement aux candidats à quoi ressemblera leur page officielle de lauréat.

---

## 2. Architecture & Fichiers

### 2.1. Configuration centralisée
1. **[site.config.json](file:///home/sylvain/Dev/malihub/job/site.config.json)** :
   - Ajout de `"siteMode": "PRELAUNCH"` (`"PRELAUNCH"` affiche la campagne en page d'accueil `/` et simplifie la navigation publique ; `"LIVE"` affiche le portail complet avec un bandeau pointant vers la campagne active).
   - Ajout de `"activeCampaignSlug": "innovation-2026"`.
2. **`src/data/campaigns.json`** :
   - Centralise les paramètres de toutes les campagnes (valeurs modifiables en 10 secondes) :
     - Campagne 1 (`"slug": "innovation-2026"`, `"status": "ACTIVE"`, `"secretToken": "candidature-video-bamako-7k9"`).
     - Campagne 2 préparée en brouillon (`"slug": "innovation-agricole"`, `"status": "UPCOMING"`, `"secretToken": "candidature-agri-sikasso-4m2"`, liée au secteur `agriculture_elevage`).
   - Champs par campagne :
     - `slug`, `secretToken`, `status`, `badge`, `title`, `subtitle`, `sector`
     - `prizes`: dotation principale (`3 × 100 000 FCFA`), nombre de lauréats vitrine (`10`), URL de l'article modèle (`/actualites/modele-laureat-innovation`)
     - `community`: `whatsappGroupUrl`, `telegramGroupUrl`, liste des bénéfices membres
     - `submission`: `deadline`, `maxDurationMinutes` (`3`), `juryWhatsappNumber`, `juryWhatsappMessage`, `juryTelegramUrl`, les 4 questions simples de la vidéo
     - `sponsoring`: titre, texte d'appel aux sponsors, `contactEmail`, `contactWhatsapp`, `contactPageUrl` (`/contact?sujet=sponsor-innovation`)

### 2.2. Composants & Pages de Campagne
1. **`src/components/CampaignLanding.astro`** :
   - Composant réutilisable affichant :
     - **Hero Campagne & Pré-lancement** (avec illustrations Mali Job, annonce de l'ouverture prochaine des offres vérifiées, dotation 3 × 100 000 FCFA + 10 Lauréats).
     - **CTA Unique Communauté (WhatsApp & Telegram)** : mise en avant claire du double bénéfice (accès aux consignes du concours + réception régulière d'offres d'emploi, stages, formations, appels à projets, idées business, actus économiques).
     - **Section "Ce qu'il y a à gagner" & Carte Aperçu du Modèle Lauréat** : détail des 3 prix de 100k CFA et des 10 articles Lauréats, avec aperçu visuel cliquable vers `/actualites/modele-laureat-innovation`.
     - **Section "Ce qui arrive sur le portail Mali Job"** : aperçu des catégories (Emplois, Stages, Formations, Appels à projets, Idées business).
     - **Section "Devenir Sponsor / Soutenir l'Innovation au Mali"** : appel à manifestation d'intérêt pour entreprises, ONG, institutions et diaspora souhaitant sponsoriser les prochaines éditions (dont l'édition Agricole).
     - **Section "Partenaires & Cadre Institutionnel" (APEJ, EOJ, PartiCIP)** : reprise intégrale pour la crédibilité officielle.
2. **`src/pages/concours/[slug]/index.astro`** (`prerender = false`) :
   - Affiche `CampaignLanding.astro` pour la campagne correspondante (`/concours/innovation-2026`, `/concours/innovation-agricole`).
   - Permet de communiquer sur une URL dédiée stable dès la première campagne et pour toutes les suivantes.
3. **`src/pages/concours/[slug]/[secret].astro`** (`prerender = false`) :
   - Vérifie que `Astro.params.secret === campaign.secretToken` (sinon redirige vers `/concours/[slug]`).
   - Balise `<meta name="robots" content="noindex, nofollow" />`.
   - Présente :
     - Le rappel des récompenses et un bouton vers le modèle de page Lauréat (`/actualites/modele-laureat-innovation`).
     - Les **4 questions très simples** à aborder dans la vidéo de moins de 3 minutes (1. L'équipe, 2. Le projet concret, 3. L'usage des 100 000 FCFA et besoins de financement, 4. La vision future) + conseils rassurants de tournage au smartphone.
     - Les boutons directs d'envoi de la vidéo au Jury sur **WhatsApp** et **Telegram**.
4. **Adaptation de [src/pages/index.astro](file:///home/sylvain/Dev/malihub/job/src/pages/index.astro)** :
   - Si `siteConfig.siteMode === "PRELAUNCH"` : affiche `CampaignLanding.astro` (tout le code existant du portail reste intact dans le fichier et s'exécute dès que `siteMode` passe à `"LIVE"`).
   - Si `siteConfig.siteMode === "LIVE"` : affiche le portail complet actuel + un bandeau d'annonce en haut pointant vers `/concours/${siteConfig.activeCampaignSlug}` si une campagne est active.

### 2.3. Modèle d'Article Lauréat (`/actualites/modele-laureat-innovation`)
1. **Mise à jour de [src/pages/actualites/[slug].astro](file:///home/sylvain/Dev/malihub/job/src/pages/actualites/%5Bslug%5D.astro)** :
   - Passage en rendu dynamique (`export const prerender = false;`) pour supporter tous les articles présents dans `src/content/actualites/*.md` sans dépendre d'une liste statique figée.
   - Support des métadonnées optionnelles de fiche Lauréat dans le frontmatter Markdown (`isPlaceholderModel`, `projectMeta`: porteur, ville, secteur, stade, besoinFinancement, contactPorteur).
   - Affichage d'un **bandeau explicite de démonstration** lorsque `isPlaceholderModel: true` (*"✨ EXEMPLE DE PAGE LAURÉAT : Voici à quoi ressemblera votre page officielle sur Mali Job si votre projet fait partie des 10 lauréats sélectionnés"*).
   - Ajout en bas d'article d'un bloc **"🤝 Soutenir ce projet / Contacter le porteur"** et de **boutons de partage social** (WhatsApp, Facebook, LinkedIn, Copier le lien).
2. **Création de `src/content/actualites/modele-laureat-innovation.md`** :
   - Article vitrine complet, inspirant et réaliste (avec mentions `[Exemple / Modèle]` claires) montrant comment le projet d'un lauréat est raconté (L'équipe, Le problème résolu, L'impact terrain, Le besoin de financement) pour séduire investisseurs, clients et partenaires.
3. **Pré-remplissage du sujet Sponsor dans [src/pages/contact.astro](file:///home/sylvain/Dev/malihub/job/src/pages/contact.astro)** :
   - Permet au lien `/contact?sujet=sponsor` de pré-sélectionner ou d'accueillir proprement les demandes de sponsoring.

---

## 3. Vérification & Critères de Succès

1. En mode `"siteMode": "PRELAUNCH"`, `/` affiche la Landing Page de la campagne avec le CTA unique WhatsApp/Telegram, l'aperçu du modèle Lauréat, la section Sponsor et la section Partenaires (APEJ, EOJ, PartiCIP).
2. `/concours/innovation-2026` affiche la campagne avec ses balises OpenGraph prêtes pour les réseaux sociaux.
3. `/concours/innovation-2026/candidature-video-bamako-7k9` affiche la page secrète (`noindex, nofollow`) avec les 4 questions simples de la vidéo de 3 minutes et les boutons d'envoi au jury. Toute autre URL secrète invalide redirige vers `/concours/innovation-2026`.
4. `/actualites/modele-laureat-innovation` affiche le modèle de page Lauréat avec son bandeau d'exemple, sa fiche synthétique, son appel aux investisseurs/partenaires et ses boutons de partage.
5. En passant `"siteMode"` à `"LIVE"` dans [site.config.json](file:///home/sylvain/Dev/malihub/job/site.config.json), la page d'accueil officielle complète réapparaît immédiatement sans aucune perte.
