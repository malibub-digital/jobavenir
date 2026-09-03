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
  domain?: string;
  salary?: string | null;
  deadline?: string | null;
  publishedDate?: string;
  excerpt: string;
  howToApply?: string | null;
  requirements?: string[];
  metadata?: Record<string, any>;
}

/**
 * Extrait une offre d'emploi structurée à partir d'un texte HTML/brut en appelant OpenRouter
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

    // Nettoyage markdown éventuel (ex: ```json ... ```)
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    const parsed: any = JSON.parse(content);
    if (parsed.ignore === true || (!parsed.title && !fallbackTitle)) {
      return null;
    }
    if (!parsed.title && fallbackTitle) {
      parsed.title = fallbackTitle;
    }
    if (!parsed.location) {
      parsed.location = 'Bamako, Mali';
    }
    if (!parsed.company) {
      parsed.company = 'Organisme Partenaire';
    }
    if (!parsed.contractType) {
      parsed.contractType = 'Autre';
    }
    return parsed as ExtractedJob;
  } catch (err) {
    console.error('[AI] Erreur de parsing LLM:', err);
    return null;
  }
}
