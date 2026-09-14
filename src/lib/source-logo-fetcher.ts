import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SOURCES_DIR = path.resolve(process.cwd(), 'public/images/sources');
const FALLBACKS_DIR = path.join(SOURCES_DIR, 'fallbacks');

// Palette sobre et élégante pour les logos de repli
const FALLBACK_PALETTE = [
  '#0f172a', // Slate 900
  '#1e293b', // Slate 800
  '#1c1917', // Stone 900
  '#292524', // Stone 800
  '#134e4a', // Teal 900 (Émeraude discret)
  '#1e3a8a', // Blue 900 (Navy profond)
  '#312e81', // Indigo 900
  '#431407', // Warm Bronze / Terre
  '#701a75', // Prune discret
  '#365314', // Olive profond
];

/**
 * Nettoie une chaîne pour injection XML / SVG
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Détermine 1 ou 2 initiales épurées pour un nom d'annonceur / organisme
 */
export function getCompanyInitials(name: string): string {
  if (!name) return 'JA';

  // 1. Détection de sigle entre parenthèses, ex: "Agence pour la Promotion... (APEJ)" -> "AP"
  const parenMatch = name.match(/\(([A-Z0-9]{2,6})\)/i);
  if (parenMatch) {
    return parenMatch[1].slice(0, 2).toUpperCase();
  }

  // 2. Détection de sigle en début de nom, ex: "APEJ - Agence...", "CMSS - Caisse..."
  const prefixMatch = name.match(/^([A-Z0-9]{2,6})\s*[-–:]/);
  if (prefixMatch) {
    return prefixMatch[1].slice(0, 2).toUpperCase();
  }

  // 3. Mots clés ignorés pour l'extraction
  const stopwords = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'l', 'd', 'et', 'au', 'aux', 'pour', 'en']);
  const words = name
    .replace(/[^a-zA-Z0-9À-ÿ\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0 && !stopwords.has(w.toLowerCase()));

  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Sélectionne une couleur sobre et déterministe basée sur le nom
 */
export function getDeterministicColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % FALLBACK_PALETTE.length;
  return FALLBACK_PALETTE[index];
}

/**
 * Génère un logo de repli carré (200x200) avec initiales et fond uni sobre
 */
export async function generateFallbackLogo(sourceId: string, name: string): Promise<string> {
  if (!fs.existsSync(FALLBACKS_DIR)) {
    fs.mkdirSync(FALLBACKS_DIR, { recursive: true });
  }

  const fileName = `${sourceId.toLowerCase()}.png`;
  const filePath = path.join(FALLBACKS_DIR, fileName);
  const publicWebPath = `/images/sources/fallbacks/${fileName}`;

  const initials = getCompanyInitials(name);
  const bgColor = getDeterministicColor(name);

  // SVG carré avec coins légèrement adoucis et typographie sans empattement
  const svg = `
  <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" rx="24" fill="${bgColor}" />
    <circle cx="100" cy="100" r="82" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2" />
    <text 
      x="100" 
      y="118" 
      font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
      font-size="72" 
      font-weight="800" 
      letter-spacing="2"
      fill="#ffffff" 
      text-anchor="middle"
    >${escapeXml(initials)}</text>
  </svg>
  `;

  await sharp(Buffer.from(svg))
    .png({ quality: 90 })
    .toFile(filePath);

  return publicWebPath;
}

/**
 * Tente d'extraire l'URL du logo officiel depuis l'URL d'un site
 */
