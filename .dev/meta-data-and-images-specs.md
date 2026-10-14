# Spécification fonctionnelle — Métadonnées de partage et génération des vignettes

## Objectif général

Optimiser la visibilité et l'attractivité des opportunités lors de leur partage sur les réseaux sociaux et messageries - WhatsApp, LinkedIn, Telegram, Facebook, TikTok, etc - grâce à des métadonnées dédiées et des vignettes visuelles générées automatiquement.

Piliers de la solution
📝 Accroche éditoriale - Rédaction par l'intelligence artificielle d'un texte teaser court - entre 120 et 160 caractères - lors de la consolidation de l'annonce, injecté dans les balises Open Graph et Twitter Cards.

🗂️ Taxonomie fine - Classification automatique du post par l'IA selon une liste fermée de sous-catégories métiers.

🔄 Banque d'images et rotation - Attribution d'un arrière-plan thématique pré-stocké via un algorithme tournant - round-robin - pour assurer la diversité visuelle au sein d'une même catégorie.

🏢 Référentiel des marques - Centralisation des logos des sources scrapées, avec initialisation d'un logo de secours - initiales stylisées - pour les annonceurs sans visuel officiel.

🖼️ Composition statique unique - Assemblage définitif de l'image au format 1200 × 630 pixels dès la création du post via Node.js, puis stockage direct de l'URL finale en base de données pour éviter tout calcul à la volée.

## 1. Données du post et métadonnées de partage

### Champ « Texte teaser »

- **Rôle** : Servir d'accroche éditoriale courte pour inciter au clic lors du partage sur les applications de messagerie et réseaux sociaux.
- **Règle de longueur** : Entre 120 et 160 caractères maximum — seuil d'affichage optimal avant troncature sur WhatsApp, Telegram, LinkedIn et Facebook.
- **Production du texte** : Rédigé directement par la couche d'intelligence artificielle lors de la phase de consolidation du post scrapé.
- **Consigne pour le prompt** : Formuler une phrase dynamique mettant en avant le poste, l'entreprise ou l'opportunité et un point fort — type de contrat, localisation ou compétence clé.

### Balisage technique sur la page de détail

**Open Graph standard :**

| Balise            | Valeur                                          |
| ----------------- | ----------------------------------------------- |
| `og:title`        | Titre du post ou de l'opportunité               |
| `og:description`  | Le texte teaser issu de la base de données      |
| `og:image`        | L'URL absolue vers la vignette finale assemblée |
| `og:image:width`  | 1200                                            |
| `og:image:height` | 630                                             |
| `og:type`         | `article` ou `website`                          |

**Cartes pour plateformes dédiées :** Intégration des balises Twitter Card au format `summary_large_image` pointant vers les mêmes données.

---

## 2. Taxonomie et catégorisation fine

Pour éviter la répétition visuelle et garantir la pertinence contextuelle, la taxonomie doit être suffisamment granulaire.

### Arborescence cible des catégories (12 macro-catégories)

Le référentiel officiel centralisé se trouve dans `src/config/categories.ts`. Il comprend 12 macro-catégories contextualisées pour le marché malien :

1. **Informatique & Numérique** (`informatique`) : Développement Web & Mobile, Administration Réseaux & Systèmes, Cybersécurité & Cloud, Data/IA & Base de données, Support Informatique, Télécoms & Fibre.
2. **Finance & Gestion** (`finance_gestion`) : Comptabilité Générale & Analytique, Microfinance & Services Bancaires, Contrôle de Gestion & Audit, Ressources Humaines & Paie, Achats & Logistique d'Entreprise, Direction & Management.
3. **Agriculture & Élevage** (`agriculture_elevage`) : Agronomie & Cultures Céréalières, Maraîchage & Arboriculture, Élevage & Santé Animale, Agroalimentaire & Transformation Locale, Irrigation/Machinisme Agricole, Gestion Foncière & Coopératives.
4. **Santé & Action Sociale** (`sante_social`) : Médecine Générale & Spécialisée, Soins Infirmiers & Sages-femmes, Santé Communautaire & Nutrition, Pharmacie & Laboratoire, Action Sociale & Protection de l'Enfance, Hygiène Publique & Assainissement.
5. **BTP, Mines & Énergie** (`btp_mines_industrie`) : Génie Civil & Conduite de Chantier, Secteur Minier & Géologie, Énergie Solaire & Électricité, Topographie & Dessin DAO, Maintenance Industrielle & Soudure, Hydraulique & Forages.
6. **Humanitaire & Développement** (`humanitaire_developpement`) : Coordination MEAL, Logistique Humanitaire, Sécurité Alimentaire, Protection & Droits Humains, WASH (Eau/Assainissement), Plaidoyer & Bailleurs.
7. **Éducation & Formation** (`education_formation`) : Enseignement Fondamental & Secondaire, Formation Professionnelle & Technique, Enseignement Supérieur, Alphabétisation, Ingénierie Pédagogique.
8. **Communication & Marketing** (`communication_marketing`) : Community Management, Graphisme/Design/Vidéo, Journalisme & Rédaction, Relations Publiques, Marketing & Vente.
9. **Artisanat & Métiers Manuels** (`artisanat_metiers`) : Mécanique Auto & Deux-Roues, Couture/Stylisme/Teinture, Menuiserie, Plomberie & Climatisation, Second-Œuvre (Peinture, Carrelage).
10. **Administration & Institutions** (`administration_publique`) : Concours Directs & Professionnels, Administration Locale, Affaires Juridiques, Secrétariat, Archives.
11. **Défense, Sécurité & Gardiennage** (`defense_securite`) : Sécurité Privée & Gardiennage, Sécurité Incendie & HSE, Opérations & Surveillance, Concours Défense.
12. **Services & Transport** (`services_polyvalent`) : Chauffeur (VL, PL, transport de personnel), Hôtellerie/Restauration, Services Généraux & Entretien, Accueil & Réception, Manutention & Magasinage.

