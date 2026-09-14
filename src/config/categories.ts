/**
 * Référentiel centralisé des catégories et sous-catégories de JobAvenir.
 * 
 * Source unique de vérité pour :
 * 1. Le prompt d'extraction IA (src/config/ai-prompts.ts)
 * 2. Le moteur de sélection d'images de fond OG (src/lib/image-bank.ts)
 * 3. Les filtres et badges de l'interface utilisateur
 * 
 * Pour ajouter une catégorie ou une sous-catégorie :
 * Ajoutez simplement une entrée dans l'objet CATEGORIES ci-dessous.
 */

export interface CategoryConfig {
  id: string;
  label: string;
  description: string;
  color: string; // Couleur dominante pour badges et overlays
  subCategories: string[];
  keywords: string[];
}

export const CATEGORIES: Record<string, CategoryConfig> = {
  informatique: {
    id: 'informatique',
    label: 'Informatique & Numérique',
    description: 'Technologies de l\'information, développement, réseaux, télécoms et IA',
    color: '#2563eb', // blue-600
    subCategories: [
      'Développement Web & Mobile',
      'Administration Réseaux & Systèmes',
      'Cybersécurité & Cloud',
      'Data, IA & Base de données',
      'Support Informatique & Maintenance',
      'Télécommunications & Fibre'
    ],
    keywords: ['développeur', 'informatique', 'réseau', 'système', 'cloud', 'data', 'télécom', 'logiciel', 'programmeur', 'web']
  },

  finance_gestion: {
    id: 'finance_gestion',
    label: 'Finance & Gestion',
    description: 'Comptabilité, audit, microfinance, banque, assurance et gestion d\'entreprise',
    color: '#059669', // emerald-600
    subCategories: [
      'Comptabilité Générale & Analytique',
      'Microfinance & Services Bancaires',
      'Contrôle de Gestion & Audit',
      'Ressources Humaines & Paie',
      'Achats & Logistique d\'Entreprise',
      'Direction & Management'
    ],
    keywords: ['comptable', 'finance', 'banque', 'microfinance', 'gestion', 'audit', 'rh', 'ressources humaines', 'caisse', 'fiscalité']
  },

  agriculture_elevage: {
    id: 'agriculture_elevage',
    label: 'Agriculture & Élevage',
    description: 'Agro-business, maraîchage, élevage, filières coton/céréales et transformation',
    color: '#16a34a', // green-600
    subCategories: [
      'Agronomie & Cultures Céréalières',
      'Maraîchage & Arboriculture',
      'Élevage & Santé Animale',
      'Agroalimentaire & Transformation Locale',
      'Irrigation, Eau & Machinisme Agricole',
      'Gestion Foncière & Coopératives'
    ],
    keywords: ['agronome', 'agriculture', 'élevage', 'ferme', 'semences', 'maraîchage', 'vétérinaire', 'agro-pastoral', 'irrigation', 'coton']
  },

  sante_social: {
    id: 'sante_social',
    label: 'Santé & Action Sociale',
    description: 'Soins médicaux, santé communautaire, pharmacie, nutrition et accompagnement social',
    color: '#e11d48', // rose-600
    subCategories: [
      'Médecine Générale & Spécialisée',
      'Soins Infirmiers & Sages-femmes',
      'Santé Communautaire & Nutrition',
      'Pharmacie & Laboratoire',
      'Action Sociale & Protection de l\'Enfance',
      'Hygiène Publique & Assainissement'
    ],
    keywords: ['médecin', 'infirmier', 'santé', 'sage-femme', 'nutrition', 'pharmacie', 'médical', 'social', 'hôpital', 'laboratoire']
  },

  btp_mines_industrie: {
    id: 'btp_mines_industrie',
    label: 'BTP, Mines & Énergie',
    description: 'Génie civil, construction, secteur minier, solaire et énergies renouvelables',
    color: '#d97706', // amber-600
    subCategories: [
      'Génie Civil & Conduite de Chantier',
      'Secteur Minier & Géologie',
      'Énergie Solaire & Électricité',
      'Topographie & Dessin DAO/BTP',
      'Maintenance Industrielle & Soudure',
      'Hydraulique & Forages'
    ],
    keywords: ['btp', 'chantier', 'génie civil', 'mines', 'or', 'mine', 'solaire', 'électricité', 'forage', 'géologie', 'conducteur de travaux']
  },

  humanitaire_developpement: {
    id: 'humanitaire_developpement',
    label: 'Humanitaire & Développement',
    description: 'ONG internationales et locales, agences onusiennes, projets d\'urgence et résilience',
    color: '#0284c7', // sky-600
    subCategories: [
      'Coordination de Projet & Suivi-Évaluation (MEAL)',
      'Logistique Humanitaire & Approvisionnement',
      'Sécurité Alimentaire & Moyens d\'Existence',
      'Protection & Droits Humains',
      'Eau, Assainissement & Hygiène (WASH)',
      'Plaidoyer & Relations Bailleurs'
    ],
    keywords: ['ong', 'humanitaire', 'meal', 'suivi-évaluation', 'wash', 'projet', 'coordinateur', 'programme', 'bailleurs', 'urgence']
  },

  education_formation: {
    id: 'education_formation',
    label: 'Éducation & Formation',
    description: 'Enseignement fondamental, secondaire, supérieur, formation professionnelle et continue',
    color: '#7c3aed', // violet-600
    subCategories: [
      'Enseignement Fondamental & Secondaire',
      'Formation Professionnelle & Technique',
      'Enseignement Supérieur & Recherche',
      'Alphabétisation & Éducation Non-Formelle',
      'Ingénierie Pédagogique & Coaching'
    ],
    keywords: ['professeur', 'enseignant', 'formation', 'formateur', 'école', 'pédagogie', 'alphabétisation', 'lycée', 'université']
  },

  communication_marketing: {
    id: 'communication_marketing',
    label: 'Communication & Marketing',
    description: 'Médias, journalisme, création de contenu, community management et relations publiques',
    color: '#ea580c', // orange-600
    subCategories: [
      'Community Management & Réseaux Sociaux',
      'Graphisme, Design & Vidéo',
      'Journalisme & Rédaction Web',
      'Relations Publiques & Événementiel',
      'Marketing & Vente / Commercial'
    ],
    keywords: ['communication', 'marketing', 'commercial', 'graphiste', 'vidéo', 'médias', 'réseaux sociaux', 'journaliste', 'vente']
  },

  artisanat_metiers: {
    id: 'artisanat_metiers',
    label: 'Artisanat & Métiers Manuels',
    description: 'Couture, teinture, menuiserie, mécanique, plomberie et transformation artisanale',
    color: '#854d0e', // yellow-800
    subCategories: [
      'Mécanique Auto & Deux-Roues',
      'Couture, Stylisme & Teinture',
      'Menuiserie Bois & Aluminium',
      'Plomberie & Climatisation',
      'Bâtiment Second-Œuvre (Peinture, Carrelage)'
    ],
    keywords: ['artisanat', 'couture', 'mécanique', 'menuiserie', 'plomberie', 'climatisation', 'atelier', 'artisan', 'teinture']
  },

  administration_publique: {
    id: 'administration_publique',
    label: 'Administration & Institutions',
    description: 'Fonction publique, concours de l\'État, collectivités territoriales et agences nationales',
    color: '#475569', // slate-600
    subCategories: [
      'Concours Directs & Professionnels',
      'Administration des Collectivités Locales',
      'Affaires Juridiques & Contentieux',
      'Secrétariat de Direction & Assistanat',
      'Archives & Documentation'
    ],
    keywords: ['concours', 'administration', 'collectivité', 'fonction publique', 'secrétariat', 'juriste', 'droit', 'ministère', 'état']
  },

  defense_securite: {
    id: 'defense_securite',
    label: 'Défense, Sécurité & Gardiennage',
    description: 'Sécurité privée, gardiennage, prévention des risques et concours des forces armées',
    color: '#15803d', // green-700
    subCategories: [
      'Sécurité Privée & Gardiennage',
      'Sécurité Incendie & Prévention HSE',
      'Opérations & Surveillance',
      'Concours Défense & Forces Armées'
    ],
    keywords: ['sécurité', 'gardiennage', 'vigile', 'hse', 'incendie', 'défense', 'armées', 'surveillance']
  },

  services_polyvalent: {
    id: 'services_polyvalent',
    label: 'Services & Transport',
    description: 'Chauffeurs, logistique de transport, hôtellerie, restauration et services généraux',
    color: '#64748b', // slate-500
    subCategories: [
      'Chauffeur (VL, Poids Lourd, Transport de personnel)',
      'Hôtellerie, Cuisine & Restauration',
      'Services Généraux & Entretien / Ménage',
      'Accueil & Réception',
      'Manutention & Magasinage'
    ],
    keywords: ['chauffeur', 'permis', 'conducteur', 'cuisine', 'restauration', 'hôtel', 'ménage', 'nettoyage', 'manutentionnaire', 'coursier']
  }
};

