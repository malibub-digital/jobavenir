export const prerender = false;

import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';

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

export const POST: APIRoute = async ({ request }) => {
  if (!(await isAuthenticated(request))) {
    return new Response(JSON.stringify({ error: 'Accès non autorisé' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const { slug, action, isActive } = body;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const safeSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
    const contentDir = path.join(process.cwd(), 'src', 'content', 'actualites');
    const filePath = path.join(contentDir, `${safeSlug}.md`);

    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: `Article introuvable (${safeSlug})` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(fileContent);

    if (action === 'toggle-publish') {
      const newActive = Boolean(isActive);
      parsed.data.draft = !newActive;
      parsed.data.is_active = newActive;

      const updatedFile = matter.stringify(parsed.content, parsed.data);
      fs.writeFileSync(filePath, updatedFile, 'utf-8');

      return new Response(JSON.stringify({
        success: true,
        message: newActive ? 'Article publié avec succès' : 'Article dépublié avec succès',
        slug: safeSlug,
        isActive: newActive
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Action non reconnue' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