### Règle d'attribution par l'intelligence artificielle

- Le prompt d'extraction IA (`src/config/ai-prompts.ts`) injecte dynamiquement l'arborescence officielle.
- L'IA retourne l'intitulé exact de la catégorie et de la sous-catégorie.
- En cas d'ambiguïté ou d'absence, le système applique le repli hiérarchique décrit en section 3.

---

## 3. Banque d'images thématiques et cycle de vie

### Constitution de la banque

- **Volume cible** : Jusqu'à 15 images distinctes par sous-catégorie (répartition dans `public/images/categories/[catId]/[subCatId]/`).
- **Critères visuels** :
  - Dimensions de base : Format 1200 × 630 pixels (ratio 16:9 / 1,91:1) au format WebP optimisé.
  - Style homogène : Photographie réaliste et chaleureuse, professionnelle, dynamique, valorisant le travail au Mali et en Afrique de l'Ouest, sans texte incrusté.
  - Zone de sécurité : Les 25 % inférieurs gauches doivent être épurés et lisibles pour accueillir le macaron de logo sans masquer les visages ou les éléments visuels majeurs.

### Algorithme de sélection déterministe avec repli hiérarchique

L'attribution (`src/lib/image-bank.ts`) fonctionne avec un hachage déterministe basé sur l'identifiant (slug) du post :

1. **Niveau 1 (Sous-catégorie)** : Recherche des fichiers dans `public/images/categories/[catId]/[subCatId]/`. S'il y a des images, sélection par `hash(seed) % total_images`.
2. **Niveau 2 (Macro-catégorie)** : Si le dossier de sous-catégorie est vide ou absent, sélection parmi les images à la racine de la catégorie `public/images/categories/[catId]/`.
3. **Niveau 3 (Repli global)** : Si aucune image n'est disponible, renvoi vers `public/images/categories/default.webp`.

---

## 4. Référentiel des annonceurs et logos de repli

### Gestion du logo lors de l'initialisation

Pour chaque source ou entreprise présente dans l'inventaire connu :

- **Si le logo officiel existe** : Il est nettoyé, détouré au besoin et stocké au format PNG avec transparence.
- **Si le logo est absent** : Un visuel de repli est généré dès l'enregistrement de l'annonceur dans le référentiel — traitement préalable et non à la volée.

### Règles de conception du logo de repli

- Visuel carré sur fond uni reprenant une couleur sobre ou issue d'une charte prédéfinie.
- Typographie épurée, sans empattement, affichant les 1 ou 2 initiales du nom de l'annonceur.
- L'asset généré est stocké de la même manière qu'un logo standard, assurant un traitement identique par la suite.

---

## 5. Processus d'assemblage de la vignette finale

L'assemblage est exécuté une seule fois lors de la création de l'annonce par le worker d'ingestion.

### Règles de mise en page

- **Support de base** : Image thématique attribuée — 1200 × 630 px.
- **Emplacement du logo** : Disposé en bas à gauche de la composition. Marges régulières par rapport aux bords gauche et bas — par exemple 48 pixels.
- **Conteneur du logo** : Le logo est placé à l'intérieur d'un encart blanc à angles arrondis — carte visuelle. Cet encart garantit un contraste maximal et une lisibilité parfaite, quelle que soit la texture de l'image de fond. Le logo — officiel ou de repli — est centré et redimensionné proportionnellement à l'intérieur de cet encart, avec une marge interne de respiration.
- **Sauvegarde** : Le résultat est exporté sous forme d'image statique optimisée — format JPEG ou WebP. Le fichier est déposé sur le stockage de médias et son URL permanente est directement enregistrée dans l'enregistrement de l'opportunité.