/**
 * Liste des libellés de catégories sous forme de tableau
 */
export const CATEGORY_LABELS = Object.values(CATEGORIES).map(c => c.label);

/**
 * Dictionnaire d'alias et correspondances historiques vers les catégories cibles
 */
const CATEGORY_ALIASES: Record<string, string> = {
  'informatique': 'informatique',
  'tech': 'informatique',
  'numérique': 'informatique',
  'finance': 'finance_gestion',
  'gestion': 'finance_gestion',
  'finance & gestion': 'finance_gestion',
  'santé': 'sante_social',
  'social': 'sante_social',
  'santé & social': 'sante_social',
  'btp': 'btp_mines_industrie',
  'industrie': 'btp_mines_industrie',
  'btp & industrie': 'btp_mines_industrie',
  'mines': 'btp_mines_industrie',
  'humanitaire': 'humanitaire_developpement',
  'coopération': 'humanitaire_developpement',
  'humanitaire & coopération': 'humanitaire_developpement',
  'formation': 'education_formation',
  'éducation': 'education_formation',
  'formation professionnelle': 'education_formation',
  'administration': 'administration_publique',
  'administration publique': 'administration_publique',
  'administration & institutions': 'administration_publique',
  'services': 'services_polyvalent',
  'services & polyvalent': 'services_polyvalent',
  'transport': 'services_polyvalent',
  'défense': 'defense_securite',
  'sécurité': 'defense_securite',
  'défense & sécurité': 'defense_securite',
  'communication': 'communication_marketing',
  'digital': 'communication_marketing',
  'communication & digital': 'communication_marketing',
  'marketing': 'communication_marketing',
  'agriculture': 'agriculture_elevage',
  'foncier': 'agriculture_elevage',
  'agriculture & foncier': 'agriculture_elevage',
  'environnement': 'agriculture_elevage',
  'artisanat': 'artisanat_metiers',
  'artisanat & métiers': 'artisanat_metiers'
};

