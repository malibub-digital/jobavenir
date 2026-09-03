import cron from 'node-cron';
import { runScraper } from './scrape';

console.log('[Cron] Initialisation du planificateur de scraping JobAvenir...');

// Exécution immédiate au démarrage
runScraper()
  .then(() => console.log('[Cron] Premier passage de scraping terminé avec succès.'))
  .catch(err => console.error('[Cron] Erreur lors du premier passage:', err));

// Planification récurrente : toutes les 6 heures (0 */6 * * *)
// Modifiable via CRON_SCHEDULE dans l'environnement
const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *';

cron.schedule(schedule, async () => {
  console.log(`[Cron] Déclenchement périodique (${schedule}) : actualisation des offres...`);
  try {
    await runScraper();
    console.log('[Cron] Cycle de scraping terminé.');
  } catch (err) {
    console.error('[Cron] Erreur durant le cycle de scraping:', err);
  }
});

console.log(`[Cron] Planificateur actif avec l'expression : "${schedule}"`);