export async function discoverLogoUrl(websiteUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(websiteUrl);
    const domain = parsed.hostname;

    // 1. Tentative de fetch de la page d'accueil pour trouver apple-touch-icon ou og:image
    const res = await fetch(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(7000)
    });

    if (res.ok) {
      const html = await res.text();

      // a. Apple touch icon (meilleure qualité souvent 180x180)
      const touchIconMatch = html.match(/<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']+)["']/i) ||
                             html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon(?:-precomposed)?["']/i);
      if (touchIconMatch && touchIconMatch[1]) {
        return new URL(touchIconMatch[1], websiteUrl).toString();
      }

      // b. Logo WordPress spécifique ou classe custom-logo
      const wpLogoMatch = html.match(/<img[^>]+class=["'][^"']*custom-logo[^"']*["'][^>]+src=["']([^"']+)["']/i);
      if (wpLogoMatch && wpLogoMatch[1]) {
        return new URL(wpLogoMatch[1], websiteUrl).toString();
      }

      // c. Favicon standard ou icône PNG
      const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i) ||
                        html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i);
      if (iconMatch && iconMatch[1] && !iconMatch[1].endsWith('.ico')) {
        return new URL(iconMatch[1], websiteUrl).toString();
      }
    }

    // 2. Services de repli en ligne pour favicon haute résolution
    // Google S2 favicon service (taille 128px)
    const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const checkGoogle = await fetch(googleFaviconUrl, { signal: AbortSignal.timeout(5000) });
    if (checkGoogle.ok) {
      const buf = await checkGoogle.arrayBuffer();
      // Google renvoie un globe par défaut de ~1000 octets si aucun logo n'est trouvé
      if (buf.byteLength > 1200) {
        return googleFaviconUrl;
      }
    }

    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Télécharge, nettoie et sauvegarde le logo officiel en PNG avec fond transparent
 */
export async function downloadAndProcessLogo(sourceId: string, logoRemoteUrl: string): Promise<string | null> {
  try {
    if (!fs.existsSync(SOURCES_DIR)) {
      fs.mkdirSync(SOURCES_DIR, { recursive: true });
    }

    const fileName = `${sourceId.toLowerCase()}.png`;
    const filePath = path.join(SOURCES_DIR, fileName);
    const publicWebPath = `/images/sources/${fileName}`;

    const res = await fetch(logoRemoteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());

    // Vérification et conversion Sharp en PNG carré transparent
    await sharp(buffer)
      .resize(200, 200, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ quality: 90 })
      .toFile(filePath);

    return publicWebPath;
  } catch (err) {
    console.warn(`[LogoFetcher] Impossible de traiter le logo pour ${sourceId} (${logoRemoteUrl}):`, (err as any)?.message);
    return null;
  }
}

/**
 * Traite complètement une source : recherche en ligne -> si absent génère repli -> retourne chemin web
 */
export async function resolveSourceLogo(source: { id: string; name: string; url: string }): Promise<string> {
  const { id, name, url } = source;

  // Si URL valide, tentative de détection web
  if (url && url.startsWith('http')) {
    const discoveredUrl = await discoverLogoUrl(url);
    if (discoveredUrl) {
      const processed = await downloadAndProcessLogo(id, discoveredUrl);
      if (processed) {
        return processed;
      }
    }
  }

  // En cas d'échec ou d'absence de logo en ligne : logo de repli
  return await generateFallbackLogo(id, name);
}

/**
 * Récupère le logo d'une opportunité à partir de son sourceId (si connu) ou de son nom d'entreprise
 */
export async function getCompanyOrSourceLogo(options: {
  sourceId?: string | null;
  company?: string | null;
  originalSource?: string | null;
}): Promise<string> {
  const { sourceId, company, originalSource } = options;

  // 1. Si un sourceId est fourni (ex: SRC_001)
  if (sourceId) {
    const cleanId = sourceId.toLowerCase();
    const officialPath = path.join(SOURCES_DIR, `${cleanId}.png`);
    if (fs.existsSync(officialPath)) {
      return `/images/sources/${cleanId}.png`;
    }
    const fallbackPath = path.join(FALLBACKS_DIR, `${cleanId}.png`);
    if (fs.existsSync(fallbackPath)) {
      return `/images/sources/fallbacks/${cleanId}.png`;
    }
  }

  // 2. Si un nom d'entreprise est fourni, générer/utiliser un logo déterministe
  const identifier = company || originalSource || 'JobAvenir';
  const slugId = 'comp_' + identifier.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  const existingFallback = path.join(FALLBACKS_DIR, `${slugId}.png`);
  if (fs.existsSync(existingFallback)) {
    return `/images/sources/fallbacks/${slugId}.png`;
  }

  return await generateFallbackLogo(slugId, identifier);
}
