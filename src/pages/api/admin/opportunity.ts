export const prerender = false;

import type { APIRoute } from 'astro';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { queryDb } from '../../../lib/db';
import { calculateDefaultSocialPublishAt } from '../../../lib/social-generator';

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
  const type = url.searchParams.get('type') || 'job';
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Slug manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const table = type === 'idea' ? 'ideas' : 'jobs';
  const res = await queryDb(`SELECT * FROM ${table} WHERE slug = $1`, [slug]);
  if (res.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Opportunité introuvable' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const row = res.rows[0];
  const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});

  return new Response(JSON.stringify({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt || row.concept || '',
      heroImage: metadata.heroImage || null,
      requirements: typeof row.requirements === 'string' ? JSON.parse(row.requirements || '[]') : (row.requirements || []),
      howToApply: row.how_to_apply || row.premiere_action || '',
      company: row.company || '',
      location: row.location || row.zone_cible || '',
      category: row.category || row.sector || '',
      isActive: Boolean(row.is_active),
      socialPublishAt: row.social_publish_at || calculateDefaultSocialPublishAt(),
      socialStatus: row.social_status || 'SCHEDULED',
      socialWhatsapp: row.social_whatsapp || '',
      socialTelegram: row.social_telegram || '',
      socialTiktok: row.social_tiktok || '',
      metadata
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
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
    const { 
      type = 'job', 
      slug, 
      action, 
      isActive, 
      title, 
      excerpt, 
      heroImage, 
      requirements, 
      howToApply,
      socialPublishAt, 
      socialStatus, 
      socialWhatsapp, 
      socialTelegram, 
      socialTiktok 
    } = body;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const table = type === 'idea' ? 'ideas' : 'jobs';

    // Action 1-clic : bascule de publication
    if (action === 'toggle-publish') {
      const newActive = Boolean(isActive);
      const newStatus = newActive ? 'SCHEDULED' : 'PAUSED';
      await queryDb(
        `UPDATE ${table} SET is_active = $1, social_status = $2, updated_at = NOW() WHERE slug = $3`,
        [newActive, newStatus, slug]
      );
      return new Response(JSON.stringify({ success: true, isActive: newActive, socialStatus: newStatus }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Récupérer la ligne existante pour mettre à jour son json metadata
    const existingRes = await queryDb(`SELECT metadata FROM ${table} WHERE slug = $1`, [slug]);
    let currentMetadata: Record<string, any> = {};
    if (existingRes.rows.length > 0) {
      const rawMeta = existingRes.rows[0].metadata;
      currentMetadata = typeof rawMeta === 'string' ? JSON.parse(rawMeta || '{}') : (rawMeta || {});
    }

    // Si une image heroImage est fournie, la sauvegarder dans metadata
    if (heroImage !== undefined) {
      if (heroImage) {
        currentMetadata.heroImage = heroImage;
      } else {
        delete currentMetadata.heroImage;
      }
    }

    // Construction dynamique de la requête UPDATE
    const sets: string[] = ['updated_at = NOW()'];
    const params: any[] = [];

    if (isActive !== undefined) {
      params.push(Boolean(isActive));
      sets.push(`is_active = $${params.length}`);
    }
    if (socialPublishAt !== undefined) {
      params.push(socialPublishAt || null);
      sets.push(`social_publish_at = $${params.length}`);
    }
    if (socialStatus !== undefined) {
      params.push(socialStatus || 'SCHEDULED');
      sets.push(`social_status = $${params.length}`);
    }
    if (socialWhatsapp !== undefined) {
      params.push(socialWhatsapp || '');
      sets.push(`social_whatsapp = $${params.length}`);
    }
    if (socialTelegram !== undefined) {
      params.push(socialTelegram || '');
      sets.push(`social_telegram = $${params.length}`);
    }
    if (socialTiktok !== undefined) {
      params.push(socialTiktok || '');
      sets.push(`social_tiktok = $${params.length}`);
    }

    // Champs de contenu éditables
    if (title !== undefined && title.trim().length > 0) {
      params.push(title.trim());
      sets.push(`title = $${params.length}`);
    }

    if (type === 'idea') {
      if (excerpt !== undefined) {
        params.push(excerpt.trim());
        sets.push(`concept = $${params.length}`);
      }
      if (howToApply !== undefined) {
        params.push(howToApply.trim());
        sets.push(`premiere_action = $${params.length}`);
      }
    } else {
      if (excerpt !== undefined) {
        params.push(excerpt.trim());
        sets.push(`excerpt = $${params.length}`);
      }
      if (howToApply !== undefined) {
        params.push(howToApply.trim());
        sets.push(`how_to_apply = $${params.length}`);
      }
      if (requirements !== undefined) {
        const reqArray = Array.isArray(requirements) 
          ? requirements 
          : typeof requirements === 'string' 
            ? requirements.split('\n').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
            : [];
        params.push(JSON.stringify(reqArray));
        sets.push(`requirements = $${params.length}`);
      }
    }

    // Metadata JSON
    params.push(JSON.stringify(currentMetadata));
    sets.push(`metadata = $${params.length}`);

    // Paramètre WHERE slug = $N
    params.push(slug);
    const slugParamIndex = params.length;

    await queryDb(`
      UPDATE ${table} SET
        ${sets.join(', ')}
      WHERE slug = $${slugParamIndex}
    `, params);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Opportunité mise à jour avec succès',
      data: {
        title,
        excerpt,
        heroImage: currentMetadata.heroImage || null,
        howToApply
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
