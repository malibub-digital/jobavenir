import dotenv from 'dotenv';
dotenv.config();

import { pool, isSqlite } from '../src/lib/db';
import { findCategory } from '../src/config/categories';
import { generateJobOgImage } from '../src/lib/og-generator';

async function backfill() {
  console.log('=== DÉMARRAGE DU BACKFILL ET HARMONISATION DES ANNONCES ===');
  console.log(`Mode de base : ${isSqlite ? 'SQLite' : 'PostgreSQL'}`);

  const res = await pool.query('SELECT id, slug, title, company, category, domain, location, opportunity_type, metadata FROM jobs ORDER BY id ASC');
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

    // 1. Harmonisation de la catégorie
    const matchedCategory = findCategory(job.category);
    const targetCategoryLabel = matchedCategory ? matchedCategory.label : job.category;
    const categoryChanged = job.category !== targetCategoryLabel;

    // 2. Vérification / Déduction de la sous-catégorie si absente
    if (!metadata.subCategory && matchedCategory) {
      // Déduction basique selon mots-clés du titre si possible
      const titleLower = (job.title || '').toLowerCase();
      const matchedSub = matchedCategory.subCategories.find(sub => 
        titleLower.includes(sub.toLowerCase().split(' ')[0])
      );
      metadata.subCategory = matchedSub || matchedCategory.subCategories[0];
    }

    // 3. Génération du teaser si absent
    if (!metadata.teaser) {
      metadata.teaser = `Découvrez l'opportunité "${job.title}" avec ${job.company || 'JobAvenir Mali'}.`;
    }

    // 4. Génération de la miniature OG
    let ogImageUrl = metadata.ogImageUrl;
    if (!ogImageUrl) {
      try {
        ogImageUrl = await generateJobOgImage({
          title: job.title,
          company: job.company,
          category: targetCategoryLabel,
          subCategory: metadata.subCategory,
          location: job.location,
          opportunityType: job.opportunity_type,
          slug: job.slug
        });
        ogGeneratedCount++;
      } catch (err) {
        console.warn(`[Backfill] Erreur génération miniature pour ${job.slug}:`, err);
        ogImageUrl = `/images/og/${job.slug}.webp`;
      }
    }
    metadata.ogImageUrl = ogImageUrl;

    // 5. Mise à jour en base de données
    await pool.query(
      `UPDATE jobs SET 
         category = $1,
         metadata = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [targetCategoryLabel, JSON.stringify(metadata), job.id]
    );

    updatedCount++;
    if (categoryChanged) {
      console.log(`   🔄 [#${job.id}] Catégorie harmonisée: "${job.category}" -> "${targetCategoryLabel}"`);
    }
  }

  console.log('==================================================');
  console.log(`✅ Backfill terminé avec succès :`);
  console.log(`- Offres traitées / mises à jour : ${updatedCount}`);
  console.log(`- Miniatures OG créées           : ${ogGeneratedCount}`);
  console.log('==================================================');
}

backfill()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erreur critique lors du backfill:', err);
    process.exit(1);
  });
