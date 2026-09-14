#!/usr/bin/env npx tsx
/**
 * Génère les images manquantes pour chaque sous-catégorie via OpenRouter Image API.
 * 
 * Modèle utilisé : FLUX.2 Klein 4B (le plus économique à ~$0.014/image)
 * Alternative disponible : Gemini 3.1 Flash Lite Image (per-token, très économique aussi)
 * 
 * Usage :
 *   npx tsx scripts/generate-category-images.ts          # Comble les trous (4 images par sous-cat)
 *   npx tsx scripts/generate-category-images.ts --dry-run # Affiche ce qui serait généré sans rien faire
 *   npx tsx scripts/generate-category-images.ts --model gemini  # Utilise Gemini Flash Lite
 *   npx tsx scripts/generate-category-images.ts --category informatique  # Une seule catégorie
 *   npx tsx scripts/generate-category-images.ts --target 2  # 2 images par sous-cat au lieu de 4
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { CATEGORIES, normalizeSubCategoryId } from '../src/config/categories';

// ─── Configuration ─────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const CATEGORIES_DIR = path.resolve(process.cwd(), 'public/images/categories');
const TARGET_PER_SUBCATEGORY = parseInt(process.argv.find(a => a.startsWith('--target'))?.split('=')[1] || '4');
const DRY_RUN = process.argv.includes('--dry-run');
const CATEGORY_FILTER = process.argv.find(a => a.startsWith('--category='))?.split('=')[1];
const USE_GEMINI = process.argv.includes('--model=gemini') || process.argv.includes('--gemini');

// Pauses entre les requêtes (ms)
const DELAY_BETWEEN_IMAGES = 3000;  // 3s entre chaque image
const DELAY_BETWEEN_SUBCATS = 5000; // 5s entre chaque sous-catégorie

// Modèles
const MODELS = {
  flux: 'black-forest-labs/flux.2-klein-4b',
  gemini: 'google/gemini-3.1-flash-lite-image'
};

const MODEL = USE_GEMINI ? MODELS.gemini : MODELS.flux;

// ─── Prompts contextualisés par sous-catégorie ─────────────────
// Chaque sous-catégorie a un ensemble de variations de prompts pour générer des images diversifiées
const SUBCATEGORY_PROMPTS: Record<string, Record<string, string[]>> = {
  informatique: {
    'Développement Web & Mobile': [
      'African software developer coding on dual monitors in modern tech office, JavaScript code visible on screen, warm ambient lighting, professional photography',
      'Young African woman programmer working on mobile app development, laptop showing code editor, bright modern coworking space in West Africa',
      'Team of African developers collaborating around large screen with web application mockups, modern startup environment, natural light',
      'African tech professional debugging code on laptop in contemporary office, multiple monitors showing React or Python code, professional setting'
    ],
    'Administration Réseaux & Systèmes': [
      'African network administrator managing server rack in data center, blue LED lights, cables organized, professional IT environment',
      'African IT systems engineer monitoring network dashboard on screen, modern control room, professional lighting',
      'African woman network engineer configuring router equipment, organized server room, professional datacenter environment',
      'African IT professional checking server status on laptop near rack servers, clean modern data center'
    ],
    'Cybersécurité & Cloud': [
      'African cybersecurity analyst reviewing security alerts on multiple monitors, dark SOC operations center, blue screens glowing',
      'African cloud security engineer working on AWS or Azure console, modern office, professional setup with security dashboards',
      'African woman cybersecurity specialist analyzing threat data, contemporary IT security center, multiple screens with security tools',
      'African IT professional managing cloud infrastructure dashboard, modern tech company office environment'
    ],
    'Data, IA & Base de données': [
      'African data scientist analyzing charts and machine learning models on screen, modern office with data visualizations, professional setting',
      'African AI engineer working with neural network visualizations on large screen, contemporary research lab environment',
      'African woman data analyst reviewing database schemas and analytics dashboards, bright modern office space',
      'African data professional coding Python for data analysis, Jupyter notebooks visible, modern tech workspace'
    ],
    'Support Informatique & Maintenance': [
      'African IT support technician repairing computer hardware, organized tech workshop, tools and components visible',
      'African helpdesk professional assisting user with computer, modern office support center, friendly interaction',
      'African IT maintenance specialist checking laptop components, clean repair workshop, professional environment',
      'African woman IT support engineer troubleshooting desktop computer, organized tech service center'
    ],
    'Télécommunications & Fibre': [
      'African telecom engineer working on fiber optic cable installation, outdoor scene with transmission tower in background',
      'African telecommunications technician testing fiber optic equipment, modern telecom facility',
      'African woman telecom engineer monitoring network operations center, large screens showing network topology',
      'African professional installing fiber optic connections in technical cabinet, organized cable management'
    ]
  },

  finance_gestion: {
    'Comptabilité Générale & Analytique': [
      'African accountant working on spreadsheets and financial reports on computer, modern office, organized desk with documents',
      'African woman chartered accountant analyzing financial statements, professional accounting firm office',
      'African accounting professional using financial software, clean desk with calculator and reports, modern workspace',
      'African finance team reviewing quarterly accounts on screen, bright office environment in West Africa'
    ],
    'Microfinance & Services Bancaires': [
      'African microfinance agent serving client at counter, small banking branch, professional interaction',
      'African woman bank teller processing transaction, modern microfinance institution, welcoming environment',
      'African banking professional advising client on financial products, small bank office in West Africa',
      'African microfinance officer reviewing loan documents with farmer client, community banking setting'
    ],
    'Contrôle de Gestion & Audit': [
      'African auditor reviewing financial documents with magnifying glass effect, modern corporate office, serious professional setting',
      'African woman management controller analyzing budget dashboards on screen, contemporary business office',
      'African audit team examining reports around conference table, professional firm environment',
      'African financial controller working on compliance reports, organized modern office with charts visible'
    ],
    'Ressources Humaines & Paie': [
      'African HR manager conducting interview with candidate, modern office, professional hiring setting',
      'African woman HR professional managing payroll on computer, organized HR department office',
      'African human resources specialist reviewing employee files, contemporary business office',
      'African HR team in training session, modern conference room, professional development setting'
    ],
    "Achats & Logistique d'Entreprise": [
      'African procurement officer negotiating with suppliers, modern corporate office, professional business meeting',
      'African woman logistics manager checking inventory on tablet in warehouse, organized storage facility',
      'African supply chain professional reviewing purchase orders on computer, modern office environment',
      'African procurement specialist inspecting goods at receiving dock, professional logistics operation'
    ],
    'Direction & Management': [
      'African CEO leading executive meeting in boardroom, modern corporate setting, confident leadership',
      'African woman business director presenting strategy on large screen, contemporary executive office',
      'African senior manager reviewing business performance dashboards, premium office with city view',
      'African executive team in strategic planning session, upscale conference room, professional atmosphere'
    ]
  },

  agriculture_elevage: {
    'Agronomie & Cultures Céréalières': [
      'African agronomist inspecting millet or sorghum crops in field, Sahelian landscape, professional fieldwork',
      'African woman agricultural engineer analyzing soil quality in cereal field, West African farmland',
      'African farmer examining rice paddy near harvest, golden crop field in Mali, rural agricultural scene',
      'African agronomy researcher testing seed varieties in experimental plot, professional agricultural setting'
    ],
    'Maraîchage & Arboriculture': [
      'African market gardener tending vegetable garden, irrigation channels visible, green lush garden in West Africa',
      'African woman harvesting tomatoes in community garden, organized rows of vegetables, warm sunlight',
      'African arborist pruning mango trees in orchard, fruit-bearing trees, rural African landscape',
      'African farmer watering lettuce beds with drip irrigation, modern horticultural techniques, green garden'
    ],
    'Élevage & Santé Animale': [
      'African livestock herder with cattle herd, Sahelian landscape with zebu cattle, pastoral scene in Mali',
      'African veterinarian examining cattle, rural veterinary clinic, professional animal health care',
      'African woman poultry farmer managing chicken coop, organized poultry farm, West African setting',
      'African livestock professional vaccinating goats, field veterinary work, rural community setting'
    ],
    'Agroalimentaire & Transformation Locale': [
      'African woman processing shea butter in artisanal workshop, traditional food transformation, West Africa',
      'African food processing factory worker operating milling equipment, cereal transformation unit',
      'African food entrepreneur packaging local products, small agribusiness facility, clean organized space',
      'African artisan making dried fruit or local products, small scale food processing, West African setting'
    ],
    'Irrigation, Eau & Machinisme Agricole': [
      'African irrigation technician installing solar water pump in field, modern agricultural technology, Sahelian setting',
      'African farmer operating tractor in field, mechanized agriculture, West African landscape',
      'African woman engineer managing irrigation system controls, agricultural water management station',
      'African agricultural machinery operator harvesting with combine, modern farming techniques in Africa'
    ],
    'Gestion Foncière & Coopératives': [
      'African cooperative leader meeting with farmers group, community hall, rural development setting',
      'African land surveyor mapping agricultural plots with GPS device, field work in West Africa',
      'African woman cooperative manager reviewing accounts with members, community organization meeting',
      'African agricultural cooperative members sorting produce for market, organized collective farming'
    ]
  },

  sante_social: {
    'Médecine Générale & Spécialisée': [
      'African doctor consulting patient in modern clinic, stethoscope visible, professional medical setting in West Africa',
      'African woman physician examining patient, well-equipped medical office, professional healthcare environment',
      'African surgeon in operating room, sterile environment, professional surgical setting',
      'African doctor reviewing medical records on computer, modern hospital office, clinical environment'
    ],
    'Soins Infirmiers & Sages-femmes': [
      'African nurse caring for patient in hospital ward, compassionate healthcare, modern medical facility',
      'African midwife assisting pregnant woman in maternity ward, professional maternal healthcare',
      'African woman nurse administering vaccine to child, community health center, warm caring interaction',
      'African nursing team at hospital station, organized medical ward, professional healthcare setting'
    ],
    'Santé Communautaire & Nutrition': [
      'African community health worker educating mothers about nutrition, outdoor health awareness session',
      'African woman nutritionist weighing infant at community health center, public health work',
      'African health agent conducting door-to-door vaccination campaign, village setting in West Africa',
      'African nutrition specialist preparing supplementary feeding program, community health center'
    ],
    'Pharmacie & Laboratoire': [
      'African pharmacist dispensing medication at pharmacy counter, organized medicine shelves, professional setting',
      'African laboratory technician analyzing samples with microscope, modern medical lab, scientific environment',
      'African woman pharmacist counseling patient on medication, well-stocked pharmacy in West Africa',
      'African lab scientist working with test tubes and centrifuge, hospital laboratory, clinical setting'
    ],
    "Action Sociale & Protection de l'Enfance": [
      'African social worker meeting with family in community center, supportive counseling environment',
      'African woman child protection officer working with children, youth center, caring professional setting',
      'African social services team planning intervention, government office, professional social work setting',
      'African community educator leading activity with children, educational recreation center, bright colorful space'
    ],
    'Hygiène Publique & Assainissement': [
      'African sanitation engineer inspecting water treatment facility, modern water infrastructure',
      'African woman hygiene promotion officer training community on handwashing, public health education',
      'African environmental health officer testing water quality in field, portable testing equipment',
      'African waste management team operating modern refuse collection, clean urban environment'
    ]
  },

  btp_mines_industrie: {
    'Génie Civil & Conduite de Chantier': [
      'African civil engineer supervising construction site, hard hat and safety vest, building under construction in Africa',
      'African woman construction manager reviewing blueprints on site, heavy equipment in background, professional setting',
      'African site foreman directing concrete pouring operation, active construction site, professional building work',
      'African civil engineering team at construction planning meeting, site office with drawings and plans visible'
    ],
    'Secteur Minier & Géologie': [
      'African geologist examining rock samples in field, mining exploration setting, Sahel landscape',
      'African mining engineer at open-pit mine site, heavy mining equipment visible, professional setting',
      'African woman geologist mapping terrain with GPS equipment, geological fieldwork in West Africa',
      'African mining safety officer inspecting underground operations, protective equipment, professional mine setting'
    ],
    'Énergie Solaire & Électricité': [
      'African solar energy technician installing photovoltaic panels on roof, bright sunny day, renewable energy work',
      'African electrician wiring electrical panel, organized tools, professional electrical installation work',
      'African woman solar engineer inspecting solar farm, rows of solar panels, clean energy facility in Africa',
      'African electrical engineer testing power distribution equipment, modern electrical substation'
    ],
    'Topographie & Dessin DAO/BTP': [
      'African surveyor using total station theodolite in field, construction survey work, professional equipment',
      'African CAD designer working on architectural plans on computer, AutoCAD or Revit on screen, modern office',
      'African woman topographer mapping terrain with drone controller, modern surveying technology',
      'African BTP draftsman creating construction drawings, technical design office, professional setting'
    ],
    'Maintenance Industrielle & Soudure': [
      'African industrial welder working on metal structure, welding sparks visible, safety equipment, workshop setting',
      'African maintenance technician repairing industrial machinery, factory floor, professional tools and equipment',
      'African woman industrial mechanic inspecting conveyor belt system, modern manufacturing facility',
      'African welder fabricating metal components, organized welding workshop, professional craftsmanship'
    ],
    'Hydraulique & Forages': [
      'African drilling engineer supervising borehole drilling operation, drilling rig in field, West African setting',
      'African hydraulics technician installing hand pump, community water point, rural development project',
      'African woman hydrogeologist collecting water samples, field research, professional environmental work',
      'African borehole drilling team at work, rotary drill rig, dust and activity, professional fieldwork'
    ]
  },

  humanitaire_developpement: {
    'Coordination de Projet & Suivi-Évaluation (MEAL)': [
      'African project coordinator leading planning meeting with NGO team, modern office with timeline charts on wall',
      'African woman MEAL officer collecting survey data on tablet, field visit to community, humanitarian work',
      'African development worker presenting project results to stakeholders, conference room, professional setting',
      'African monitoring specialist reviewing data dashboards on laptop, NGO field office, project management'
    ],
    'Logistique Humanitaire & Approvisionnement': [
      'African logistics officer managing warehouse of humanitarian supplies, organized NGO storage facility',
      'African woman supply chain manager tracking deliveries on computer, humanitarian logistics center',
      'African humanitarian worker loading relief supplies onto truck, emergency response operation',
      'African procurement officer inspecting food supplies delivery, UN or NGO warehouse, organized inventory'
    ],
    "Sécurité Alimentaire & Moyens d'Existence": [
      'African food security specialist assessing crop conditions in field, agricultural monitoring, Sahel region',
      'African woman livelihood officer distributing seeds to farmers, community development program',
      'African food aid worker managing distribution center, organized food supply point, humanitarian setting',
      'African food security analyst reviewing market prices on laptop, rural field office, development work'
    ],
    'Protection & Droits Humains': [
      'African human rights officer documenting testimony, confidential interview setting, professional humanitarian work',
      'African woman protection specialist conducting awareness session, community meeting in West Africa',
      'African child protection worker meeting with youth group, safe space setting, supportive environment',
      'African human rights advocate speaking at community forum, participatory development approach'
    ],
    'Eau, Assainissement & Hygiène (WASH)': [
      'African WASH engineer supervising water point construction, drilling equipment, community project',
      'African woman hygiene promoter teaching handwashing to school children, clean water facility',
      'African water and sanitation technician testing water quality, portable lab equipment, field work',
      'African WASH coordinator inspecting completed latrine project, community sanitation, development work'
    ],
    'Plaidoyer & Relations Bailleurs': [
      'African advocacy officer presenting to international donors, professional conference setting, diplomatic environment',
      'African woman donor relations manager preparing grant report on laptop, NGO office, professional workspace',
      'African development worker at donor coordination meeting, UN-style conference, multi-stakeholder setting',
      'African communications specialist creating advocacy materials on computer, modern NGO office'
    ]
  },

  education_formation: {
    'Enseignement Fondamental & Secondaire': [
      'African teacher instructing students in classroom, chalkboard visible, engaged students, West African school',
      'African woman primary school teacher helping student with exercise, bright classroom environment',
      'African secondary school professor conducting science experiment, school laboratory, educational setting',
      'African teacher leading interactive class discussion, modern classroom, enthusiastic students participation'
    ],
    'Formation Professionnelle & Technique': [
      'African vocational training instructor demonstrating equipment to students, technical workshop',
      'African woman teaching sewing skills in vocational center, organized training workshop with machines',
      'African technical trainer showing electrical wiring to apprentices, professional training facility',
      'African students learning computer skills in training center, modern equipped classroom, vocational education'
    ],
    'Enseignement Supérieur & Recherche': [
      'African university professor lecturing in amphitheater, university setting, academic environment',
      'African woman researcher working in university laboratory, scientific equipment, academic research setting',
      'African PhD student presenting research poster at academic conference, university campus, scholarly setting',
      'African university campus with students studying outdoors, modern educational buildings, West Africa'
    ],
    'Alphabétisation & Éducation Non-Formelle': [
      'African literacy teacher working with adult learners, community education center, non-formal setting',
      'African woman instructor teaching reading to women group, village literacy class, empowerment through education',
      'African non-formal education facilitator with learning materials, community school, adult education',
      'African adult learners practicing writing in community class, informal education setting, engaged participants'
    ],
    'Ingénierie Pédagogique & Coaching': [
      'African educational designer creating curriculum on computer, modern office, pedagogical design work',
      'African woman life coach facilitating personal development workshop, professional training room',
      'African instructional designer developing e-learning content, multimedia production setup',
      'African professional coach leading leadership training session, corporate training room, executive coaching'
    ]
  },

  communication_marketing: {
    'Community Management & Réseaux Sociaux': [
      'African community manager working on social media strategy on laptop, multiple tabs with social platforms open',
      'African woman content creator filming social media video, ring light setup, modern home studio',
      'African digital marketing specialist analyzing social media analytics on screen, coworking space',
      'African social media manager scheduling posts on computer, vibrant creative office environment'
    ],
    'Graphisme, Design & Vidéo': [
      'African graphic designer working on creative project in Photoshop or Illustrator, dual monitor setup, design studio',
      'African woman video editor working on timeline in editing software, professional post-production workspace',
      'African UI designer creating mockup on tablet with stylus, modern design agency, creative environment',
      'African motion graphics artist animating content, professional video editing suite, colorful screen'
    ],
    'Journalisme & Rédaction Web': [
      'African journalist interviewing subject with microphone, professional media work, outdoor reporting',
      'African woman web writer creating content on laptop, modern newsroom or blogging workspace',
      'African reporter covering news event with camera and notebook, professional journalism, West Africa',
      'African editor reviewing web article on screen, modern media office, editorial work'
    ],
    'Relations Publiques & Événementiel': [
      'African PR professional organizing press conference, media event setup, professional communications work',
      'African woman event planner coordinating venue decoration, large event hall preparation',
      'African public relations manager presenting to media, corporate event, professional setting',
      'African event coordinator managing registration at conference, organized event logistics'
    ],
    'Marketing & Vente / Commercial': [
      'African sales representative presenting product to client, modern showroom, professional commercial interaction',
      'African woman marketing manager reviewing campaign analytics on screen, contemporary marketing office',
      'African commercial agent closing deal with handshake, business meeting, professional sales environment',
      'African market researcher conducting consumer survey, field work with tablet, market analysis'
    ]
  },

  artisanat_metiers: {
    'Mécanique Auto & Deux-Roues': [
      'African auto mechanic repairing car engine, organized garage workshop, tools and parts visible',
      'African woman motorcycle mechanic fixing engine, two-wheeler repair shop, professional craftsmanship',
      'African automotive technician diagnosing vehicle with diagnostic tool, modern car workshop',
      'African mechanic welding car body panel, auto body repair shop, sparks and protective equipment'
    ],
    'Couture, Stylisme & Teinture': [
      'African tailor sewing traditional garment on sewing machine, colorful fabrics, textile workshop in West Africa',
      'African woman fashion designer creating modern African clothing, design studio with fabric samples',
      'African textile dyer applying indigo or wax print patterns, traditional teinture workshop, artisanal process',
      'African seamstress embroidering elaborate boubou, detailed handwork, traditional clothing workshop'
    ],
    'Menuiserie Bois & Aluminium': [
      'African carpenter crafting wooden furniture in workshop, sawdust visible, traditional woodworking tools',
      'African aluminum fabricator constructing window frames, organized metalwork workshop',
      'African woman woodworker polishing custom furniture piece, professional carpentry studio',
      'African joiner assembling door frames, woodworking shop with power tools, skilled craftsmanship'
    ],
    'Plomberie & Climatisation': [
      'African plumber installing pipes in building, professional plumbing tools, construction site work',
      'African HVAC technician servicing air conditioning unit, rooftop installation, professional maintenance',
      'African woman plumber repairing bathroom fixtures, residential plumbing work, organized tools',
      'African climatisation installer mounting split AC unit, professional installation work, modern building'
    ],
    'Bâtiment Second-Œuvre (Peinture, Carrelage)': [
      'African painter applying wall coating in modern building, paint rollers and equipment, professional finish',
      'African tile setter installing ceramic floor tiles, precise laying pattern, construction finishing work',
      'African woman decorator choosing paint colors for room, interior design work, building renovation',
      'African plasterer smoothing wall surface, plastering tools, professional building finishing work'
    ]
  },

  administration_publique: {
    'Concours Directs & Professionnels': [
      'African candidates sitting civil service examination in large hall, organized test center, professional setting',
      'African woman studying for government competitive exam, organized desk with books and notes',
      'African exam invigilator supervising test session, official examination center, formal setting',
      'African government recruitment board reviewing candidate files, official selection committee meeting'
    ],
    'Administration des Collectivités Locales': [
      'African local government administrator working at town hall desk, municipal office, public service setting',
      'African woman municipal council member in session, local government assembly, democratic governance',
      'African city clerk managing citizen documents, mairie office, organized administrative workspace',
      'African local government team meeting in council chamber, community governance, official setting'
    ],
    'Affaires Juridiques & Contentieux': [
      'African lawyer reviewing legal documents at desk, law books on shelf, professional legal office',
      'African woman judge in courtroom setting, formal judicial environment, West African legal system',
      'African legal adviser drafting contract on computer, modern law firm office, professional setting',
      'African attorney preparing court case with legal files, organized law office, West Africa'
    ],
    'Secrétariat de Direction & Assistanat': [
      'African executive assistant managing schedule on computer, organized reception desk, professional office',
      'African woman secretary typing on keyboard, modern office with filing system, administrative work',
      'African administrative assistant organizing correspondence, director office, efficient workspace',
      'African office manager coordinating meeting room, corporate secretariat, professional environment'
    ],
    'Archives & Documentation': [
      'African archivist organizing documents in records room, organized file storage, systematic cataloging',
      'African woman documentalist digitizing historical papers, modern archive facility with scanner',
      'African records manager retrieving files from organized shelving system, institutional archive',
      'African information specialist cataloging documents on computer, library or documentation center'
    ]
  },

  defense_securite: {
    'Sécurité Privée & Gardiennage': [
      'African security guard on duty at building entrance, professional uniform, vigilant posture, modern building',
      'African woman security officer monitoring CCTV screens, security control room, professional surveillance',
      'African private security team briefing before shift, organized security company, professional uniforms',
      'African gate guard checking visitor identification, secure compound entrance, professional security protocol'
    ],
    'Sécurité Incendie & Prévention HSE': [
      'African fire safety officer inspecting fire extinguisher equipment, building safety check, professional HSE work',
      'African woman HSE specialist conducting safety training, workers in protective equipment, industrial setting',
      'African firefighter in training exercise with hose, fire drill, professional emergency response practice',
      'African safety inspector reviewing emergency evacuation plan, workplace safety compliance, modern facility'
    ],
    'Opérations & Surveillance': [
      'African security operations officer coordinating patrol team, radio communication, professional security work',
      'African woman surveillance operator monitoring multiple security camera feeds, control room setting',
      'African security patrol team on foot rounds, commercial district at night, professional vigilance',
      'African operations coordinator tracking security incidents on digital map, modern operations center'
    ],
    'Concours Défense & Forces Armées': [
      'African military cadets in training formation, disciplined marching, national defense academy setting',
      'African woman officer candidate in physical fitness test, military training grounds, determination',
      'African defense force recruits in classroom training, military education, structured learning environment',
      'African military officer inspecting troops at parade, formal ceremony, national defense setting'
    ]
  },

  services_polyvalent: {
    'Chauffeur (VL, Poids Lourd, Transport de personnel)': [
      'African professional driver at wheel of clean vehicle, professional uniform, organized transport service',
      'African woman bus driver operating modern passenger bus, public transport, professional driving',
      'African truck driver inspecting heavy goods vehicle before trip, logistics transport, professional setting',
      'African chauffeur opening door for passenger, corporate transport service, professional courtesy'
    ],
    'Hôtellerie, Cuisine & Restauration': [
      'African chef preparing meal in professional restaurant kitchen, organized cooking station, culinary expertise',
      'African woman hotel receptionist welcoming guests, modern hotel lobby, hospitality industry',
      'African pastry chef decorating cake in bakery kitchen, artistic food presentation, professional skill',
      'African waiter serving dishes in upscale restaurant, elegant dining room, professional hospitality service'
    ],
    'Services Généraux & Entretien / Ménage': [
      'African facilities manager supervising building maintenance team, modern office building, professional management',
      'African woman cleaning supervisor organizing housekeeping supplies, hotel or office cleaning service',
      'African maintenance worker repairing air conditioning or plumbing, building upkeep, professional service',
      'African cleaning professional using modern equipment in commercial building, organized janitorial work'
    ],
    'Accueil & Réception': [
      'African receptionist greeting visitor at modern front desk, welcoming smile, professional reception area',
      'African woman front desk agent answering phone, organized reception counter, professional customer service',
      'African concierge assisting guest with information, hotel or corporate lobby, helpful interaction',
      'African reception team at corporate welcome desk, modern building entrance, professional hospitality'
    ],
    'Manutention & Magasinage': [
      'African warehouse worker operating forklift, organized storage facility, professional logistics work',
      'African woman storekeeper managing inventory on tablet, organized warehouse shelving, stock management',
      'African dock worker loading pallets onto delivery truck, distribution center, efficient logistics',
      'African warehouse team sorting and stacking goods, large distribution facility, systematic organization'
    ]
  }
};

// ─── Fonctions utilitaires ──────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getExistingImageCount(catId: string, subCatId: string): number {
  const dir = path.join(CATEGORIES_DIR, catId, subCatId);
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => /\.(webp|png|jpg|jpeg)$/i.test(f)).length;
}

function getNextImageIndex(catId: string, subCatId: string): number {
  const dir = path.join(CATEGORIES_DIR, catId, subCatId);
  if (!fs.existsSync(dir)) return 1;
  const files = fs.readdirSync(dir).filter(f => /\.(webp|png|jpg|jpeg)$/i.test(f));
  if (files.length === 0) return 1;
  const indices = files.map(f => parseInt(f.replace(/\D/g, '')) || 0);
  return Math.max(...indices) + 1;
}

async function generateAndSaveImage(
  prompt: string,
  outputPath: string,
  model: string
): Promise<boolean> {
  try {
    const body: any = {
      model,
      prompt,
      aspect_ratio: '16:9',
      n: 1
    };

    // FLUX supporte output_format
    if (model.includes('flux')) {
      body.output_format = 'jpeg';
    }

    const res = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://jobavenir.ml',
        'X-Title': 'JobAvenir Image Generator'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`  ❌ API error ${res.status}: ${err.slice(0, 200)}`);
      return false;
    }

    const data = await res.json() as any;
    
    if (!data.data?.[0]) {
      console.error('  ❌ No image data in response');
      return false;
    }

    const imgData = data.data[0];
    let imageBuffer: Buffer;

    if (imgData.b64_json) {
      imageBuffer = Buffer.from(imgData.b64_json, 'base64');
    } else if (imgData.url) {
      const imgRes = await fetch(imgData.url);
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
    } else {
      console.error('  ❌ No image URL or base64 in response');
      return false;
    }

    // Convertir en WebP optimisé 1200x630 (format OG)
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await sharp(imageBuffer)
      .resize(1200, 630, { fit: 'cover' })
      .webp({ quality: 82 })
      .toFile(outputPath);

    const stats = fs.statSync(outputPath);
    console.log(`  ✅ Saved: ${path.relative(process.cwd(), outputPath)} (${(stats.size / 1024).toFixed(0)}KB)`);
    return true;
  } catch (err: any) {
    console.error(`  ❌ Error: ${err.message}`);
    return false;
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY manquant dans .env');
    process.exit(1);
  }

  console.log('🖼️  Générateur d\'images de catégories JobAvenir');
  console.log(`   Modèle : ${MODEL}`);
  console.log(`   Cible  : ${TARGET_PER_SUBCATEGORY} images par sous-catégorie`);
  console.log(`   Mode   : ${DRY_RUN ? '🔍 DRY RUN (aucune génération)' : '🚀 PRODUCTION'}`);
  if (CATEGORY_FILTER) console.log(`   Filtre : ${CATEGORY_FILTER}`);
  console.log('─'.repeat(60));

  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalCost = 0;
  const costPerImage = MODEL.includes('flux') ? 0.014 : 0.005; // estimation

  const categories = CATEGORY_FILTER
    ? Object.entries(CATEGORIES).filter(([id]) => id === CATEGORY_FILTER)
    : Object.entries(CATEGORIES);

  for (const [catId, catConfig] of categories) {
    console.log(`\n📂 ${catConfig.label} (${catId})`);
    
    const catPrompts = SUBCATEGORY_PROMPTS[catId];
    if (!catPrompts) {
      console.log(`  ⚠️  Pas de prompts définis pour cette catégorie, skip`);
      continue;
    }

    for (const subCatLabel of catConfig.subCategories) {
      const subCatId = normalizeSubCategoryId(subCatLabel);
      const existing = getExistingImageCount(catId, subCatId);
      const needed = Math.max(0, TARGET_PER_SUBCATEGORY - existing);

      if (needed === 0) {
        console.log(`  ✔ ${subCatLabel} : ${existing}/${TARGET_PER_SUBCATEGORY} images (complet)`);
        totalSkipped++;
        continue;
      }

      console.log(`  📸 ${subCatLabel} : ${existing}/${TARGET_PER_SUBCATEGORY} → ${needed} à générer`);

      const prompts = catPrompts[subCatLabel];
      if (!prompts) {
        console.log(`    ⚠️  Pas de prompts pour "${subCatLabel}", skip`);
        continue;
      }

      if (DRY_RUN) {
        totalCost += needed * costPerImage;
        totalGenerated += needed;
        continue;
      }

      let nextIdx = getNextImageIndex(catId, subCatId);
      
      for (let i = 0; i < needed; i++) {
        const promptIdx = (existing + i) % prompts.length;
        const prompt = prompts[promptIdx];
        const outputPath = path.join(CATEGORIES_DIR, catId, subCatId, `${String(nextIdx).padStart(2, '0')}.webp`);

        console.log(`    [${i + 1}/${needed}] Génération...`);
        
        const success = await generateAndSaveImage(prompt, outputPath, MODEL);
        
        if (success) {
          totalGenerated++;
          totalCost += costPerImage;
          nextIdx++;
        } else {
          totalErrors++;
        }

        // Pause entre les images
        if (i < needed - 1) {
          await sleep(DELAY_BETWEEN_IMAGES);
        }
      }

      // Pause entre les sous-catégories
      await sleep(DELAY_BETWEEN_SUBCATS);
    }
  }

  // ─── Résumé ───────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RÉSUMÉ');
  console.log('═'.repeat(60));
  console.log(`  Images générées  : ${totalGenerated}`);
  console.log(`  Sous-cat complètes : ${totalSkipped}`);
  console.log(`  Erreurs          : ${totalErrors}`);
  console.log(`  Coût estimé      : $${totalCost.toFixed(3)}`);
  if (DRY_RUN) {
    console.log('\n  💡 Exécutez sans --dry-run pour lancer la génération');
  }
}

main().catch(console.error);
