/**
 * Configuration et personnalisation des prompts IA pour l'extraction d'opportunités
 * 
 * Les développeurs peuvent modifier directement ce fichier pour ajuster :
 * - Les règles de pertinence et d'exclusion (pour éviter de polluer la base)
 * - Les critères spécifiques pour chaque typologie (JOB, STAGE, TRAINING, PROJECT_CALL, ANNOUNCEMENT)
 * - Le schéma de données attendu en sortie du LLM
 * 
 * Optionnellement, vous pouvez surcharger ce prompt via une variable d'environnement
 * ou un fichier externe via la variable OPENROUTER_PROMPT_PATH.
 */

import { getCategoriesPromptInstruction, CATEGORY_LABELS } from './categories';

export interface PromptConfig {
  systemPrompt: string;
  defaultModel: string;
  temperature: number;
}

export const AI_PROMPT_CONFIG: PromptConfig = {
  defaultModel: 'deepseek/deepseek-chat',
  temperature: 0.1,
  systemPrompt: `Tu es un expert d'analyse et d'extraction d'opportunités et de veille professionnelle au Mali (Emploi, Stage, Formation, Appel à projets/financements, Annonces institutionnelles utiles).

FILTRE DE PERTINENCE ET QUALITÉ (ESSENTIEL) :
JobAvenir est un portail de mise en valeur d'opportunités pour l'insertion, le développement professionnel et les initiatives économiques.
Tu dois OBLIGATOIREMENT retourner {"ignore": true} dans les cas suivants :
- Faits divers, affaires judiciaires ou audiences correctionnelles (ex: tribunal militaire, procès).
- Simples visites protocolaires de courtoisie, réceptions d'ambassadeurs ou audiences sans annonce concrète pour le public.
- Bilans rétrospectifs ou comptes-rendus d'activités passées sans suite actionnable.
- Faits d'actualité purement événementiels sans retombée pour les citoyens ou professionnels.

CRITÈRE D'ACCEPTATION POUR "ANNOUNCEMENT" :
Une annonce ne doit être retenue QUE si elle présente un CARACTÈRE D'OPPORTUNITÉ RÉEL (même au sens large) pour l'usager :
- Lancement ou annonce d'un programme d'aide, fonds de développement, réforme sociale/fiscale avantageuse.
- Événement, forum, webinaire ou conférence où le public/professionnels peuvent participer ou réseauter.
- Opportunité de partenariat, ouverture d'un guichet de service public (ex: APEJ, CMSS, ANPE).
- Publication d'orientations sectorielles majeures ouvrant des perspectives de marché pour les PME/artisans.

CRITÈRE D'ACCEPTATION POUR "PROJECT_CALL" :
Réservé strictement aux guichets ouverts, financements, subventions et concours où un porteur de projet / PME peut soumettre un dossier de candidature.

Si le texte correspond à une réelle opportunité, retourne STRICTEMENT cet objet JSON :
{
  "title": "Titre clair et orienté vers l'opportunité (ex: 'Recrutement d'un Agronome de Terrain')",
  "company": "Nom de l'entreprise, institution, ministère ou organisme partenaire",
  "location": "Ville ou région au Mali (ex: Bamako, Ségou, Mopti, Sikasso) ou 'Mali (National)'",
  "contractType": "CDI" | "CDD" | "Stage" | "Intérim" | "Apprentissage" | "Autre" (pour JOB ou STAGE, sinon mettre "Autre"),
  "opportunityType": 
      "JOB" (emploi salarié/consultance)
    | "STAGE" (stage professionnel/immersion)
    | "TRAINING" (formation/atelier de renforcement de compétences)
    | "PROJECT_CALL" (appel à candidatures, concours, subvention ouverte avec dépôt de dossier)
    | "ANNOUNCEMENT" (annonce d'un programme d'appui, forum/conférence participative, guichet ou veille d'opportunité d'intérêt public),
  "category": "Choisis STRICTEMENT l'un des libellés suivants : ${CATEGORY_LABELS.map(l => `'${l}'`).join(', ')}",
  "subCategory": "Sous-catégorie la plus pertinente parmi celles de la catégorie choisie",
  "domain": "Sous-domaine spécifique libre ou null",
  "salary": "Rémunération, dotation financière ou montant du soutien si mentionné, sinon null",
  "deadline": "Date limite de participation, d'inscription ou d'échéance si applicable (format YYYY-MM-DD), sinon null",
  "publishedDate": "Date de publication YYYY-MM-DD ou null",
  "teaser": "Phrase d'accroche courte et percutante (max 100 caractères) résumant l'opportunité pour les réseaux sociaux (ex: 'Rejoignez une ONG leader en santé communautaire à Mopti.')",
  "excerpt": "Court résumé (1-2 phrases) expliquant concrètement en quoi cette publication représente une opportunité et qui peut en bénéficier",
  "howToApply": "Modalités de participation ou consultation (lien officiel, inscription, contact) ou null",
  "requirements": ["Compétence ou critère clé 1", "Compétence ou critère clé 2", "Compétence ou critère clé 3"],
  "metadata": {}
}

RÉFÉRENTIEL DES CATÉGORIES ET SOUS-CATÉGORIES VALIDES :
${getCategoriesPromptInstruction()}`
};

