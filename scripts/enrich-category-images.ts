import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Mappage de photos professionnelles haute résolution sous licence Unsplash
// cadrées et contextualisées pour les métiers en Afrique de l'Ouest / environnement de travail moderne
const CATEGORY_SOURCES: Record<string, string[]> = {
  informatique: [
    // Informatique / Développeur / High-tech
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=1600&q=85', // African tech woman in modern office
    'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1600&q=85'  // Tech collaborative team
  ],
  finance_gestion: [
    // Comptabilité / Finance / Banque / Management
    'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1600&q=85', // African businesswoman smiling in corporate office
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1600&q=85'  // Business meeting / financial discussion
  ],
  agriculture_elevage: [
    // Agro-business / Cultures / Agriculture
    'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=1600&q=85', // African farmer in agricultural field
    'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1600&q=85'  // Modern agriculture / green harvest
  ],
  sante_social: [
    // Hôpital / Médecine / Santé
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&q=85', // Healthcare medical team
    'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=1600&q=85'  // Medical consultation / clinic
  ],
  btp_mines_industrie: [
    // BTP / Construction / Génie civil / Énergie
    'https://images.unsplash.com/photo-1504307651554-6691fc9d75ab?w=1600&q=85', // Construction engineer on site
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1600&q=85'  // Industrial machinery / engineering
  ],
  humanitaire_developpement: [
    // ONG / Aide communautaire / Développement
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&q=85', // Humanitarian community development
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1600&q=85'  // Environmental NGO / sustainable growth
  ],
  education_formation: [
    // Éducation / Formation / Université
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=1600&q=85', // Educational training / lecture room
    'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=1600&q=85'  // Learning / student workshop
  ],
  communication_marketing: [
    // Médias / Design / Stratégie
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&q=85', // Creative team workshop / marketing strategy
    'https://images.unsplash.com/photo-1542744094-24638eff58bb?w=1600&q=85'  // Digital presentation / analytics
  ],
  artisanat_metiers: [
    // Artisanat / Atelier / Métiers techniques
    'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=1600&q=85', // Technical manufacturing / craftsmanship
    'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=1600&q=85'  // Workshop / metal & wood craftsmanship
  ],
  administration_publique: [
    // Institutions / Bureau administratif / Droit
    'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1600&q=85', // Modern office / law & administration
    'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=85'  // Corporate architectural institution
  ],
  defense_securite: [
    // Sécurité / Prévention / Protection
    'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=1600&q=85', // Security / surveillance monitoring
    'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1600&q=85'  // Formal handshake / defense & trust
  ],
  services_polyvalent: [
    // Logistique / Transport / Accueil / Services
    'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1600&q=85', // Modern logistics / supply chain warehouse
    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=85'  // Hospitality / hotel reception service
  ]
};

async function downloadAndProcess(url: string, outputPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await sharp(buffer)
    .resize(1200, 630, { fit: 'cover', position: 'center' })
    .webp({ quality: 82 })
    .toFile(outputPath);
}

async function main() {
  console.log('🚀 Début de l’enrichissement de la banque d’images des catégories...');

  for (const [catId, urls] of Object.entries(CATEGORY_SOURCES)) {
    const dir = path.resolve(process.cwd(), 'public/images/categories', catId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // On commence l'indexation après les images déjà présentes
    const existing = fs.readdirSync(dir).filter(f => /\.(webp|jpg|png)$/i.test(f));
    let nextIndex = existing.length + 1;

    for (const url of urls) {
      const filename = `${String(nextIndex).padStart(2, '0')}.webp`;
      const targetPath = path.join(dir, filename);

      // Si le fichier existe déjà, on passe
      if (fs.existsSync(targetPath)) {
        console.log(`⏩ [${catId}] ${filename} existe déjà, ignoré.`);
        nextIndex++;
        continue;
      }

      try {
        process.stdout.write(`⏳ [${catId}] Téléchargement et optimisation de ${filename}... `);
        await downloadAndProcess(url, targetPath);
        console.log('✅ OK');
        nextIndex++;
      } catch (err: any) {
        console.log(`❌ Erreur: ${err.message}`);
      }
    }
  }

  console.log('🎉 Banque d’images complétée avec succès !');
}

main().catch(console.error);
