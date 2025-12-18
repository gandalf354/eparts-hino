#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

mkdir -p public/uploads

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose is not installed"
  exit 1
fi

export VITE_API_URL="${VITE_API_URL:-http://localhost:3300}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:3200,http://localhost:5173,http://localhost:5174}"

ACTION="${1:-deploy}"
case "$ACTION" in
  deploy)
    # Ensure uploads dir exists (supports external path via UPLOADS_DIR)
    mkdir -p "${UPLOADS_DIR:-public/uploads}"
    $COMPOSE build
    $COMPOSE up -d --remove-orphans
    ;;
  rebuild)
    # Ensure uploads dir exists (supports external path via UPLOADS_DIR)
    mkdir -p "${UPLOADS_DIR:-public/uploads}"
    $COMPOSE down --remove-orphans --rmi local || true
    $COMPOSE build --no-cache
    $COMPOSE up -d --force-recreate --remove-orphans
    ;;
  restart)
    $COMPOSE up -d --force-recreate
    ;;
  down|stop)
    $COMPOSE down
    ;;
  logs)
    $COMPOSE logs -f --tail=200
    ;;
  status)
    $COMPOSE ps
    ;;
  *)
    echo "Usage: $0 [deploy|rebuild|restart|down|stop|logs|status]"
    exit 1
    ;;
esac
