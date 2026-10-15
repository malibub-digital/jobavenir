export const prerender = false;

import type { APIRoute } from 'astro';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { queryDb, archiveExpiredJobs } from '../../../lib/db';

async function isAuthenticated(request: Request): Promise<boolean> {
  const rawSecret = (typeof import.meta !== 'undefined' && import.meta.env?.CMS_ADMIN_SECRET) || process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedHash = await hashSha256(rawSecret);

  // Cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:cms_admin_token|ml_admin_token)=([^;]+)/);
  if (match && decodeURIComponent(match[1]) === expectedHash) return true;

  // Header Bearer
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedHash) return true;

  return false;
}

export const GET: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const olderThanDays = parseInt(url.searchParams.get('days') || '30', 10);
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  try {
    // 1. Opportunités avec deadline dépassée
    const expiredDeadlinesRes = await queryDb(`
      SELECT id, slug, title, company, deadline, published_date, is_active
      FROM jobs
      WHERE is_active = true
        AND deadline IS NOT NULL
        AND deadline != ''
        AND deadline < $1
      ORDER BY deadline ASC
    `, [today]);

    // 2. Opportunités sans deadline ou deadline lointaine mais publiées il y a > 30j
    const oldJobsRes = await queryDb(`
      SELECT id, slug, title, company, deadline, published_date, is_active
      FROM jobs
      WHERE is_active = true
        AND (deadline IS NULL OR deadline = '')
        AND published_date < $1
      ORDER BY published_date ASC
    `, [thresholdDate]);

    // 3. Détection des doublons existants (même employeur + titre identique insensible à la casse)
    const duplicateJobsRes = await queryDb(`
      SELECT LOWER(TRIM(company)) as comp, LOWER(TRIM(title)) as tit, COUNT(*) as cnt, ARRAY_AGG(id) as ids, ARRAY_AGG(slug) as slugs
      FROM jobs
      WHERE is_active = true
      GROUP BY LOWER(TRIM(company)), LOWER(TRIM(title))
      HAVING COUNT(*) > 1
    `);

    // 4. Idées : Doublons sur le titre ou le concept
    const duplicateIdeasRes = await queryDb(`
      SELECT LOWER(TRIM(title)) as tit, COUNT(*) as cnt, ARRAY_AGG(id) as ids, ARRAY_AGG(slug) as slugs
      FROM ideas
      WHERE is_active = true
      GROUP BY LOWER(TRIM(title))
      HAVING COUNT(*) > 1
    `);

    // 5. Liste des jobs actifs
    const activeJobsRes = await queryDb(`
      SELECT id, slug, title, company, opportunity_type, contract_type, category, published_date, deadline
      FROM jobs
      WHERE is_active = true
      ORDER BY id DESC
    `);

    // 6. Total opportunités actives et inactives
    const statsJobs = await queryDb(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive
      FROM jobs
    `);

    const statsIdeas = await queryDb(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE is_active = false) as inactive
      FROM ideas
    `);

    // 6. Liste complète des idées actives pour audit de pertinence approfondi
    const allActiveIdeasRes = await queryDb(`
      SELECT 
        id, slug, title, sector, zone_cible as "zoneCible", 
        demarrage_level as "demarrageLevel", 
        concept, premiere_action as "premiereAction",
        metadata, created_at as "createdAt"
      FROM ideas
      WHERE is_active = true
      ORDER BY id DESC
    `);

    return new Response(JSON.stringify({
      success: true,
      stats: {
        jobs: statsJobs.rows[0],
        ideas: statsIdeas.rows[0],
      },
      audit: {
        expiredDeadlinesCount: expiredDeadlinesRes.rows.length,
        expiredDeadlines: expiredDeadlinesRes.rows,
        oldJobsWithoutDeadlineCount: oldJobsRes.rows.length,
        oldJobsWithoutDeadline: oldJobsRes.rows,
        duplicateJobsCount: duplicateJobsRes.rows.length,
        duplicateJobs: duplicateJobsRes.rows,
        duplicateIdeasCount: duplicateIdeasRes.rows.length,
        duplicateIdeas: duplicateIdeasRes.rows,
      },
      activeIdeas: allActiveIdeasRes.rows,
      activeJobs: activeJobsRes.rows
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { action, olderThanDays = 30, dryRun = false } = body;
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    if (action === 'clean-all') {
      // 1. Expirés par deadline
      const expiredDeadlines = await queryDb(`
        SELECT id FROM jobs
        WHERE is_active = true
          AND deadline IS NOT NULL
          AND deadline != ''
          AND deadline < $1
      `, [today]);
      const expiredDeadlineIds = expiredDeadlines.rows.map(r => r.id);

      // 2. Obsolètes sans deadline (> 30j)
      const oldJobs = await queryDb(`
        SELECT id FROM jobs
        WHERE is_active = true
          AND (deadline IS NULL OR deadline = '')
          AND published_date < $1
      `, [thresholdDate]);
      const oldJobIds = oldJobs.rows.map(r => r.id);

      // 3. Doublons jobs : garder le plus récent (MAX(id)) et désactiver les précédents
      const dupRows = await queryDb(`
        SELECT LOWER(TRIM(company)), LOWER(TRIM(title)), ARRAY_AGG(id ORDER BY id DESC) as ids
        FROM jobs
        WHERE is_active = true
        GROUP BY LOWER(TRIM(company)), LOWER(TRIM(title))
        HAVING COUNT(*) > 1
      `);
      const dupJobIdsToDeactivate: number[] = [];
      for (const row of dupRows.rows) {
        // ids est trié par id DESC -> row.ids[0] est le plus récent, le reste à désactiver
        const ids = Array.isArray(row.ids) ? row.ids : JSON.parse(row.ids || '[]');
        if (ids.length > 1) {
          dupJobIdsToDeactivate.push(...ids.slice(1));
        }
      }

      // 4. Doublons idées : garder la plus récente et désactiver les précédentes
      const dupIdeasRows = await queryDb(`
        SELECT LOWER(TRIM(title)), ARRAY_AGG(id ORDER BY id DESC) as ids
        FROM ideas
        WHERE is_active = true
        GROUP BY LOWER(TRIM(title))
        HAVING COUNT(*) > 1
      `);
      const dupIdeaIdsToDeactivate: number[] = [];
      for (const row of dupIdeasRows.rows) {
        const ids = Array.isArray(row.ids) ? row.ids : JSON.parse(row.ids || '[]');
        if (ids.length > 1) {
          dupIdeaIdsToDeactivate.push(...ids.slice(1));
        }
      }

      const allJobIdsToDeactivate = Array.from(new Set([
        ...expiredDeadlineIds,
        ...oldJobIds,
        ...dupJobIdsToDeactivate
      ]));

      const allIdeaIdsToDeactivate = Array.from(new Set(dupIdeaIdsToDeactivate));

      if (dryRun) {
        return new Response(JSON.stringify({
          success: true,
          dryRun: true,
          toDeactivate: {
            jobs: {
              total: allJobIdsToDeactivate.length,
              expiredDeadlines: expiredDeadlineIds.length,
              oldWithoutDeadline: oldJobIds.length,
              duplicates: dupJobIdsToDeactivate.length,
              jobIds: allJobIdsToDeactivate
            },
            ideas: {
              total: allIdeaIdsToDeactivate.length,
              ideaIds: allIdeaIdsToDeactivate
            }
          }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Exécution réelle de la désactivation (is_active = false)
      if (allJobIdsToDeactivate.length > 0) {
        const idList = allJobIdsToDeactivate.join(',');
        await queryDb(`
          UPDATE jobs 
          SET is_active = false, social_status = 'ARCHIVED', updated_at = NOW()
          WHERE id IN (${idList})
        `);
      }

      if (allIdeaIdsToDeactivate.length > 0) {
        const idList = allIdeaIdsToDeactivate.join(',');
        await queryDb(`
          UPDATE ideas 
          SET is_active = false, social_status = 'ARCHIVED', updated_at = NOW()
          WHERE id IN (${idList})
        `);
      }

      return new Response(JSON.stringify({
        success: true,
        dryRun: false,
        archived: {
          jobsCount: allJobIdsToDeactivate.length,
          ideasCount: allIdeaIdsToDeactivate.length
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'deactivate-ideas') {
      const { ideaIds = [] } = body;
      if (!Array.isArray(ideaIds) || ideaIds.length === 0) {
        return new Response(JSON.stringify({ error: 'Aucun ID d\'idée fourni' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (dryRun) {
        return new Response(JSON.stringify({
          success: true,
          dryRun: true,
          toDeactivateCount: ideaIds.length,
          ideaIds
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const idList = ideaIds.map(Number).filter(n => !isNaN(n)).join(',');
      await queryDb(`
        UPDATE ideas 
        SET is_active = false, social_status = 'ARCHIVED', updated_at = NOW()
        WHERE id IN (${idList})
      `);

      return new Response(JSON.stringify({
        success: true,
        dryRun: false,
        deactivatedCount: ideaIds.length
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'run-scrape') {
      const { runScraper } = await import('../../../../scripts/scrape');
      // Lancement en tâche de fond pour ne pas bloquer la requête HTTP
      runScraper(false).catch(err => console.error('[Scraper Admin Error]', err));
      return new Response(JSON.stringify({
        success: true,
        message: 'Scraping des opportunités démarré en arrière-plan avec succès'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (action === 'run-scrape-ideas') {
      const { runIdeaScraper } = await import('../../../../scripts/scrape-ideas');
      // Lancement en tâche de fond pour ne pas bloquer la requête HTTP
      runIdeaScraper(false).catch(err => console.error('[Ideas Scraper Admin Error]', err));
      return new Response(JSON.stringify({
        success: true,
        message: 'Scraping des idées démarré en arrière-plan avec succès'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
