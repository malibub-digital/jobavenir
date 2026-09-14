import fs from 'fs';
import path from 'path';
import { findCategory, CATEGORIES, normalizeSubCategoryId } from '../config/categories';

const CATEGORIES_DIR = path.resolve(process.cwd(), 'public/images/categories');
const DEFAULT_IMAGE_PATH = '/images/categories/default.webp';

/**
 * Retourne le chemin web absolu/relatif d'une image de fond pour une catégorie et optionnellement une sous-catégorie.
 * 
 * Fonctionnement hiérarchique avec fallback intelligent :
 * 1. Détecte la catégorie (ex: "informatique")
 * 2. Si une sous-catégorie est fournie, cherche dans `public/images/categories/[catId]/[subCatId]/`
 * 3. Si des images y sont présentes, en sélectionne une (déterministe via seed si fourni)
 * 4. Sinon (repli niveau 2), cherche dans le dossier parent `public/images/categories/[catId]/`
 * 5. Sinon (repli niveau 3), renvoie l'image par défaut `default.webp`
 * 
 * @param categoryIdOrLabel ID (ex: "informatique") ou libellé (ex: "Informatique & Numérique")
 * @param subCategory Libellé de la sous-catégorie (ex: "Développement Web & Mobile") ou seed si 2ème arg
 * @param seed Optionnel : clé de hachage (ex: slug ou ID de l'offre) pour une sélection déterministe
 */
export function getCategoryImage(
  categoryIdOrLabel?: string | null,
  subCategoryOrSeed?: string | null,
  seedParam?: string | null
): string {
  if (!categoryIdOrLabel) {
    return DEFAULT_IMAGE_PATH;
  }

  // Gestion souple de la signature : getCategoryImage(category, seed) OU getCategoryImage(category, subCategory, seed)
  let subCategory: string | null = null;
  let seed: string | null = null;

  if (seedParam !== undefined && seedParam !== null) {
    subCategory = subCategoryOrSeed || null;
    seed = seedParam;
  } else if (subCategoryOrSeed) {
    // Si seulement 2 arguments sont passés :
    // On vérifie si le 2ème argument ressemble à une sous-catégorie ou plutôt à un slug
    const cat = findCategory(categoryIdOrLabel);
    const isSub = cat?.subCategories.some(s => 
      s.toLowerCase() === subCategoryOrSeed.toLowerCase() || 
      normalizeSubCategoryId(s) === normalizeSubCategoryId(subCategoryOrSeed)
    );

    if (isSub) {
      subCategory = subCategoryOrSeed;
    } else {
      seed = subCategoryOrSeed;
    }
  }

  const cat = findCategory(categoryIdOrLabel);
  const catId = cat ? cat.id : categoryIdOrLabel.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  // 1. TENTATIVE AU NIVEAU DE LA SOUS-CATÉGORIE
  if (subCategory) {
    const subCatId = normalizeSubCategoryId(subCategory);
    const subTargetDir = path.join(CATEGORIES_DIR, catId, subCatId);

    try {
      if (fs.existsSync(subTargetDir)) {
        const subFiles = fs.readdirSync(subTargetDir).filter(f => 
          /\.(webp|png|jpg|jpeg)$/i.test(f)
        );

        if (subFiles.length > 0) {
          subFiles.sort();
          const index = pickIndex(subFiles.length, seed);
          return `/images/categories/${catId}/${subCatId}/${subFiles[index]}`;
        }
      }
    } catch (err) {
      console.warn(`[ImageBank] Erreur sous-catégorie ${catId}/${subCatId}:`, err);
    }
  }

  // 2. TENTATIVE AU NIVEAU DE LA MACRO-CATÉGORIE (REPLI 1)
  const targetDir = path.join(CATEGORIES_DIR, catId);

  try {
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir).filter(f => {
        const fullPath = path.join(targetDir, f);
        return fs.statSync(fullPath).isFile() && /\.(webp|png|jpg|jpeg)$/i.test(f);
      });

      if (files.length > 0) {
        files.sort();
        const index = pickIndex(files.length, seed);
        return `/images/categories/${catId}/${files[index]}`;
      }
    }
  } catch (err) {
    console.warn(`[ImageBank] Erreur macro-catégorie ${catId}:`, err);
  }

  // 3. REPLI GLOBAL
  return DEFAULT_IMAGE_PATH;
}

/**
 * Calcule l'index sélectionné à partir d'un seed ou aléatoirement
 */
function pickIndex(length: number, seed?: string | null): number {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % length;
  }
  return Math.floor(Math.random() * length);
}


/**
 * Récupère le chemin disque absolu d'une image pour manipulation serveur (ex: Sharp)
 */
export function getAbsoluteImagePath(webPath: string): string {
  const cleanPath = webPath.startsWith('/') ? webPath.slice(1) : webPath;
  return path.resolve(process.cwd(), 'public', cleanPath);
}
