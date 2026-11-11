import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { queryDb, initDatabaseSchema } from '../src/lib/db';
import { GET, POST } from '../src/pages/api/admin/opportunity';

async function testAdminApi() {
  console.log('--- 1. Testing Auth & Token Logic ---');
  const rawSecret = process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedToken = await hashSha256(rawSecret);

  if (!expectedToken || expectedToken.length !== 64) {
    throw new Error('Invalid SHA256 token generated');
  }
  console.log('✅ Auth token generated properly:', expectedToken.slice(0, 10) + '...');

  console.log('--- 2. Database Setup & Opportunity Insertion ---');
  await initDatabaseSchema();
  const testSlug = `test-admin-api-${Date.now()}`;
  
  await queryDb(`
    INSERT INTO jobs (
      slug, title, company, excerpt, content_hash, is_active,
      social_status, social_whatsapp, social_telegram, social_tiktok
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    testSlug,
    'Poste Test Admin API',
    'Entreprise Test',
    'Description test',
    testSlug,
    true,
    'SCHEDULED',
    'WA initial',
    'TG initial',
    'TT initial'
  ]);

  try {
    console.log('--- 3. Testing GET Endpoint (Unauthenticated) ---');
    const unauthReq = new Request(`http://localhost:4321/api/admin/opportunity?slug=${testSlug}&type=job`);
    const unauthRes = await GET({ request: unauthReq } as any);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated request, got ${unauthRes.status}`);
    }
    console.log('✅ 401 properly returned for unauthenticated request');

    console.log('--- 4. Testing GET Endpoint (Authenticated via Bearer Header) ---');
    const authReq = new Request(`http://localhost:4321/api/admin/opportunity?slug=${testSlug}&type=job`, {
      headers: {
        authorization: `Bearer ${expectedToken}`
      }
    });
    const authRes = await GET({ request: authReq } as any);
    if (authRes.status !== 200) {
      throw new Error(`Expected 200 for authenticated request, got ${authRes.status}`);
    }
    const getData = await authRes.json();
    if (!getData.success || getData.data.slug !== testSlug || getData.data.isActive !== true) {
      throw new Error(`Unexpected GET response data: ${JSON.stringify(getData)}`);
    }
    console.log('✅ GET /api/admin/opportunity returned opportunity successfully');

    console.log('--- 5. Testing POST toggle-publish (Pause / Inactive) via Cookie ---');
    const toggleReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `ml_admin_token=${expectedToken}`
      },
      body: JSON.stringify({
        type: 'job',
        slug: testSlug,
        action: 'toggle-publish',
        isActive: false
      })
    });
    const toggleRes = await POST({ request: toggleReq } as any);
    if (toggleRes.status !== 200) {
      throw new Error(`Expected 200 for toggle-publish, got ${toggleRes.status}`);
    }
    const toggleData = await toggleRes.json();
    if (!toggleData.success || toggleData.isActive !== false || toggleData.socialStatus !== 'PAUSED') {
      throw new Error(`Unexpected toggle response data: ${JSON.stringify(toggleData)}`);
    }

    // Vérifier en base
    const dbCheck1 = await queryDb('SELECT is_active, social_status FROM jobs WHERE slug = $1', [testSlug]);
    if (Boolean(dbCheck1.rows[0].is_active) !== false || dbCheck1.rows[0].social_status !== 'PAUSED') {
      throw new Error(`DB values incorrect after toggle to inactive: ${JSON.stringify(dbCheck1.rows[0])}`);
    }
    console.log('✅ toggle-publish successfully updated is_active=false and social_status=PAUSED');

    console.log('--- 6. Testing POST full update of social settings ---');
    const updateReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${expectedToken}`
      },
      body: JSON.stringify({
        type: 'job',
        slug: testSlug,
        isActive: true,
        socialPublishAt: '2026-10-15T10:00:00.000Z',
        socialStatus: 'SCHEDULED',
        socialWhatsapp: 'WA mis à jour',
        socialTelegram: 'TG mis à jour',
        socialTiktok: 'TT mis à jour'
      })
    });
    const updateRes = await POST({ request: updateReq } as any);
    if (updateRes.status !== 200) {
      throw new Error(`Expected 200 for full update, got ${updateRes.status}`);
    }

    // Vérifier en base
    const dbCheck2 = await queryDb('SELECT * FROM jobs WHERE slug = $1', [testSlug]);
    const row = dbCheck2.rows[0];
    if (
      Boolean(row.is_active) !== true ||
      row.social_status !== 'SCHEDULED' ||
      row.social_whatsapp !== 'WA mis à jour' ||
      row.social_telegram !== 'TG mis à jour' ||
      row.social_tiktok !== 'TT mis à jour'
    ) {
      throw new Error(`DB values incorrect after update: ${JSON.stringify(row)}`);
    }
    console.log('✅ Full settings update successfully applied to DB');

    console.log('--- 7. Testing GET search & POST create ---');
    const searchReq = new Request(`http://localhost:4321/api/admin/opportunity?q=Entreprise%20Test&limit=5`, {
      headers: { authorization: `Bearer ${expectedToken}` }
    });
    const searchRes = await GET({ request: searchReq } as any);
    const searchData = await searchRes.json();
    if (!searchData.success || !Array.isArray(searchData.items) || searchData.count < 1) {
      throw new Error(`Search failed: ${JSON.stringify(searchData)}`);
    }
    console.log('✅ GET search returned', searchData.count, 'item(s)');

    const createReq = new Request('http://localhost:4321/api/admin/opportunity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${expectedToken}`
      },
      body: JSON.stringify({
        action: 'create',
        type: 'job',
        title: 'Offre Créée via Hermes (H/F)',
        company: 'Hermes Test Corp',
        location: 'Bamako, Mali',
        contractType: 'CDI',
        category: 'Informatique & Tech',
        deadline: '2026-12-31',
        excerpt: 'Résumé court',
        description: 'Description complète de l offre',
        howToApply: 'Postuler par email',
        requirements: ['Critère 1', 'Critère 2']
      })
    });
    const createRes = await POST({ request: createReq } as any);
    const createData = await createRes.json();
    if (createRes.status !== 201 || !createData.success || !createData.slug) {
      throw new Error(`Create failed: ${JSON.stringify(createData)}`);
    }
    console.log('✅ POST action=create created slug:', createData.slug);
    await queryDb('DELETE FROM jobs WHERE slug = $1', [createData.slug]);

  } finally {
    // Nettoyage
    await queryDb('DELETE FROM jobs WHERE slug = $1', [testSlug]);
    console.log('🧹 Cleaned up test opportunity');
  }

  console.log('✅ Task 3 tests passed successfully!');
}

testAdminApi().catch(err => {
  console.error('❌ Task 3 test failed:', err);
  process.exit(1);
});
