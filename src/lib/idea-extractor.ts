import dotenv from 'dotenv';
dotenv.config();

import { IDEA_PROMPT_CONFIG } from '../config/ai-prompts';
import { CATEGORY_LABELS } from '../config/categories';

export interface ExtractedIdea {
  title: string;
  sector: string;
  zoneCible: string;
  demarrageLevel: 'Très faible' | 'Modéré' | 'Conséquent';
  besoinIdentifie: string;
  concept: string;
  publicCible: string;
  competencesCles: string[];
  premiereAction: string;
  metadata?: Record<string, any>;
}

/**
 * Valide les contraintes éthiques et techniques de l'idée
 */
export function validateExtractedIdea(idea: any): ExtractedIdea | null {
  if (!idea || typeof idea !== 'object') return null;

  // 1. Titre
  if (!idea.title || typeof idea.title !== 'string' || idea.title.length < 10) return null;

  // 2. Vérification contre tout montant financier explicite ou promesse
  const forbiddenPatterns = [
    /\d{3,}\s*(FCFA|CFA|Francs?|€|EUR|\$|USD)/i,
    /(?:rendement|rentabilit[ée]|profit|b[ée]n[ée]fice|revenu\s+passif).*(?:garanti|assur[ée])/i
  ];
  const fullText = `${idea.title} ${idea.concept} ${idea.premiereAction} ${idea.besoinIdentifie}`;
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(fullText)) {
      console.warn(`[AI Idea Filter] Idée rejetée car contient un motif financier interdit: ${pattern}`);
      return null;
    }
  }

  // 3. Normalisation et vérification du secteur
  let sector = (idea.sector || '').trim();
  const matchedLabel = CATEGORY_LABELS.find(l => l.toLowerCase() === sector.toLowerCase());
  if (matchedLabel) {
    sector = matchedLabel;
  } else {
    // Si l'IA a retourné un libellé approchant, on tente une inclusion
    const fuzzy = CATEGORY_LABELS.find(l => l.toLowerCase().includes(sector.toLowerCase()) || sector.toLowerCase().includes(l.toLowerCase()));
    sector = fuzzy || 'Services & Transport';
  }

  // 4. Niveau de démarrage (enum stricte)
  let level = (idea.demarrageLevel || '').trim();
  if (!['Très faible', 'Modéré', 'Conséquent'].includes(level)) {
    if (/faible|facile|micro|minime/i.test(level)) level = 'Très faible';
    else if (/cons[ée]quent|moyen|important/i.test(level)) level = 'Conséquent';
    else level = 'Modéré';
  }

  // 5. Première action 48h
  if (!idea.premiereAction || typeof idea.premiereAction !== 'string' || idea.premiereAction.length < 15) {
    return null;
  }

  return {
    title: idea.title.trim().slice(0, 120),
    sector,
    zoneCible: idea.zoneCible || 'Bamako, Mali',
    demarrageLevel: level as 'Très faible' | 'Modéré' | 'Conséquent',
    besoinIdentifie: idea.besoinIdentifie?.trim() || 'Friction observée dans l\'approvisionnement ou les services locaux.',
    concept: idea.concept?.trim() || '',
    publicCible: idea.publicCible?.trim() || 'Particuliers et micro-commerces locaux',
    competencesCles: Array.isArray(idea.competencesCles) ? idea.competencesCles.slice(0, 5) : ['Sens du commerce', 'Organisation'],
    premiereAction: idea.premiereAction.trim(),
    metadata: idea.metadata || {}
  };
}

/**
 * Extrait une idée d'entreprise contextualisée au Mali depuis un texte brut via LLM (OpenRouter)
 */
export async function extractIdeaWithAI(rawText: string, fallbackTitle?: string): Promise<ExtractedIdea | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY manquante dans l\'environnement.');
  }

  const model = process.env.OPENROUTER_MODEL || IDEA_PROMPT_CONFIG.defaultModel;
  const temperature = IDEA_PROMPT_CONFIG.temperature;
  const systemPrompt = IDEA_PROMPT_CONFIG.systemPrompt;

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://jobavenir.ml',
          'X-Title': 'JobAvenir Idea Extractor'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Contenu source à analyser et contextualiser en micro-projet pour le Mali :\n\nTitre initial: ${fallbackTitle || ''}\n\n${rawText.slice(0, 8000)}` }
          ],
          temperature
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[AI Ideas] Erreur OpenRouter (${response.status}) [Tentative ${attempt}/${maxAttempts}]: ${errText}`);
        if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
          const delay = attempt * 2500;
          console.log(`[AI Ideas] ⏳ Pause de ${delay}ms avant nouvelle tentative suite au rate limit...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return null;
      }

      const data = await response.json();
      const content: string = data.choices?.[0]?.message?.content?.trim() || '';

      // Détection d'un objet JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[AI Ideas] Aucun objet JSON détecté dans la réponse');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.ignore === true) {
        return null;
      }

      return validateExtractedIdea(parsed);
    } catch (err: any) {
      console.error(`[AI Ideas] Erreur de parsing LLM [Tentative ${attempt}/${maxAttempts}]:`, err?.message || err);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      return null;
    }
  }
  return null;
}
