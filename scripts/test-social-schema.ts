// scripts/test-social-schema.ts
import { generateSocialTexts, calculateDefaultSocialPublishAt } from '../src/lib/social-generator';
import { initDatabaseSchema, queryDb } from '../src/lib/db';

async function run() {
  console.log('Testing social text generator...');
  const texts = generateSocialTexts({
    title: 'Développeur Fullstack',
    company: 'MaliTech Solutions',
    location: 'Bamako, Mali',
    contractType: 'CDI',
    slug: 'developpeur-fullstack-malitech',
    deadline: '2026-11-30',
    isIdea: false
  });

  if (!texts.whatsapp.includes('Développeur Fullstack') || !texts.whatsapp.includes('job.malihub.digital')) {
    throw new Error('WhatsApp text generation failed');
  }
  if (!texts.telegram.includes('#EmploiMali')) {
    throw new Error('Telegram text generation failed');
  }
  if (!texts.tiktok.includes('Hook :')) {
    throw new Error('TikTok text generation failed');
  }

  const defaultDate = calculateDefaultSocialPublishAt();
  if (!defaultDate || isNaN(new Date(defaultDate).getTime())) {
    throw new Error('Default social publish at calculation failed');
  }

  console.log('Testing schema migration on local DB...');
  await initDatabaseSchema();
  const jobCols = await queryDb("PRAGMA table_info(jobs)");
  const colNames = jobCols.rows.map((r: any) => r.name);
  for (const requiredCol of ['social_publish_at', 'social_status', 'social_whatsapp', 'social_telegram', 'social_tiktok']) {
    if (!colNames.includes(requiredCol)) {
      throw new Error(`Missing column in jobs: ${requiredCol}`);
    }
  }

  console.log('✅ Task 1 tests passed successfully!');
}

run().catch((err) => {
  console.error('❌ Task 1 test error:', err);
  process.exit(1);
});
