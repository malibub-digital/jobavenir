export const prerender = false;

import type { APIRoute } from 'astro';
import { hashSha256 } from '@malihub/sites-core/utils/auth.js';
import fs from 'fs';
import path from 'path';

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
  const category = url.searchParams.get('category')?.toLowerCase().trim() || '';

  try {
    const publicDir = path.resolve(process.cwd(), 'public');
    const categoriesDir = path.join(publicDir, 'images', 'categories');
    const images: string[] = [];

    // Fonction récursive légère pour lister les webp / png
    function scanDir(dir: string, prefix: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) {
          scanDir(fullPath, relPath);
        } else if (entry.isFile() && /\.(webp|png|jpe?g)$/i.test(entry.name)) {
          images.push(relPath);
        }
      }
    }

    // 1. Scanner le dossier de catégories
    scanDir(categoriesDir, '/images/categories');

    // 2. Si une catégorie est spécifiée, trier pour mettre en avant celles qui matchent
    let sortedImages = images;
    if (category) {
      sortedImages = [...images].sort((a, b) => {
        const aMatch = a.toLowerCase().includes(category) ? 1 : 0;
        const bMatch = b.toLowerCase().includes(category) ? 1 : 0;
        return bMatch - aMatch;
      });
    }

    return new Response(JSON.stringify({
      success: true,
      images: sortedImages.slice(0, 80) // Limiter à 80 suggestions
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erreur lors de la récupération des images' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
