#!/bin/sh
set -e
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Provide it via env or .env.production." >&2
  exit 1
fi
npm run db:migrate
npm start 