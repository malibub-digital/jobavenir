export const prerender = false;

import type { APIRoute } from 'astro';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { 
  getAllSources, 
  getSourceById, 
  toggleSourceActive, 
  upsertSource, 
  updateSourceLogo,
  queryDb
} from '../../../lib/db';
import { resolveSourceLogo } from '../../../lib/source-logo-fetcher';

async function isAuthenticated(request: Request): Promise<boolean> {
  const rawSecret = (typeof import.meta !== 'undefined' && import.meta.env?.CMS_ADMIN_SECRET) || process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedHash = await hashSha256(rawSecret);

  // Vérifier cookie cms_admin_token ou ml_admin_token
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:cms_admin_token|ml_admin_token)=([^;]+)/);
  if (match && decodeURIComponent(match[1]) === expectedHash) {
    return true;
  }

  // Vérifier en-tête Authorization: Bearer <hash>
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === expectedHash) {
    return true;
  }

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
  const id = url.searchParams.get('id');
  const search = url.searchParams.get('search') || undefined;
  const category = url.searchParams.get('category') || undefined;
  const statusTechnical = url.searchParams.get('status') || undefined;
  const onlyActive = url.searchParams.get('active') === 'true' ? true : undefined;

  try {
    if (id) {
      const source = await getSourceById(id);
      if (!source) {
        return new Response(JSON.stringify({ error: 'Source non trouvée' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true, data: source }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const sources = await getAllSources({
      search,
      category,
      statusTechnical,
      onlyActive
    });

    // Statistiques globales
    const statsRes = await queryDb(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN discovery_status = 'AUTO_DISCOVERED' THEN 1 ELSE 0 END) as discovered
      FROM sources
    `);

    return new Response(JSON.stringify({
      success: true,
      stats: {
        total: parseInt(statsRes.rows[0]?.total || '0', 10),
        active: parseInt(statsRes.rows[0]?.active || '0', 10),
        discovered: parseInt(statsRes.rows[0]?.discovered || '0', 10)
      },
      data: sources
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
    const { action, id, isActive, sourceData } = body;

    // Action : Basculer activation/désactivation
    if (action === 'toggle-active') {
      if (!id) throw new Error('ID source requis');
      const res = await toggleSourceActive(id, isActive);
      return new Response(JSON.stringify({
        success: true,
        id,
        isActive: res.isActive,
        message: `Source ${res.isActive ? 'activée' : 'désactivée'} avec succès`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Action : Enregistrer ou modifier une source
    if (action === 'save') {
      if (!sourceData || !sourceData.name || !sourceData.url) {
        throw new Error('Nom et URL obligatoires pour enregistrer une source');
      }
      const savedId = await upsertSource(sourceData);

      // Si nouveau ou logo manquant, tentative d'auto-résolution de logo en tâche de fond
      if (!sourceData.logoUrl && sourceData.url.startsWith('http')) {
        resolveSourceLogo({ id: savedId, name: sourceData.name, url: sourceData.url })
          .then(logoUrl => {
            if (logoUrl) updateSourceLogo(savedId, logoUrl);
          })
          .catch(() => {});
      }

      return new Response(JSON.stringify({
        success: true,
        id: savedId,
        message: 'Source sauvegardée avec succès'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Action : Forcer le rafraîchissement du logo d'une source
    if (action === 'refresh-logo') {
      if (!id) throw new Error('ID source requis');
      const src = await getSourceById(id);
      if (!src) throw new Error('Source introuvable');

      const logoUrl = await resolveSourceLogo({ id: src.id, name: src.name, url: src.url });
      if (logoUrl) {
        await updateSourceLogo(id, logoUrl);
      }

      return new Response(JSON.stringify({
        success: true,
        logoUrl: logoUrl || src.logoUrl || null,
        message: logoUrl ? 'Logo régénéré avec succès' : 'Impossible de récupérer un logo pour cette URL'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Action : Tester la connectivité de la source (HEAD/GET)
    if (action === 'test-source') {
      if (!id) throw new Error('ID source requis');
      const src = await getSourceById(id);
      if (!src) throw new Error('Source introuvable');

      let reachable = false;
      let statusHttp = 0;
      let latencyMs = 0;
      const start = Date.now();

      try {
        const testRes = await fetch(src.url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          signal: AbortSignal.timeout(10000)
        });
        latencyMs = Date.now() - start;
        statusHttp = testRes.status;
        reachable = testRes.ok;
      } catch (e: any) {
        latencyMs = Date.now() - start;
      }

      return new Response(JSON.stringify({
        success: true,
        reachable,
        statusHttp,
        latencyMs,
        message: reachable ? `URL accessible en ${latencyMs}ms (HTTP ${statusHttp})` : `Échec de connexion (HTTP ${statusHttp || 'Timeout'})`
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
