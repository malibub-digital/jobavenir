#!/bin/sh
set -e

echo "[Entrypoint] Lancement du cron de scraping en tâche de fond..."
npm run cron &

echo "[Entrypoint] Démarrage du serveur Astro Node sur le port ${PORT:-3000}..."
exec node dist/server/entry.mjs
