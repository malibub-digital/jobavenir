// scripts/test-scrape-defaults.ts
import { queryDb, initDatabaseSchema } from '../src/lib/db';
import { generateSocialTexts, calculateDefaultSocialPublishAt } from '../src/lib/social-generator';

async function testInsert() {
  await initDatabaseSchema();
  const testSlug = `test-opportunity-${Date.now()}`;
  const social = generateSocialTexts({
    title: 'Test Automatic Social Post',
    company: 'Test Corp',
    location: 'Bamako',
    slug: testSlug
  });
  const publishAt = calculateDefaultSocialPublishAt();

  await queryDb(`
    INSERT INTO jobs (
      slug, title, company, excerpt, content_hash,
      social_publish_at, social_status, social_whatsapp, social_telegram, social_tiktok
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    testSlug, 'Test Automatic Social Post', 'Test Corp', 'Excerpt test', testSlug,
    publishAt, 'SCHEDULED', social.whatsapp, social.telegram, social.tiktok
  ]);

  const res = await queryDb('SELECT * FROM jobs WHERE slug = $1', [testSlug]);
  if (res.rows.length === 0 || res.rows[0].social_status !== 'SCHEDULED') {
    throw new Error('Failed to retrieve inserted social fields');
  }

  // Nettoyage job
  await queryDb('DELETE FROM jobs WHERE slug = $1', [testSlug]);

  // Test insertion idée via insertIdea
  const testIdeaSlug = `test-idea-${Date.now()}`;
  const { insertIdea, getIdeaBySlug } = await import('../src/lib/db');
  await insertIdea({
    slug: testIdeaSlug,
    title: 'Idée Test Auto Social',
    sector: 'Agriculture',
    zoneCible: 'Sikasso',
    demarrageLevel: 'Très faible',
    besoinIdentifie: 'Besoin de test',
    concept: 'Concept de test',
    publicCible: 'Jeunes',
    competencesCles: ['Test'],
    premiereAction: 'Action immédiate',
    contentHash: `hash-${testIdeaSlug}`
  });

  const ideaRes = await getIdeaBySlug(testIdeaSlug);
  if (!ideaRes || ideaRes.socialStatus !== 'SCHEDULED' || !ideaRes.socialWhatsapp || !ideaRes.socialPublishAt) {
    throw new Error('Failed to retrieve auto-populated social fields for idea');
  }

  await queryDb('DELETE FROM ideas WHERE slug = $1', [testIdeaSlug]);
  console.log('✅ Task 2 test passed!');
}

testInsert().catch(err => {
  console.error('❌ Task 2 test error:', err);
  process.exit(1);
});
