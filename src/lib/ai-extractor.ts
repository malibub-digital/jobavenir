import dotenv from 'dotenv';
dotenv.config();

export interface ExtractedJob {
  title: string;
  company: string;
  location: string;
  contractType: 'CDI' | 'CDD' | 'Stage' | 'Intérim' | 'Apprentissage' | 'Autre';
  category: string;
  domain?: string;
  salary?: string | null;
  deadline?: string | null;
  publishedDate?: string;
  excerpt: string;
  howToApply?: string | null;
  requirements?: string[];
}

/**
 * Extrait une offre d'emploi structurée à partir d'un texte HTML/brut en appelant OpenRouter
 */
export async function extractJobWithAI(rawText: string, fallbackTitle?: string): Promise<ExtractedJob | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY manquante dans l\'environnement.');
  }

  // Modèle configurable (défaut : deepseek/deepseek-chat)
  const model = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

  const systemPrompt = `Tu es un expert d'extraction d'offres d'emploi au Mali.
Tu dois analyser le texte fourni et retourner STRICTEMENT un objet JSON (sans balises markdown supplémentaires si possible) avec cette structure :
{
  "title": "Titre du poste exact (ex: Comptable, Développeur Web)",
  "company": "Nom de l'entreprise ou organisme",
  "location": "Ville ou région au Mali (ex: Bamako, Ségou, Mopti)",
  "contractType": "CDI" | "CDD" | "Stage" | "Intérim" | "Apprentissage" | "Autre",
  "category": "Secteur d'activité (ex: Informatique, Santé, Finance, Commercial)",
  "domain": "Domaine optionnel ou null",
  "salary": "Salaire mentionné ou null",
  "deadline": "Date limite de candidature mentionnée ou null",
  "publishedDate": "Date de publication YYYY-MM-DD ou null",
  "excerpt": "Court résumé accrocheur en 1 à 2 phrases max",
  "howToApply": "Instructions précises pour postuler (email, lien, adresse physique) ou null",
  "requirements": ["Critère 1", "Critère 2", "Critère 3"]
}`;

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
        temperature: 0.1
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

    const parsed: ExtractedJob = JSON.parse(content);
    if (!parsed.title && fallbackTitle) {
      parsed.title = fallbackTitle;
    }
    return parsed;
  } catch (err) {
    console.error('[AI] Erreur de parsing LLM:', err);
    return null;
  }
}
