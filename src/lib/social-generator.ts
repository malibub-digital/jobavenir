// src/lib/social-generator.ts

export interface SocialItemData {
  title: string;
  company?: string;
  location?: string;
  contractType?: string;
  slug: string;
  deadline?: string | null;
  isIdea?: boolean;
}

export function calculateDefaultSocialPublishAt(baseDate?: string): string {
  const d = baseDate ? new Date(baseDate) : new Date();
  // Planification automatique par défaut : 1 heure après
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export function generateSocialTexts(item: SocialItemData): { whatsapp: string; telegram: string; tiktok: string } {
  const baseUrl = "https://job.malihub.digital";
  const targetUrl = item.isIdea 
    ? `${baseUrl}/idees/${item.slug}` 
    : `${baseUrl}/opportunites/${item.slug}`;

  const org = item.company || (item.isIdea ? "Idée d'entreprise locale" : "Organisme partenaire");
  const loc = item.location || "Bamako, Mali";
  const contract = item.contractType || (item.isIdea ? "Projet d'entreprise" : "Opportunité");
  const deadlineStr = item.deadline ? item.deadline : "Candidatures ouvertes";

  const whatsapp = `📢 *${item.title.trim()}*
🏢 ${org} • 📍 ${loc} • 📄 ${contract}

👉 Voir tous les détails et postuler :
${targetUrl}`;

  const telegram = `🚀 *${item.title.trim()}*

🏢 *Organisme :* ${org}
📍 *Lieu :* ${loc}
⏳ *Date limite :* ${deadlineStr}

🔗 *Consulter l'annonce complète :*
${targetUrl}

#EmploiMali #MaliJobs #Recrutement #Bamako #JobAvenir`;

  const tiktok = `🎬 Hook : "Une nouvelle opportunité vient d'ouvrir au Mali !"
📌 Poste / Projet : ${item.title.trim()}
🏢 Organisme : ${org}
📍 Lieu : ${loc}
💡 Date limite : ${deadlineStr}
👉 Lien complet dans la bio ou sur JobAvenir Mali !

#Mali #Bamako #JobAvenir #EmploiMali #Opportunites`;

  return { whatsapp, telegram, tiktok };
}
