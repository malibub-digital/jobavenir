import { queryDb, initDatabaseSchema, getUnifiedJobs } from '../src/lib/db';
import { generateSocialTexts, calculateDefaultSocialPublishAt } from '../src/lib/social-generator';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { GET, POST } from '../src/pages/api/admin/opportunity';

async function runE2EWorkflowTest() {
  console.log('=== Démarrage du Test E2E de Bout en Bout ===\n');

  // 1. Initialiser le schéma de base de données
  console.log('1. Initialisation du schéma DB...');
  await initDatabaseSchema();
  console.log('✅ Schéma DB initialisé avec succès.\n');

  const rawSecret = process.env.CMS_ADMIN_SECRET || 'admin123';
  const adminToken = await hashSha256(rawSecret);

  const testJobSlug = `e2e-job-${Date.now()}`;
  const testIdeaSlug = `e2e-idea-${Date.now()}`;

  try {
    // --- PARTIE A : TEST SUR UNE OFFRE D'EMPLOI (jobs) ---
    console.log('--- PARTIE A : FLUX E2E POUR UNE OFFRE (jobs) ---');

    // A.1 Générer automatiquement les champs sociaux
    const jobSocial = generateSocialTexts({
      title: 'Ingénieur DevOps Cloud Mali',
      company: 'Mali Cloud Services',
      location: 'Bamako (ACI 2000)',
      contractType: 'CDI',
      slug: testJobSlug,
      deadline: '2026-12-31',
      isIdea: false
    });
    const defaultJobPublishAt = calculateDefaultSocialPublishAt();

    // Insertion d'une offre active
    await queryDb(`
      INSERT INTO jobs (
        slug, title, company, location, contract_type, excerpt, content_hash, is_active,
        social_publish_at, social_status, social_whatsapp, social_telegram, social_tiktok
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      testJobSlug,
      'Ingénieur DevOps Cloud Mali',
      'Mali Cloud Services',
      'Bamako (ACI 2000)',
      'CDI',
      'Offre test E2E pour ingénieur cloud',
      testJobSlug,
      true,
      defaultJobPublishAt,
      'SCHEDULED',
      jobSocial.whatsapp,
      jobSocial.telegram,
      jobSocial.tiktok
    ]);
    console.log(`✅ Offre de test créée (slug: ${testJobSlug}) avec social_publish_at et 3 textes.`);

    // A.2 Vérification de la visibilité avec getUnifiedJobs
    let jobsActiveOnly = await getUnifiedJobs();
    let foundActive = jobsActiveOnly.some(j => j.slug === testJobSlug);
    if (!foundActive) {
      throw new Error(`L'offre active ${testJobSlug} devrait être présente dans getUnifiedJobs()`);
    }
    console.log('✅ getUnifiedJobs() retourne bien l\'offre active.');

    // A.3 Test API GET sans token (Doit retourner 401)
    const unauthGetReq = new Request(`http://localhost:4321/api/admin/opportunity?type=job&slug=${testJobSlug}`);
    const unauthGetRes = await GET({ request: unauthGetReq } as any);
    if (unauthGetRes.status !== 401) {
      throw new Error(`Attendu 401 pour requête non authentifiée, reçu ${unauthGetRes.status}`);
    }
    console.log('✅ 401 bien reçu pour GET sans token.');

    // A.4 Test API GET avec token Bearer (Doit retourner 200 et les données complètes)
    const authGetReq = new Request(`http://localhost:4321/api/admin/opportunity?type=job&slug=${testJobSlug}`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const authGetRes = await GET({ request: authGetReq } as any);
    if (authGetRes.status !== 200) {
      throw new Error(`Attendu 200 pour GET admin authentifié, reçu ${authGetRes.status}`);
    }
    const jobData = await authGetRes.json();
    if (!jobData.success || jobData.data.isActive !== true || jobData.data.socialStatus !== 'SCHEDULED') {
      throw new Error(`Données reçues invalides pour GET: ${JSON.stringify(jobData)}`);
    }
    console.log('✅ GET admin retourne les données avec succès.');

    // A.5 Test API POST : 1er test : toggle-publish pour dépublier (isActive: false)
    console.log('Test action toggle-publish (dépublication)...');
    const toggleOffReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        type: 'job',
        slug: testJobSlug,
        action: 'toggle-publish',
        isActive: false
      })
    });
    const toggleOffRes = await POST({ request: toggleOffReq } as any);
    if (toggleOffRes.status !== 200) {
      throw new Error(`toggle-publish désactivation échoué avec statut ${toggleOffRes.status}`);
    }
    const toggleOffData = await toggleOffRes.json();
    if (!toggleOffData.success || toggleOffData.isActive !== false || toggleOffData.socialStatus !== 'PAUSED') {
      throw new Error(`Réponse inattendue lors de la dépublication: ${JSON.stringify(toggleOffData)}`);
    }

    // Vérifier en base directement
    const dbJobAfterOff = await queryDb('SELECT is_active, social_status FROM jobs WHERE slug = $1', [testJobSlug]);
    if (Boolean(dbJobAfterOff.rows[0].is_active) !== false || dbJobAfterOff.rows[0].social_status !== 'PAUSED') {
      throw new Error(`Valeurs DB non conformes après dépublication: ${JSON.stringify(dbJobAfterOff.rows[0])}`);
    }
    console.log('✅ Base de données vérifiée : is_active = false et social_status = PAUSED.');

    // Vérifier étanchéité dans getUnifiedJobs()
    jobsActiveOnly = await getUnifiedJobs();
    if (jobsActiveOnly.some(j => j.slug === testJobSlug)) {
      throw new Error(`L'offre dépubliée ${testJobSlug} NE DOIT PAS apparaître dans getUnifiedJobs() standard`);
    }
    const jobsWithInactive = await getUnifiedJobs({ includeInactive: true });
    if (!jobsWithInactive.some(j => j.slug === testJobSlug && j.data.isActive === false)) {
      throw new Error(`L'offre dépubliée ${testJobSlug} DOIT apparaître dans getUnifiedJobs({ includeInactive: true })`);
    }
    console.log('✅ Étanchéité validée : masquée pour les visiteurs, visible avec includeInactive.');

    // A.6 Test API POST : 2e test : mise à jour des paramètres sociaux
    console.log('Test mise à jour des paramètres sociaux...');
    const customPublishDate = '2026-11-01T15:00:00.000Z';
    const customWhatsapp = '📢 *Ingénieur DevOps Cloud* - Candidatures urgentes !';
    const customTelegram = '🚀 #EmploiMali DevOps Cloud disponible';
    const customTiktok = '🎬 Venez postuler au poste DevOps Cloud';

    const updateSocialReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `ml_admin_token=${adminToken}`
      },
      body: JSON.stringify({
        type: 'job',
        slug: testJobSlug,
        isActive: false,
        socialPublishAt: customPublishDate,
        socialStatus: 'SCHEDULED',
        socialWhatsapp: customWhatsapp,
        socialTelegram: customTelegram,
        socialTiktok: customTiktok
      })
    });
    const updateSocialRes = await POST({ request: updateSocialReq } as any);
    if (updateSocialRes.status !== 200) {
      throw new Error(`Mise à jour sociale échouée avec statut ${updateSocialRes.status}`);
    }

    const dbJobAfterUpdate = await queryDb('SELECT * FROM jobs WHERE slug = $1', [testJobSlug]);
    const jobRow = dbJobAfterUpdate.rows[0];
    if (
      jobRow.social_status !== 'SCHEDULED' ||
      jobRow.social_whatsapp !== customWhatsapp ||
      jobRow.social_telegram !== customTelegram ||
      jobRow.social_tiktok !== customTiktok
    ) {
      throw new Error(`Valeurs DB non conformes après mise à jour: ${JSON.stringify(jobRow)}`);
    }
    console.log('✅ Paramètres sociaux mis à jour et vérifiés en base.');

    // A.7 Test API POST : 3e test : toggle-publish pour republier (isActive: true)
    console.log('Test action toggle-publish (republication)...');
    const toggleOnReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        type: 'job',
        slug: testJobSlug,
        action: 'toggle-publish',
        isActive: true
      })
    });
    const toggleOnRes = await POST({ request: toggleOnReq } as any);
    if (toggleOnRes.status !== 200) {
      throw new Error(`toggle-publish republication échoué avec statut ${toggleOnRes.status}`);
    }
    const toggleOnData = await toggleOnRes.json();
    if (!toggleOnData.success || toggleOnData.isActive !== true || toggleOnData.socialStatus !== 'SCHEDULED') {
      throw new Error(`Réponse inattendue lors de la republication: ${JSON.stringify(toggleOnData)}`);
    }

    const dbJobAfterOn = await queryDb('SELECT is_active, social_status FROM jobs WHERE slug = $1', [testJobSlug]);
    if (Boolean(dbJobAfterOn.rows[0].is_active) !== true || dbJobAfterOn.rows[0].social_status !== 'SCHEDULED') {
      throw new Error(`Valeurs DB non conformes après republication: ${JSON.stringify(dbJobAfterOn.rows[0])}`);
    }
    console.log('✅ Base de données vérifiée : is_active = true et social_status = SCHEDULED.');

    // A.8 Test API POST : 4e test : requête sans token admin valide -> renvoie 401
    console.log('Test sécurité : requête non autorisée...');
    const invalidReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'Bearer bad_token_123456'
      },
      body: JSON.stringify({
        type: 'job',
        slug: testJobSlug,
        action: 'toggle-publish',
        isActive: false
      })
    });
    const invalidRes = await POST({ request: invalidReq } as any);
    if (invalidRes.status !== 401) {
      throw new Error(`Attendu 401 pour POST non autorisé, reçu ${invalidRes.status}`);
    }
    console.log('✅ 401 bien retourné pour requête avec token invalide.');

    console.log('🎉 Tous les tests sur l\'offre (job) sont validés !\n');

    // --- PARTIE B : TEST SUR UNE IDÉE BUSINESS (ideas) ---
    console.log('--- PARTIE B : FLUX E2E POUR UNE IDÉE BUSINESS (ideas) ---');

    const ideaSocial = generateSocialTexts({
      title: 'Atelier de Réparation de Motos Électriques',
      slug: testIdeaSlug,
      isIdea: true
    });
    const defaultIdeaPublishAt = calculateDefaultSocialPublishAt();

    await queryDb(`
      INSERT INTO ideas (
        slug, title, sector, demarrage_level, concept, besoin_identifie, public_cible, premiere_action, is_active,
        social_publish_at, social_status, social_whatsapp, social_telegram, social_tiktok
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      testIdeaSlug,
      'Atelier de Réparation de Motos Électriques',
      'Énergie & Mobilité',
      'Faible (< 50 000 FCFA)',
      'Service de maintenance spécialisé dans les 2 roues électriques à Bamako.',
      'Croissance rapide des motos électriques sans réparateurs formés.',
      'Livreurs, motocyclistes urbains et flottes d\'entreprises',
      'Suivre un tutoriel sur les batteries et proposer un premier diagnostic gratuit.',
      true,
      defaultIdeaPublishAt,
      'SCHEDULED',
      ideaSocial.whatsapp,
      ideaSocial.telegram,
      ideaSocial.tiktok
    ]);
    console.log(`✅ Idée business de test créée (slug: ${testIdeaSlug}).`);

    // Vérification getUnifiedJobs pour l'idée
    const ideasActive = await getUnifiedJobs();
    if (!ideasActive.some(i => i.slug === testIdeaSlug && i.isIdea === true)) {
      throw new Error(`L'idée active ${testIdeaSlug} devrait être présente dans getUnifiedJobs()`);
    }
    console.log('✅ getUnifiedJobs() inclut bien l\'idée business active.');

    // GET idée authentifié
    const getIdeaReq = new Request(`http://localhost:4321/api/admin/opportunity?type=idea&slug=${testIdeaSlug}`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const getIdeaRes = await GET({ request: getIdeaReq } as any);
    if (getIdeaRes.status !== 200) {
      throw new Error(`GET idée échoué avec statut ${getIdeaRes.status}`);
    }
    console.log('✅ GET admin sur l\'idée business retourne 200 OK.');

    // Dépublier l'idée
    const toggleOffIdeaReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        type: 'idea',
        slug: testIdeaSlug,
        action: 'toggle-publish',
        isActive: false
      })
    });
    const toggleOffIdeaRes = await POST({ request: toggleOffIdeaReq } as any);
    if (toggleOffIdeaRes.status !== 200) {
      throw new Error(`Dépublication de l'idée échouée: ${toggleOffIdeaRes.status}`);
    }
    const dbIdeaCheck = await queryDb('SELECT is_active, social_status FROM ideas WHERE slug = $1', [testIdeaSlug]);
    if (Boolean(dbIdeaCheck.rows[0].is_active) !== false || dbIdeaCheck.rows[0].social_status !== 'PAUSED') {
      throw new Error(`DB idée non mise à jour: ${JSON.stringify(dbIdeaCheck.rows[0])}`);
    }
    console.log('✅ Idée business dépubliée avec succès (is_active = false, social_status = PAUSED).');

    // Mettre à jour paramètres sociaux de l'idée
    const customIdeaDate = '2026-11-05T09:00:00.000Z';
    const updateIdeaReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        type: 'idea',
        slug: testIdeaSlug,
        isActive: false,
        socialPublishAt: customIdeaDate,
        socialStatus: 'SCHEDULED',
        socialWhatsapp: '💡 Nouvelle idée business à fort potentiel !',
        socialTelegram: '💡 Idée du jour Bamako',
        socialTiktok: '💡 Comment lancer votre atelier de moto'
      })
    });
    const updateIdeaRes = await POST({ request: updateIdeaReq } as any);
    if (updateIdeaRes.status !== 200) {
      throw new Error(`Mise à jour sociale de l'idée échouée: ${updateIdeaRes.status}`);
    }
    const dbIdeaAfterUpdate = await queryDb('SELECT * FROM ideas WHERE slug = $1', [testIdeaSlug]);
    if (
      dbIdeaAfterUpdate.rows[0].social_whatsapp !== '💡 Nouvelle idée business à fort potentiel !' ||
      dbIdeaAfterUpdate.rows[0].social_status !== 'SCHEDULED'
    ) {
      throw new Error(`Données de l'idée non mises à jour: ${JSON.stringify(dbIdeaAfterUpdate.rows[0])}`);
    }
    console.log('✅ Paramètres sociaux de l\'idée mis à jour en base.');

    // Republier l'idée
    const toggleOnIdeaReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        type: 'idea',
        slug: testIdeaSlug,
        action: 'toggle-publish',
        isActive: true
      })
    });
    const toggleOnIdeaRes = await POST({ request: toggleOnIdeaReq } as any);
    if (toggleOnIdeaRes.status !== 200) {
      throw new Error(`Republication de l'idée échouée: ${toggleOnIdeaRes.status}`);
    }
    const dbIdeaFinal = await queryDb('SELECT is_active, social_status FROM ideas WHERE slug = $1', [testIdeaSlug]);
    if (Boolean(dbIdeaFinal.rows[0].is_active) !== true || dbIdeaFinal.rows[0].social_status !== 'SCHEDULED') {
      throw new Error(`Statuts finaux de l'idée non valides: ${JSON.stringify(dbIdeaFinal.rows[0])}`);
    }
    console.log('✅ Idée business republiée avec succès (is_active = true, social_status = SCHEDULED).');

    console.log('🎉 Tous les tests sur l\'idée business sont validés !\n');

  } finally {
    // Nettoyage complet des données de test
    console.log('🧹 Nettoyage des données de test...');
    await queryDb('DELETE FROM jobs WHERE slug = $1', [testJobSlug]);
    await queryDb('DELETE FROM ideas WHERE slug = $1', [testIdeaSlug]);
    console.log('✅ Données de test supprimées avec succès.');
  }

  console.log('\n======================================================');
  console.log('🚀 VALIDATION RÉUSSIE : All end-to-end checks verified!');
  console.log('======================================================');
}

runE2EWorkflowTest().catch((err) => {
  console.error('\n❌ Erreur lors du test E2E :', err);
  process.exit(1);
});
