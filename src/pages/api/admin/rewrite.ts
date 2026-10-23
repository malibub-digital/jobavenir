export const prerender = false;

import type { APIRoute } from 'astro';
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
    const { field = 'title', text, context = '' } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Texte à reformuler manquant' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Clé OPENROUTER_API_KEY non configurée' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let instruction = "";
    if (field === 'title') {
      instruction = `Tu es un expert en recrutement et communication au Mali (JobAvenir Mali). Reformule le titre d'opportunité suivant pour qu'il soit professionnel, percutant, standardisé (forme: Métier ou Intitulé (H/F), ex: "Ingénieur Télécoms & Fibre (H/F)"), adapté au contexte professionnel malien. Réponds UNIQUEMENT par le texte reformulé, sans guillemets, sans politesses, sans explications.`;
    } else if (field === 'excerpt') {
      instruction = `Tu es un expert en communication professionnelle au Mali (JobAvenir Mali). Reformule ce résumé d'opportunité pour qu'il soit clair, engageant, concis (2 à 3 phrases maximum) et orienté action pour les candidats ou porteurs de projet au Mali. Réponds UNIQUEMENT par le texte reformulé, sans guillemets, sans explications.`;
    } else {
      instruction = `Tu es un expert en communication au Mali (JobAvenir Mali). Reformule ce texte pour une annonce d'emploi ou opportunité au Mali pour le rendre plus professionnel, attractif et percutant. Réponds UNIQUEMENT par le texte reformulé, sans guillemets, sans explications.`;
    }

    const prompt = `${instruction}\n\nContexte: ${context || 'Offre / Opportunité au Mali'}\nTexte original: "${text.trim()}"`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://job.malihub.digital',
        'X-Title': 'JobAvenir Mali Admin'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenRouter error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    let rewritten = data.choices?.[0]?.message?.content?.trim() || '';
    // Nettoyer d'éventuels guillemets autour
    rewritten = rewritten.replace(/^["'«“](.*)["'»”]$/s, '$1').trim();

    return new Response(JSON.stringify({
      success: true,
      original: text,
      rewritten
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Erreur lors de la reformulation IA' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
