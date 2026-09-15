import dotenv from 'dotenv';
dotenv.config();

import { initDatabaseSchema, pool } from '../src/lib/db';

async function main() {
  console.log('--- Initialisation / Migration du schéma de base de données ---');
  await initDatabaseSchema();
  console.log('--- Schéma vérifié avec succès ---');
  await pool.end();
}

main().catch(err => {
  console.error('Erreur lors de l\'initialisation de la DB:', err);
  process.exit(1);
});