/**
 * Récupère une catégorie par son ID, son label ou une ancienne appellation historique
 */
export function findCategory(identifier: string): CategoryConfig | undefined {
  if (!identifier) return undefined;
  const normalized = identifier.toLowerCase().trim();
  
  // 1. Recherche par ID direct
  if (CATEGORIES[normalized]) {
    return CATEGORIES[normalized];
  }

  // 2. Recherche via les alias historiques connus
  if (CATEGORY_ALIASES[normalized] && CATEGORIES[CATEGORY_ALIASES[normalized]]) {
    return CATEGORIES[CATEGORY_ALIASES[normalized]];
  }

  // 3. Recherche par correspondance exacte ou inclusion de label
  for (const cat of Object.values(CATEGORIES)) {
    const catLabelLower = cat.label.toLowerCase();
    if (catLabelLower === normalized || cat.id.toLowerCase() === normalized) {
      return cat;
    }
  }

  // 4. Recherche par inclusion partielle dans le nom
  for (const cat of Object.values(CATEGORIES)) {
    const catLabelLower = cat.label.toLowerCase();
    if (catLabelLower.includes(normalized) || normalized.includes(cat.id.toLowerCase())) {
      return cat;
    }
  }

  // 5. Recherche par mots-clés configurés
  for (const cat of Object.values(CATEGORIES)) {
    if (cat.keywords.some(k => normalized.includes(k))) {
      return cat;
    }
  }

  return undefined;
}

/**
 * Normalise un nom de sous-catégorie en identifiant de dossier (ex: "Développement Web & Mobile" -> "developpement_web_mobile")
 */
export function normalizeSubCategoryId(subCategory: string): string {
  return subCategory
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Retrouve la sous-catégorie officielle correspondante dans une catégorie donnée
 */
export function findSubCategory(categoryIdentifier: string, subCategoryName: string): string | undefined {
  const cat = findCategory(categoryIdentifier);
  if (!cat || !subCategoryName) return undefined;

  const normalizedInput = normalizeSubCategoryId(subCategoryName);
  for (const sub of cat.subCategories) {
    if (normalizeSubCategoryId(sub) === normalizedInput) {
      return sub;
    }
  }

  // Correspondance par inclusion
  for (const sub of cat.subCategories) {
    const normSub = normalizeSubCategoryId(sub);
    if (normSub.includes(normalizedInput) || normalizedInput.includes(normSub)) {
      return sub;
    }
  }

  return undefined;
}

/**
 * Génère le bloc textuel pour le prompt de l'IA contenant les catégories et leurs sous-catégories
 */
export function getCategoriesPromptInstruction(): string {
  const lines = Object.values(CATEGORIES).map(cat => {
    return `- "${cat.label}" (Sous-catégories possibles : ${cat.subCategories.join(', ')})`;
  });
  return lines.join('\n');
}

