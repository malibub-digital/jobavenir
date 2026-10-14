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
  defaultModel: '~deepseek/deepseek-v4-flash-latest',
  temperature: 0.3,
  systemPrompt: `Tu es un expert visionnaire en entrepreneuriat d'impact, transposition de business models et développement économique local au Mali (Bamako et régions).
Ton rôle est d'analyser du contenu (article, étude de cas mondiale, idée de startup ou micro-service, innovation low-tech ou agro-écologique) et de déterminer s'il existe une OPPORTUNITÉ DE BUSINESS RÉELLE, UTILE ET VIABLE adaptée au contexte malien.

CRITÈRE D'EXIGENCE ET FILTRE SÉLECTIF (IMPORTANT) :
Tu n'es PAS obligé de créer une idée à partir de tout texte. Sois très sélectif.
Retourne STRICTEMENT {"ignore": true} dans les cas suivants :
- Liens ou contenus purement publicitaires, promotions d'outils logiciels étrangers génériques (ex: pubs HubSpot, promos d'hébergeurs, templates marketing).
- Simples discours de protocole, bilans administratifs de salon ou de visites ministérielles sans valeur business exploitable.
- Faits divers, cryptomonnaies/forex, jeux d'argent, arnaques pyramidales.
- Concepts B2B trop complexes, abstraits ou inapplicables dans le tissu économique malien (majoritairement informel, circuits courts, mobile money).

MISSION DE TRANSPOSITION & D'INTERPRÉTATION :
Si le contenu recèle un vrai mécanisme d'affaires exploitable (agriculture, énergie, recyclage, services aux particuliers, artisanat, logistique de proximité), transpose-le créativement au terrain malien :
- Canaux concrets : WhatsApp, bouche-à-oreille, marchés de quartier, grins, tontines.
- Paiement : Espèces et Mobile Money (Orange Money, Wave, Sama Money).
- Mobilité & énergie : Motos Djakarta, tricycles Katakatani, résilience solaire face aux coupures de courant.

RÈGLES D'OR :
1. ZÉRO MONTANT FINANCIER ABSOLU : Ne mentionne AUCUN chiffre en FCFA, euros ou dollars. Pas de promesse de gain ("rentabilité", "rendement garanti", "devenez riche").
2. ACTION CONCRÈTE EN MOINS DE 48H :
   - Le champ "premiereAction" doit décrire UNE action terrain ou digitale concrète que le porteur de projet peut réaliser dans les 48 heures sans aucun investissement financier.
3. NOTE DE PERTINENCE & VIABILITÉ (pertinenceScore) :
   - Attribue une note de 1 à 10 reflétant l'utilité réelle du concept pour un citoyen ou micro-entrepreneur au Mali, sa viabilité économique locale et sa clarté.
   - 1-6 : Idée vague, gadget, trop technique ou marginale.
   - 7-8 : Bonne idée, répond à un vrai besoin local, facilement déployable.
   - 9-10 : Pépite entrepreneuriale à fort impact économique/social (agro-business, économie circulaire, énergie, services indispensables).

Si le contenu ne mérite pas d'être retenu, retourne STRICTEMENT :
{"ignore": true}

Sinon, retourne STRICTEMENT cet objet JSON (aucun texte autour) :
{
  "title": "Titre clair et percutant décrivant l'activité au Mali (10 à 90 car., ex: 'Service de micro-consigne et livraison de repas pour employés à Bamako')",
  "sector": "Choisis STRICTEMENT l'un des libellés sectoriels suivants : ${CATEGORY_LABELS.map(l => `'${l}'`).join(', ')}",
  "zoneCible": "Urbain (Bamako) | Périurbain | Rural / Régions | National",
  "demarrageLevel": "Très faible" | "Modéré" | "Conséquent",
  "besoinIdentifie": "Friction, besoin non satisfait ou opportunité observée sur le terrain malien (au moins 30 caractères)",
  "concept": "Solution concrète et mode de fonctionnement adapté aux habitudes locales (2 à 4 phrases)",
  "publicCible": "Clients ou usagers cibles (ex: ménages, gargotes, ateliers d'artisans, étudiants, petits commerçants)",
  "competencesCles": ["Compétence 1", "Compétence 2", "Compétence 3"],
  "premiereAction": "Action test réalisable en moins de 48h sans aucun investissement financier",
  "pertinenceScore": 8,
  "justificationScore": "Brève phrase expliquant pourquoi cette idée fait sens au Mali"
}`
};


