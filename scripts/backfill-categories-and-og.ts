import dotenv from 'dotenv';
dotenv.config();

import { pool, isSqlite } from '../src/lib/db';
import { CATEGORIES, findCategory } from '../src/config/categories';
import { generateJobOgImage } from '../src/lib/og-generator';

const SUBCAT_KEYWORDS: Record<string, Record<string, string[]>> = {
  informatique: {
    "Développement Web & Mobile": ["développeur", "fullstack", "frontend", "backend", "web", "mobile", "software", "logiciel", "programmeur", "application"],
    "Administration Réseaux & Systèmes": ["système", "systèmes", "réseau", "réseaux", "admin sys", "serveur", "infrastructure", "linux", "windows"],
    "Cybersécurité & Cloud": ["sécurité", "cyber", "cloud", "aws", "azure", "devops", "soc", "penetration", "audit sécurité"],
    "Data, IA & Base de données": ["ia", "data", "données", "intelligence artificielle", "database", "sql", "machine learning", "analyste de données"],
    "Support Informatique & Maintenance": ["support", "maintenance", "helpdesk", "technicien", "progiciel", "erp", "dépannage", "matériel"],
    "Télécommunications & Fibre": ["télécom", "fibre", "gsm", "antenne", "transmission", "ip", "câblage"]
  },
  finance_gestion: {
    "Comptabilité Générale & Analytique": ["comptable", "comptabilité", "clôture", "balance", "fiscalité", "déclaration", "bilan"],
    "Microfinance & Services Bancaires": ["microfinance", "banque", "bancaire", "crédit", "épargne", "caisse", "caissier", "guichet", "bceao"],
    "Contrôle de Gestion & Audit": ["audit", "contrôle de gestion", "contrôleur", "conformité", "compliance", "patrimoine", "risk"],
    "Ressources Humaines & Paie": ["rh", "ressources humaines", "paie", "recrutement", "personnel", "social"],
    "Achats & Logistique d'Entreprise": ["achats", "approvisionnement", "fournisseurs", "stock", "magasinage"],
    "Direction & Management": ["directeur", "direction", "manager", "gérant", "responsable d'agence", "coordinateur général"]
  },
  agriculture_elevage: {
    "Agronomie & Cultures Céréalières": ["agronome", "agriculture", "céréale", "coton", "champ", "semences", "cultures", "virunga", "vert"],
    "Maraîchage & Arboriculture": ["maraîchage", "légumes", "arbres", "pépinière", "fruits", "verger"],
    "Élevage & Santé Animale": ["élevage", "vétérinaire", "animale", "bétail", "volaille", "pastoral", "zootechnie"],
    "Agroalimentaire & Transformation Locale": ["agroalimentaire", "transformation", "conservation", "moulin", "conditionnement"],
    "Irrigation, Eau & Machinisme Agricole": ["irrigation", "tracteur", "motopompe", "barrage", "machinisme"],
    "Gestion Foncière & Coopératives": ["coopérative", "foncier", "gestion durable", "agriculteurs", "filière"]
  },
  sante_social: {
    "Médecine Générale & Spécialisée": ["médecin", "docteur", "chirurgien", "consultation", "clinique", "hôpital", "pneumonie", "santé"],
    "Soins Infirmiers & Sages-Femmes": ["infirmier", "infirmière", "sage-femme", "maïeuticien", "soins", "pansement"],
    "Santé Communautaire & Nutrition": ["nutrition", "malnutrition", "communautaire", "vaccination", "épidémie"],
    "Pharmacie & Laboratoire": ["pharmacie", "pharmacien", "laboratoire", "laborantin", "médicaments", "biologiste"],
    "Action Sociale & Protection de l'Enfance": ["social", "action sociale", "enfance", "vulnérable", "orphelinat", "genre"],
    "Hygiène Publique & Assainissement": ["hygiène", "assainissement", "salubrité", "déchets"]
  },
  btp_mines_industrie: {
    "Génie Civil & Conduite de Chantier": ["génie civil", "chantier", "bâtiment", "travaux", "conducteur de travaux", "himo", "rues", "route", "construction"],
    "Secteur Minier & Géologie": ["mine", "mines", "minier", "or", "géologie", "géologue", "opérateurs", "bull", "pelle", "carrière"],
    "Énergie Solaire & Électricité": ["énergie", "solaire", "électricité", "électricien", "photovoltaïque", "energy"],
    "Topographie & Dessin DAO/BTP": ["topographe", "topographie", "dessinateur", "dao", "autocad", "géomètre"],
    "Maintenance Industrielle & Soudure": ["maintenance", "mécanicien", "soudure", "soudeur", "industriel", "usine"],
    "Hydraulique & Forages": ["hydraulique", "forage", "adduction", "puits", "château d'eau"]
  },
  humanitaire_developpement: {
    "Coordination de Projet & Suivi-Évaluation (MEAL)": ["coordination", "coordinateur", "meal", "suivi-évaluation", "suivi", "évaluation", "impact evaluation", "data analyst", "projet", "programme"],
    "Logistique Humanitaire & Approvisionnement": ["logistique", "wfp", "approvisionnement", "convoi", "base logistique"],
    "Sécurité Alimentaire & Moyens d'Existence": ["sécurité alimentaire", "moyens d'existence", "faim", "résilience", "agropastoral"],
    "Protection & Droits Humains": ["protection", "droits humains", "droits", "conflit", "refugiés", "déplacés"],
    "Eau, Assainissement & Hygiène (WASH)": ["wash", "eau potable", "latrines", "hygiène humanitaire"],
    "Plaidoyer & Relations Bailleurs": ["plaidoyer", "bailleurs", "coopération", "ambassade", "croix-rouge", "forum", "aes", "partenariat", "humanitaire"]
  },
  education_formation: {
    "Enseignement Fondamental & Secondaire": ["professeur", "instituteur", "maître", "école", "collège", "lycée", "classe"],
    "Formation Professionnelle & Technique": ["formation professionnelle", "stage de formation", "contingent", "jeunes diplômés", "apprentissage", "boot camp"],
    "Enseignement Supérieur & Recherche": ["supérieur", "université", "chercheur", "faculté", "académique", "thèse"],
    "Alphabétisation & Éducation Non-Formelle": ["alphabétisation", "non-formelle", "centre d'alphabétisation"],
    "Ingénierie Pédagogique & Coaching": ["pédagogique", "coaching", "séminaire", "leadership", "conduite du changement"]
  },
  communication_marketing: {
    "Community Management & Réseaux Sociaux": ["community manager", "réseaux sociaux", "social media", "communication", "digital"],
    "Graphisme, Design & Vidéo": ["graphiste", "graphisme", "design", "photo", "vidéo", "multimédia", "portfolio"],
    "Journalisme & Rédaction Web": ["journaliste", "journalisme", "presse", "rédacteur", "rédaction", "article"],
    "Relations Publiques & Événementiel": ["relations publiques", "événement", "rp", "conférence", "porte-parole"],
    "Marketing & Vente / Commercial": ["commercial", "vente", "marketing", "vendeur", "prospection", "technico-commercial", "business"]
  },
  artisanat_metiers: {
    "Mécanique Auto & Deux-Roues": ["mécanique", "garage", "moteur", "auto", "moto", "véhicules"],
    "Couture, Stylisme & Teinture": ["couture", "teinture", "styliste", "couturier", "saponification", "femmes rurales", "artisanat"],
    "Menuiserie Bois & Aluminium": ["menuisier", "menuiserie", "bois", "aluminium", "meuble"],
    "Plomberie & Climatisation": ["plombier", "plomberie", "climatisation", "froid", "sanitaire"],
    "Bâtiment Second-Œuvre (Peinture, Carrelage)": ["peinture", "carrelage", "staff", "maçonnerie", "finition"]
  },
  administration_publique: {
    "Concours Directs & Professionnels": ["concours", "recrutement fonction publique", "fonction publique", "etat"],
    "Administration des Collectivités Locales": ["collectivité", "mairie", "commune", "cmss", "conseil d'administration", "pptd"],
    "Affaires Juridiques & Contentieux": ["juridique", "contentieux", "juriste", "droit", "avocat", "légal"],
    "Secrétariat de Direction & Assistanat": ["secrétaire", "assistanat", "assistante", "secrétariat", "accueil direction"],
    "Archives & Documentation": ["archives", "archiviste", "documentaliste", "gestion documentaire"]
  },
  defense_securite: {
    "Sécurité Privée & Gardiennage": ["gardiennage", "vigile", "sécurité privée", "gardien"],
    "Sécurité Incendie & Prévention HSE": ["hse", "incendie", "prévention des risques", "sécurité au travail"],
    "Opérations & Surveillance": ["sécurité", "défense", "analyste", "surveillance", "patrouille"],
    "Concours Défense & Forces Armées": ["forces armées", "armée", "fama", "incorporation", "militaire"]
  },
  services_polyvalent: {
    "Chauffeur (VL, Poids Lourd, Transport de personnel)": ["chauffeur", "conducteur", "permis", "coursier", "transport"],
    "Hôtellerie, Cuisine & Restauration": ["cuisine", "cuisinier", "restaurant", "hôtel", "restauration", "serveur"],
    "Services Généraux & Entretien / Ménage": ["entretien", "ménage", "nettoyage", "technicien de surface", "agents d'entretien"],
    "Accueil & Réception": ["accueil", "réception", "standardiste", "hôte", "hôtesse"],
    "Manutention & Magasinage": ["manutention", "manutentionnaire", "magasinage", "porteur", "candidature spontanée", "emploi des jeunes"]
  }
};

