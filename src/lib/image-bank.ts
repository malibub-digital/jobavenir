import fs from 'fs';
import path from 'path';
import { findCategory, CATEGORIES } from '../config/categories';

const CATEGORIES_DIR = path.resolve(process.cwd(), 'public/images/categories');
const DEFAULT_IMAGE_PATH = '/images/categories/default.webp';

/**
 * Retourne le chemin web absolu/relatif d'une image de fond pour une catégorie donnée.
 * 
 * Fonctionnement dynamique :
 * 1. Détecte la catégorie via son ID ou son label
 * 2. Scanne le dossier `public/images/categories/[catId]/`
 * 3. S'il existe des fichiers .webp, .jpg ou .png, en sélectionne un (aléatoire ou index)
 * 4. Si aucune image spécifique n'existe, renvoie l'image par défaut `default.webp`
 * 
 * @param categoryIdOrLabel ID (ex: "informatique") ou libellé (ex: "Informatique & Numérique")
 * @param seed Optionnel : clé de hachage (ex: slug ou ID de l'offre) pour une sélection déterministe
 */
export function getCategoryImage(categoryIdOrLabel?: string | null, seed?: string): string {
  if (!categoryIdOrLabel) {
    return DEFAULT_IMAGE_PATH;
  }

  const cat = findCategory(categoryIdOrLabel);
  const catId = cat ? cat.id : categoryIdOrLabel.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
  const targetDir = path.join(CATEGORIES_DIR, catId);

  try {
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir).filter(f => 
        /\.(webp|png|jpg|jpeg)$/i.test(f)
      );

      if (files.length > 0) {
        // Tri alphabétique pour cohérence
        files.sort();

        let index = 0;
        if (seed) {
          // Hachage simple pour un choix déterministe (toujours la même image pour la même offre)
          let hash = 0;
          for (let i = 0; i < seed.length; i++) {
            hash = (hash << 5) - hash + seed.charCodeAt(i);
            hash |= 0;
          }
          index = Math.abs(hash) % files.length;
        } else {
          index = Math.floor(Math.random() * files.length);
        }

        return `/images/categories/${catId}/${files[index]}`;
      }
    }
  } catch (err) {
    console.warn(`[ImageBank] Erreur lors de la lecture des images pour la catégorie ${catId}:`, err);
  }

  return DEFAULT_IMAGE_PATH;
}

/**
 * Récupère le chemin disque absolu d'une image pour manipulation serveur (ex: Sharp)
 */
export function getAbsoluteImagePath(webPath: string): string {
  const cleanPath = webPath.startsWith('/') ? webPath.slice(1) : webPath;
  return path.resolve(process.cwd(), 'public', cleanPath);
}
