import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

/**
 * Initialise le schéma de la base de données si nécessaire
 */
export async function initDatabaseSchema() {
  if (!process.env.DATABASE_URL) {
    console.warn('[DB] Aucune DATABASE_URL fournie, schéma ignoré.');
    return;
  }
  const client = await pool.connect();
  try {
    const schemaPath = path.resolve(process.cwd(), '.dev/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      await client.query(sql);
      console.log('[DB] Schéma PostgreSQL initialisé avec succès.');
    }
  } catch (err) {
    console.error('[DB] Erreur lors de l\'initialisation du schéma:', err);
  } finally {
    client.release();
  }
}
