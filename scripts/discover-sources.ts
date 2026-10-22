import dotenv from 'dotenv';
dotenv.config();

import { queryDb, initDatabaseSchema, upsertSource } from '../src/lib/db';

interface DiscoveredCandidate {
  name: string;
  url: string;
  category: string;
  subCategory?: string;
  description: string;
}

/**
 * Liste de sources potentielles identifiées lors de la veille pour le Mali
 */
const SEED_DISCOVERY_CANDIDATES: DiscoveredCandidate[] = [
  {
    name: 'Fonds d’Appui à la Formation Professionnelle et à l’Apprentissage (FAFPA)',
    url: 'https://fafpa.ml',
    category: 'Institutions publiques',
    subCategory: 'Formation & Financement',
    description: 'Organisme public malien finançant la formation professionnelle continue et l\'apprentissage des jeunes.'
  },
  {
    name: 'Agence Malienne de Normalisation et de Promotion de la Qualité (AMANORM)',
    url: 'https://amanorm.ml',
    category: 'Institutions publiques',
    subCategory: 'Agence publique',
    description: 'Normalisation, certification et qualité pour les entreprises et l\'artisanat malien.'
  },
  {
    name: 'API Mali - Agence de Promotion des Investissements',
    url: 'https://apimali.gov.ml',
    category: 'Institutions publiques',
    subCategory: 'Investissements',
    description: 'Guichet unique pour la création d\'entreprises et les opportunités d\'investissement au Mali.'
  },
  {
    name: 'DoniLab Incubateur Bamako',
    url: 'https://donilab.org',
    category: 'Incubateurs & Innovation',
    subCategory: 'Incubateur tech',
    description: 'Incubateur d\'entreprises innovantes et espace de coworking au Mali (startups, agri-tech, digital).'
  },
  {
    name: 'CREATEAM Mali Hub',
    url: 'https://createam.ml',
    category: 'Incubateurs & Innovation',
    subCategory: 'Accélérateur',
    description: 'Pépinière et incubateur d\'entreprises technologiques et entrepreneuriales à Bamako.'
  }
];

export async function discoverNewSources() {
  console.log('=== DÉCOUVERTE AUTOMATIQUE DE NOUVELLES SOURCES ===');
  await initDatabaseSchema();

  let discoveredCount = 0;
  let alreadyExisting = 0;

  for (const candidate of SEED_DISCOVERY_CANDIDATES) {
    const cleanUrl = candidate.url.replace(/\/+$/, '').toLowerCase();
    const existing = await queryDb(
      `SELECT id, name FROM sources WHERE LOWER(url) LIKE $1 OR LOWER(name) = LOWER($2) LIMIT 1`,
      [`%${cleanUrl.replace(/^https?:\/\//, '')}%`, candidate.name]
    );

    if (existing.rows.length > 0) {
      console.log(`[Discovery] Déjà répertorié : ${candidate.name} (id: ${existing.rows[0].id})`);
      alreadyExisting++;
      continue;
    }

    // Enregistrer avec discovery_status = 'AUTO_DISCOVERED' et is_active = false pour validation admin
    const id = await upsertSource({
      name: candidate.name,
      url: candidate.url,
      category: candidate.category,
      subCategory: candidate.subCategory,
      description: candidate.description,
      statusTechnical: 'ACTIF_200',
      scraperType: 'API_OU_DOM_MONITOR',
      frequency: 'QUOTIDIEN',
      isActive: false, // Inactif par défaut jusqu'à validation admin
      discoveryStatus: 'AUTO_DISCOVERED'
    });

    console.log(`[Discovery] ✨ Nouvelle source découverte et soumise à modération : [${id}] ${candidate.name}`);
    discoveredCount++;
  }

  console.log('\n=== BILAN DU CYCLE DE DÉCOUVERTE ===');
  console.log(`- Nouvelles sources proposées (à modérer dans /admin) : ${discoveredCount}`);
  console.log(`- Sources déjà connues                              : ${alreadyExisting}`);
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('discover-sources')) {
  discoverNewSources().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
