import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { findCategory } from '../config/categories';
import { getCategoryImage, getAbsoluteImagePath } from './image-bank';

export interface OgImageOptions {
  title: string;
  company?: string | null;
  category?: string | null;
  subCategory?: string | null;
  location?: string | null;
  opportunityType?: string | null;
  slug: string;
}

const OPPORTUNITY_LABELS: Record<string, string> = {
  JOB: 'OFFRE D\'EMPLOI',
  STAGE: 'STAGE PROFESSIONNEL',
  TRAINING: 'FORMATION PROFESSIONNELLE',
  PROJECT_CALL: 'APPEL À PROJETS / SUBVENTION',
  ANNOUNCEMENT: 'VEILLE & OPPORTUNITÉ'
};

/**
 * Nettoie une chaîne pour l'insérer en toute sécurité dans un template XML / SVG
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
 * Découpe un titre long en lignes pour un rendu SVG propre (wrap texte)
 */
function wrapText(text: string, maxCharsPerLine: number = 38, maxLines: number = 3): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
      if (lines.length === maxLines - 1) break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // Si le texte est plus long que le nombre max de lignes, ajouter '...'
  if (lines.length === maxLines && words.length > 0) {
    const joined = lines.join(' ');
    if (joined.length < text.trim().length) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/[\s,.;]+$/, '') + '...';
    }
  }

  return lines;
}

/**
 * Génère une image OpenGraph 1200x630 optimisée au format WebP
 * 
 * Composition visuelle :
 * 1. Image de fond adaptée à la catégorie (floutée/assombrie pour contraste maximal)
 * 2. Overlay dégradé sombre en bas et à gauche
 * 3. Badge "Type d'opportunité" (CDI, Stage, Appel à projets, etc.)
 * 4. Titre de l'offre grand format ultra lisible
 * 5. Métadonnées (Entreprise / Institution, Localisation, Catégorie)
 * 6. Branding discret et premium JobAvenir
 * 
 * @returns Chemin web relatif de l'image générée (ex: `/images/og/mon-slug.webp`)
 */
export async function generateJobOgImage(options: OgImageOptions): Promise<string> {
  const { title, company, category, location, opportunityType, slug } = options;

  const ogOutputDir = path.resolve(process.cwd(), 'public/images/og');
  if (!fs.existsSync(ogOutputDir)) {
    fs.mkdirSync(ogOutputDir, { recursive: true });
  }

  const outputFileName = `${slug}.webp`;
  const outputFilePath = path.join(ogOutputDir, outputFileName);
  const publicUrl = `/images/og/${outputFileName}`;

  // 1. Détermination de l'image de fond et de la couleur d'accent
  const backgroundWebPath = getCategoryImage(category, slug);
  const backgroundDiskPath = getAbsoluteImagePath(backgroundWebPath);

  const categoryConfig = findCategory(category || '');
  const accentColor = categoryConfig?.color || '#2563eb';
  const categoryLabel = categoryConfig?.label || (category || 'Opportunité');
  const typeLabel = OPPORTUNITY_LABELS[opportunityType || 'JOB'] || 'OPPORTUNITÉ';
  const locationLabel = location || 'Mali';
  const companyLabel = company || 'JobAvenir Partenaire';

  // 2. Découpage du titre
  const titleLines = wrapText(title, 36, 3);
  const titleSvgLines = titleLines.map((line, index) => {
    const yPos = 270 + (index * 56);
    return `<text x="80" y="${yPos}" font-family="system-ui, -apple-system, sans-serif" font-size="44" font-weight="800" fill="#ffffff" letter-spacing="-0.5">${escapeXml(line)}</text>`;
  }).join('\n');

  // 3. Construction du calque vectoriel SVG
  const svgOverlay = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgDarkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#090d16" stop-opacity="0.70" />
        <stop offset="50%" stop-color="#090d16" stop-opacity="0.88" />
        <stop offset="100%" stop-color="#06090e" stop-opacity="0.98" />
      </linearGradient>

      <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${accentColor}" />
        <stop offset="100%" stop-color="#3b82f6" />
      </linearGradient>

      <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000" flood-opacity="0.6" />
      </filter>
    </defs>

    <!-- Fond assombrissant dégradé -->
    <rect width="1200" height="630" fill="url(#bgDarkGrad)" />

    <!-- Ligne de marque supérieure discrète -->
    <rect x="0" y="0" width="1200" height="6" fill="url(#accentGrad)" />

    <!-- Badge Catégorie & Type d'opportunité -->
    <g transform="translate(80, 80)">
      <rect x="0" y="0" width="${typeLabel.length * 11 + 36}" height="38" rx="8" fill="${accentColor}" />
      <text x="${(typeLabel.length * 11 + 36) / 2}" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1.2">${escapeXml(typeLabel)}</text>

      <rect x="${typeLabel.length * 11 + 52}" y="0" width="${categoryLabel.length * 9.5 + 32}" height="38" rx="8" fill="#1e293b" fill-opacity="0.9" stroke="#334155" stroke-width="1.5" />
      <text x="${typeLabel.length * 11 + 52 + (categoryLabel.length * 9.5 + 32) / 2}" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="#94a3b8" text-anchor="middle">${escapeXml(categoryLabel)}</text>
    </g>

    <!-- Titre de l'offre -->
    ${titleSvgLines}

    <!-- Barre de séparation fine -->
    <rect x="80" y="445" width="1040" height="1.5" fill="#334155" fill-opacity="0.6" />

    <!-- Métadonnées : Entreprise, Lieu & Logo JobAvenir -->
    <g transform="translate(80, 480)">
      <!-- Entreprise -->
      <g>
        <circle cx="20" cy="20" r="18" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <path d="M14 16h12v11H14z M17 13h6v3h-6z" fill="#94a3b8" />
        <text x="50" y="16" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" fill="#64748b" text-transform="uppercase" letter-spacing="0.5">ORGANISME / ENTREPRISE</text>
        <text x="50" y="36" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#f8fafc">${escapeXml(companyLabel.slice(0, 32))}</text>
      </g>

      <!-- Lieu -->
      <g transform="translate(420, 0)">
        <circle cx="20" cy="20" r="18" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
        <path d="M20 12c-3.3 0-6 2.7-6 6 0 4.5 6 11 6 11s6-6.5 6-11c0-3.3-2.7-6-6-6zm0 8.5c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z" fill="#94a3b8" />
        <text x="50" y="16" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" fill="#64748b" text-transform="uppercase" letter-spacing="0.5">LOCALISATION</text>
        <text x="50" y="36" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="700" fill="#f8fafc">${escapeXml(locationLabel.slice(0, 24))}</text>
      </g>

      <!-- Signature JobAvenir -->
      <g transform="translate(860, 2)">
        <rect x="0" y="0" width="180" height="42" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
        <circle cx="24" cy="21" r="9" fill="#16a34a" />
        <text x="44" y="26" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" fill="#ffffff" letter-spacing="0.5">JobAvenir<tspan fill="#16a34a">.ml</tspan></text>
      </g>
    </g>
  </svg>
  `;

  // 4. Composition Sharp
  try {
    const baseImage = sharp(backgroundDiskPath)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .modulate({ brightness: 0.85 });

    await baseImage
      .composite([
        {
          input: Buffer.from(svgOverlay),
          top: 0,
          left: 0
        }
      ])
      .webp({ quality: 88 })
      .toFile(outputFilePath);

    return publicUrl;
  } catch (err) {
    console.error(`[OgGenerator] Erreur lors de la composition pour ${slug}:`, err);
    return backgroundWebPath;
  }
}
