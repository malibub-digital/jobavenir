import { generateJobOgImage } from '../src/lib/og-generator';

async function main() {
  console.log('🧪 Lancement du test de génération des vignettes OG...');

  const tests = [
    {
      title: 'Recrutement d\'un Développeur Full-Stack TypeScript & Cloud',
      company: 'MaliHub Digital Agency',
      category: 'Informatique & Numérique',
      subCategory: 'Développement Web & Mobile',
      location: 'Bamako, ACI 2000',
      opportunityType: 'JOB',
      slug: 'recrutement-developpeur-fullstack-mali'
    },
    {
      title: 'Programme d\'Appui à la Modernisation des Exploitations Rizicoles',
      company: 'Ministère de l\'Agriculture & Coopération',
      category: 'Agriculture & Élevage',
      subCategory: 'Agronomie & Cultures Céréalières',
      location: 'Ségou (Office du Niger)',
      opportunityType: 'PROJECT_CALL',
      slug: 'appui-modernisation-riz-segou'
    },
    {
      title: 'Coordinateur Terrain en Santé Communautaire & Nutrition d\'Urgence',
      company: 'Action Contre la Faim (ACF)',
      category: 'Humanitaire & Développement',
      subCategory: 'Coordination de Projet & Suivi-Évaluation (MEAL)',
      location: 'Mopti, Mali',
      opportunityType: 'JOB',
      slug: 'coordinateur-terrain-sante-mopti'
    }
  ];

  for (const t of tests) {
    const start = Date.now();
    const result = await generateJobOgImage(t);
    const duration = Date.now() - start;
    console.log(`✅ [${duration}ms] Générée avec succès : ${result}`);
  }

  console.log('🎉 Tous les tests ont réussi !');
}

main().catch(console.error);