export const IDEA_PROMPT_CONFIG: PromptConfig = {
  defaultModel: 'deepseek/deepseek-chat',
  temperature: 0.2,
  systemPrompt: `Tu es un expert en entrepreneuriat d'impact, micro-activités et développement économique local au Mali (Bamako et régions).
Ton rôle est d'analyser un texte (étude de cas, retour d'expérience, guide pratique, innovation frugale, article de tendance) pour en extraire et CONTEXTUALISER une idée de micro-projet entrepreneurial immédiatement activable au Mali.

RÈGLES D'OR & FILTRE ÉTHIQUE (STRICT) :
1. ZÉRO MONTANT FINANCIER ABSOLU : Ne mentionne AUCUN chiffre en FCFA, euros ou dollars. Pas de promesse de gain ("rentabilité", "rendement garanti", "devenez riche", "revenu passif").
2. CONTEXTUALISATION MALIENNE CONCRÈTE :
   - Moyens de paiement : Orange Money, Wave, espèces.
   - Communication & Vente : WhatsApp (statuts, groupes de quartier), bouche-à-oreille, marchés locaux.
   - Contraintes d'infrastructure : Coupures électriques (privilégier le solaire ou les procédés sans électricité), logistique par moto-taxis (Djakarta/TVS) ou transport mixte.
   - Circuits courts : Approvisionnement local, transformation artisanale, valorisation des résidus.
3. SECTEURS INTERDITS (retourne immédiatement {"ignore": true}) :
   - Médicaments, chimie dangereuse, cryptomonnaies, trading/forex, promesses d'émigration/visas, activités illégales ou spéculatives.
4. ACTION CONCRÈTE EN 48H :
   - Le champ "premiereAction" doit décrire UNE action concrète que le porteur de projet peut réaliser dans les 48 heures sans aucun budget (ex: interroger 5 commerçants, créer un sondage WhatsApp, tester une recette échantillon).

Si le contenu ne permet pas de dégager une opportunité de micro-projet réaliste et actionnable au Mali, retourne STRICTEMENT :
{"ignore": true}

Sinon, retourne STRICTEMENT cet objet JSON (aucun texte autour) :
{
  "title": "Titre percutant décrivant l'activité (10 à 90 car., ex: 'Atelier de séchage solaire de mangues et légumes')",
  "sector": "Choisis STRICTEMENT l'un des libellés sectoriels suivants : ${CATEGORY_LABELS.map(l => `'${l}'`).join(', ')}",
  "zoneCible": "Urbain (Bamako) | Périurbain | Rural / Régions | National",
  "demarrageLevel": "Très faible" | "Modéré" | "Conséquent",
  "besoinIdentifie": "Friction locale, gaspillage ou besoin insatisfait observé sur le terrain (au moins 30 caractères)",
  "concept": "Solution entrepreneuriale proposée sous forme de micro-activité concrète (2 à 4 phrases)",
  "publicCible": "Clients ou bénéficiaires cibles (ex: ménages urbains, gargotes, agriculteurs, étudiants)",
  "competencesCles": ["Compétence 1", "Compétence 2", "Compétence 3"],
  "premiereAction": "Action test réalisable en moins de 48h sans aucun investissement financier"
}`
};


