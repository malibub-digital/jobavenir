import dotenv from 'dotenv';
dotenv.config();

import { AI_PROMPT_CONFIG } from '../config/ai-prompts';

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  contractType: 'CDI' | 'CDD' | 'Stage' | 'Intérim' | 'Apprentissage' | 'Autre';
  opportunityType?: 'JOB' | 'STAGE' | 'TRAINING' | 'PROJECT_CALL' | 'ANNOUNCEMENT';
  category: string;
  subCategory?: string;
  domain?: string;
  salary?: string | null;
  deadline?: string | null;
  publishedDate?: string;
  teaser?: string;
  excerpt: string;
  howToApply?: string | null;
  requirements?: string[];
  metadata?: Record<string, any>;
}

export interface BatchJobInput {
  id: string | number;
  title: string;
  content: string;
}

function normalizeExtractedJob(parsed: any, fallbackTitle?: string): ExtractedJob | null {
  if (!parsed || parsed.ignore === true) {
    return null;
  }
  if (!parsed.title && !fallbackTitle) {
    return null;
  }
  return {
    title: parsed.title || fallbackTitle,
    company: parsed.company || 'Organisme Partenaire',
    location: parsed.location || 'Bamako, Mali',
    contractType: parsed.contractType || 'Autre',
    opportunityType: parsed.opportunityType || undefined,
    category: parsed.category || 'Services & Entreprises',
    subCategory: parsed.subCategory || undefined,
    domain: parsed.domain || undefined,
    salary: parsed.salary || null,
    deadline: parsed.deadline || null,
    publishedDate: parsed.publishedDate || undefined,
    teaser: parsed.teaser || undefined,
    excerpt: parsed.excerpt || '',
    howToApply: parsed.howToApply || null,
    requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
    metadata: parsed.metadata || {}
  };
}

/**
 * Extrait un lot de publications en un seul appel LLM pour diviser drastiquement les coûts en tokens.
 * Retourne une Map id -> ExtractedJob (ou null si écarté/ignoré)
 */
export async function extractJobsBatchWithAI(posts: BatchJobInput[]): Promise<Map<string | number, ExtractedJob | null>> {
  const results = new Map<string | number, ExtractedJob | null>();
  if (!posts || posts.length === 0) return results;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY manquante dans l\'environnement.');
  }

  const model = process.env.OPENROUTER_MODEL || AI_PROMPT_CONFIG.defaultModel;
  const temperature = parseFloat(process.env.OPENROUTER_TEMPERATURE || String(AI_PROMPT_CONFIG.temperature));
  const baseSystemPrompt = process.env.OPENROUTER_CUSTOM_PROMPT || AI_PROMPT_CONFIG.systemPrompt;

  const batchSystemPrompt = `${baseSystemPrompt}

INSTRUCTION PARTICULIÈRE DE TRAITEMENT PAR LOT (BATCH) :
Tu vas recevoir plusieurs publications numérotées dans un tableau JSON.
Pour CHAQUE publication identifiée par sa propriété "id", analyse si elle présente une réelle opportunité actionnable pour l'usager.
Retourne STRICTEMENT un tableau JSON où chaque élément correspond à une publication :
[
  {
    "id": 1,
    "ignore": true // si fait divers, audience, protocole, compte-rendu sans opportunité
  },
  {
    "id": 2,
    "ignore": false,
    "job": {
      "title": "Titre court et clair",
      "company": "Nom organisme",
      "location": "Bamako, Mali",
      "contractType": "CDI",
      "opportunityType": "JOB",
      "category": "Catégorie valide",
      "subCategory": "Sous-catégorie valide",
      "deadline": "YYYY-MM-DD",
      "teaser": "Accroche choc",
      "excerpt": "Résumé en 1-2 phrases très simples",
      "howToApply": "Consigne pour postuler",
      "requirements": ["Point 1", "Point 2"]
    }
  }
]
Ne retourne AUCUN texte en dehors du tableau JSON.`;

  const simplifiedPayload = posts.map(p => ({
    id: p.id,
    title: p.title,
    content: (p.content || '').slice(0, 4000)
  }));

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://jobavenir.ml',
        'X-Title': 'JobAvenir Scraper'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: batchSystemPrompt },
          { role: 'user', content: `Voici les ${posts.length} publications à analyser :\n\n${JSON.stringify(simplifiedPayload, null, 2)}` }
        ],
        temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI Batch] Erreur OpenRouter (${response.status}): ${errText}`);
      for (const p of posts) results.set(p.id, null);
      return results;
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content?.trim() || '';

    // Extraction robuste du tableau JSON
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[AI Batch] Aucun tableau JSON valide détecté dans la réponse LLM. Fallback individuel...');
      for (const p of posts) {
        const single = await extractJobWithAI(`${p.title}\n\n${p.content}`, p.title);
        results.set(p.id, single);
      }
      return results;
    }

    const parsedArray: any[] = JSON.parse(jsonMatch[0]);
    const parsedMap = new Map<string | number, any>();
    for (const item of parsedArray) {
      if (item && item.id !== undefined) {
        parsedMap.set(item.id, item);
      }
    }

    for (const p of posts) {
      const resItem = parsedMap.get(p.id);
      if (!resItem || resItem.ignore === true) {
        results.set(p.id, null);
      } else {
        const jobData = resItem.job || resItem;
        const normalized = normalizeExtractedJob(jobData, p.title);
        results.set(p.id, normalized);
      }
    }

    return results;
  } catch (err) {
    console.error('[AI Batch] Erreur lors du traitement par lot:', err);
    for (const p of posts) {
      results.set(p.id, null);
    }
    return results;
  }
}

/**
 * Extrait une offre d'emploi structurée unitaire (rétrocompatibilité)
 */
export async function extractJobWithAI(rawText: string, fallbackTitle?: string): Promise<ExtractedJob | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY manquante dans l\'environnement.');
  }

  // Modèle configurable (défaut : valeur dans ai-prompts.ts ou process.env)
  const model = process.env.OPENROUTER_MODEL || AI_PROMPT_CONFIG.defaultModel;
  const temperature = parseFloat(process.env.OPENROUTER_TEMPERATURE || String(AI_PROMPT_CONFIG.temperature));
  const systemPrompt = process.env.OPENROUTER_CUSTOM_PROMPT || AI_PROMPT_CONFIG.systemPrompt;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://jobavenir.ml',
        'X-Title': 'JobAvenir Scraper'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Texte de l'offre à analyser :\n\n${rawText.slice(0, 10000)}` }
        ],
        temperature
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[AI] Erreur OpenRouter (${response.status}): ${errText}`);
      return null;
    }

    const data = await response.json();
    let content: string = data.choices?.[0]?.message?.content?.trim() || '';

    // Extraction robuste du premier objet JSON dans la réponse
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[AI] Aucun objet JSON valide détecté dans la réponse LLM');
      return null;
    }

    const parsed: any = JSON.parse(jsonMatch[0]);
    if (parsed.ignore === true) {
      console.log('      🛡️ Contenu écarté par l\'IA : pas de réelle opportunité actionnable pour l\'usager.');
      return null;
    }
    return normalizeExtractedJob(parsed, fallbackTitle);
  } catch (err) {
    console.error('[AI] Erreur de parsing LLM:', err);
    return null;
  }
}
