export const prerender = false;

import type { APIRoute } from 'astro';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import { queryDb } from '../../../lib/db';
import { calculateDefaultSocialPublishAt } from '../../../lib/social-generator';

async function isAuthenticated(request: Request): Promise<boolean> {
  const rawSecret = (typeof import.meta !== 'undefined' && import.meta.env?.CMS_ADMIN_SECRET) || process.env.CMS_ADMIN_SECRET || 'admin123';
  const expectedHash = await hashSha256(rawSecret);

  // Vérifier cookie ml_admin_token
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/ml_admin_token=([^;]+)/);
  if (match && match[1] === expectedHash) {
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
  return new Response(JSON.stringify({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      title: row.title,
      isActive: Boolean(row.is_active),
      socialPublishAt: row.social_publish_at || calculateDefaultSocialPublishAt(),
      socialStatus: row.social_status || 'SCHEDULED',
      socialWhatsapp: row.social_whatsapp || '',
      socialTelegram: row.social_telegram || '',
      socialTiktok: row.social_tiktok || ''
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
    const { type = 'job', slug, action, isActive, socialPublishAt, socialStatus, socialWhatsapp, socialTelegram, socialTiktok } = body;

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

    // Mise à jour complète des paramètres
    await queryDb(`
      UPDATE ${table} SET
        is_active = $1,
        social_publish_at = $2,
        social_status = $3,
        social_whatsapp = $4,
        social_telegram = $5,
        social_tiktok = $6,
        updated_at = NOW()
      WHERE slug = $7
    `, [
      Boolean(isActive),
      socialPublishAt || null,
      socialStatus || 'SCHEDULED',
      socialWhatsapp || '',
      socialTelegram || '',
      socialTiktok || '',
      slug
    ]);

    return new Response(JSON.stringify({ success: true }), {
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