function deduceBestCategoryAndSub(title: string, currentCategory: string, description: string = '') {
  const text = (title + ' ' + description).toLowerCase();

  // Détections transversales prioritaires
  if (text.includes('chauffeur') || text.includes('conducteur') || text.includes('coursier')) {
    return {
      category: CATEGORIES.services_polyvalent,
      subCategory: "Chauffeur (VL, Poids Lourd, Transport de personnel)"
    };
  }
  if (text.includes("agent d'entretien") || text.includes("agents d'entretien") || text.includes('ménage') || text.includes('nettoyage')) {
    return {
      category: CATEGORIES.services_polyvalent,
      subCategory: "Services Généraux & Entretien / Ménage"
    };
  }
  if (text.includes('saponification')) {
    return {
      category: CATEGORIES.artisanat_metiers,
      subCategory: "Couture, Stylisme & Teinture"
    };
  }
  if (text.includes('juriste') || text.includes('contentieux')) {
    return {
      category: CATEGORIES.administration_publique,
      subCategory: "Affaires Juridiques & Contentieux"
    };
  }
  if (text.includes('technico-commercial')) {
    return {
      category: CATEGORIES.communication_marketing,
      subCategory: "Marketing & Vente / Commercial"
    };
  }
  if (text.includes('incorporation') || text.includes('forces armées') || text.includes('fama')) {
    return {
      category: CATEGORIES.defense_securite,
      subCategory: "Concours Défense & Forces Armées"
    };
  }
  if (text.includes('analyste sécurité-défense') || text.includes('sécurité-défense')) {
    return {
      category: CATEGORIES.defense_securite,
      subCategory: "Opérations & Surveillance"
    };
  }
  if (text.includes('secrétaire agent comptable') || text.includes('secrétaire')) {
    return {
      category: CATEGORIES.administration_publique,
      subCategory: "Secrétariat de Direction & Assistanat"
    };
  }
  if (text.includes('opérateurs de pelle') || text.includes('bull') || text.includes('minier')) {
    return {
      category: CATEGORIES.btp_mines_industrie,
      subCategory: "Secteur Minier & Géologie"
    };
  }
  if (text.includes('energy investments') || text.includes('solaire') || text.includes('énergie')) {
    const isCatBtp = (currentCategory || '').toLowerCase().includes('btp') || (currentCategory || '').toLowerCase().includes('énergie');
    if (isCatBtp) {
      return {
        category: CATEGORIES.btp_mines_industrie,
        subCategory: "Énergie Solaire & Électricité"
      };
    }
  }

  // Utilisation de la catégorie existante
  const cat = findCategory(currentCategory) || CATEGORIES.informatique;
  const catKeywords = SUBCAT_KEYWORDS[cat.id] || {};
  
  let bestSub = cat.subCategories[0];
  let maxScore = -1;

  for (const [subName, kwList] of Object.entries(catKeywords)) {
    let score = 0;
    for (const kw of kwList) {
      if (text.includes(kw.toLowerCase())) {
        score += kw.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestSub = subName;
    }
  }

  return { category: cat, subCategory: bestSub };
}

async function backfill() {
  console.log('=== DÉMARRAGE DU BACKFILL ET HARMONISATION DES ANNONCES ===');
  console.log(`Mode de base : ${isSqlite ? 'SQLite' : 'PostgreSQL'}`);

  const res = await pool.query('SELECT id, slug, title, company, category, domain, location, opportunity_type, metadata, source_id, original_source FROM jobs ORDER BY id ASC');
  const jobs = res.rows;
  console.log(`Nombre total d'offres à inspecter : ${jobs.length}`);

  let updatedCount = 0;
  let ogGeneratedCount = 0;

  for (const job of jobs) {
    let metadata: any = {};
    if (typeof job.metadata === 'string') {
      try {
        metadata = JSON.parse(job.metadata || '{}');
      } catch (_) {
        metadata = {};
      }
    } else if (typeof job.metadata === 'object' && job.metadata !== null) {
      metadata = { ...job.metadata };
    }

    // 1. Détection intelligente de la catégorie et sous-catégorie
    const { category: detectedCat, subCategory: detectedSub } = deduceBestCategoryAndSub(
      job.title,
      job.category,
      job.slug || ''
    );

    const targetCategoryLabel = detectedCat.label;
    metadata.subCategory = detectedSub;

    // 2. Génération du teaser si absent
    if (!metadata.teaser) {
      metadata.teaser = `Découvrez l'opportunité "${job.title}" avec ${job.company || 'JobAvenir Mali'}.`;
    }

    // 3. Régénération de la miniature OG
    try {
      const ogImageUrl = await generateJobOgImage({
        title: job.title,
        company: job.company,
        category: targetCategoryLabel,
        subCategory: metadata.subCategory,
        location: job.location,
        opportunityType: job.opportunity_type,
        slug: job.slug,
        sourceId: job.source_id,
        originalSource: job.original_source
      });
      metadata.ogImageUrl = ogImageUrl;
      ogGeneratedCount++;
    } catch (err) {
      console.warn(`[Backfill] Erreur génération miniature pour ${job.slug}:`, err);
      metadata.ogImageUrl = `/images/og/${job.slug}.webp`;
    }

    // 4. Sauvegarde en base
    await pool.query(
      `UPDATE jobs SET 
         category = $1,
         metadata = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [targetCategoryLabel, JSON.stringify(metadata), job.id]
    );

    updatedCount++;
    console.log(`✅ [#${job.id}] ${job.title.substring(0, 35)}... -> [${targetCategoryLabel}] > [${metadata.subCategory}]`);
  }

  console.log('==================================================');
  console.log(`✅ Backfill terminé avec succès :`);
  console.log(`- Offres traitées / mises à jour : ${updatedCount}`);
  console.log(`- Miniatures OG générées          : ${ogGeneratedCount}`);
  console.log('==================================================');
}

backfill()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erreur critique lors du backfill:', err);
    process.exit(1);
  });
