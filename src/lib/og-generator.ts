import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { findCategory } from '../config/categories';
import { getCategoryImage, getAbsoluteImagePath } from './image-bank';
import { getCompanyOrSourceLogo } from './source-logo-fetcher';

export interface OgImageOptions {
  title: string;
  company?: string | null;
  category?: string | null;
  subCategory?: string | null;
  location?: string | null;
  opportunityType?: string | null;
  slug: string;
  sourceId?: string | null;
  originalSource?: string | null;
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
    const lastLine = lines[lines.length - 1];
    if (!lastLine.endsWith('...')) {
      lines[lines.length - 1] = lastLine.slice(0, maxCharsPerLine - 3) + '...';
    }
  }

  return lines;
}

/**
 * Génère l'image OpenGraph pour une opportunité
 * Respecte les sections 4 et 5 de la spécification visuelle :
 * - Image de catégorie haute résolution (1200x630)
 * - Encart blanc à angles arrondis pour le logo (officiel ou repli) en bas à gauche
 * - Métadonnées soignées (Entreprise, Lieu, Type d'opportunité)
 */
export async function generateJobOgImage(options: OgImageOptions): Promise<string> {
  const { title, company, category, location, opportunityType, slug, sourceId, originalSource } = options;

  const ogOutputDir = path.resolve(process.cwd(), 'public/images/og');
  if (!fs.existsSync(ogOutputDir)) {
    fs.mkdirSync(ogOutputDir, { recursive: true });
  }

  const outputFileName = `${slug}.webp`;
  const outputFilePath = path.join(ogOutputDir, outputFileName);
  const publicUrl = `/images/og/${outputFileName}`;

  // 1. Détermination de l'image de fond et de la couleur d'accent
  const backgroundWebPath = getCategoryImage(category, options.subCategory, slug);
  const backgroundDiskPath = getAbsoluteImagePath(backgroundWebPath);

  const categoryConfig = findCategory(category || '');
  const accentColor = categoryConfig?.color || '#2563eb';
  const categoryLabel = categoryConfig?.label || (category || 'Opportunité');
  const typeLabel = OPPORTUNITY_LABELS[opportunityType || 'JOB'] || 'OPPORTUNITÉ';
  const locationLabel = location || 'Mali';
  const companyLabel = company || originalSource || 'JobAvenir Partenaire';

  // Résolution du logo de l'organisme/entreprise
  const logoWebPath = await getCompanyOrSourceLogo({
    sourceId,
    company,
    originalSource
  });
  const logoDiskPath = path.join(process.cwd(), 'public', logoWebPath.replace(/^\//, ''));

  // 2. Découpage du titre
  const titleLines = wrapText(title, 36, 3);
  const titleSvgLines = titleLines.map((line, index) => {
    const yPos = 260 + (index * 56);
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

      <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.4" />
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

    <!-- Encart blanc du logo (Section 5 Spec : 110x110 à x=80, y=475) -->
    <g transform="translate(80, 470)" filter="url(#logoShadow)">
      <rect x="0" y="0" width="100" height="100" rx="16" fill="#ffffff" stroke="#f1f5f9" stroke-width="2" />
    </g>

    <!-- Métadonnées à côté de l'encart logo : Entreprise, Lieu & Signature JobAvenir -->
    <g transform="translate(205, 480)">
      <!-- Entreprise -->
      <g>
        <text x="0" y="16" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#94a3b8" text-transform="uppercase" letter-spacing="0.5">ORGANISME / ENTREPRISE</text>
        <text x="0" y="42" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="800" fill="#f8fafc">${escapeXml(companyLabel.slice(0, 28))}</text>
      </g>

      <!-- Lieu -->
      <g transform="translate(340, 0)">
        <text x="0" y="16" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="700" fill="#94a3b8" text-transform="uppercase" letter-spacing="0.5">LOCALISATION</text>
        <text x="0" y="42" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="#f8fafc">📍 ${escapeXml(locationLabel.slice(0, 20))}</text>
      </g>

      <!-- Signature JobAvenir -->
      <g transform="translate(680, 2)">
        <rect x="0" y="0" width="235" height="46" rx="10" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" />
        <circle cx="28" cy="23" r="10" fill="#16a34a" />
        <text x="50" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="800" fill="#ffffff" letter-spacing="0.5">JobAvenir<tspan fill="#16a34a">.ml</tspan></text>
      </g>
    </g>
  </svg>
  `;

  // 4. Composition Sharp
  try {
    const baseImage = sharp(backgroundDiskPath)
      .resize(1200, 630, { fit: 'cover', position: 'center' })
      .modulate({ brightness: 0.85 });

    const compositeLayers: sharp.OverlayOptions[] = [
      {
        input: Buffer.from(svgOverlay),
        top: 0,
        left: 0
      }
    ];

    // Si le logo existe physiquement, le redimensionner et l'incruster dans l'encart blanc (x=80+12, y=470+12)
    if (fs.existsSync(logoDiskPath)) {
      const logoBuffer = await sharp(logoDiskPath)
        .resize(76, 76, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();

      compositeLayers.push({
        input: logoBuffer,
        top: 482,
        left: 92
      });
    }

    await baseImage
      .composite(compositeLayers)
      .webp({ quality: 88 })
      .toFile(outputFilePath);

    return publicUrl;
  } catch (err) {
    console.error(`[OgGenerator] Erreur lors de la composition pour ${slug}:`, err);
    return backgroundWebPath;
  }
}
