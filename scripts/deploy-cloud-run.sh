#!/usr/bin/env bash
# One-shot provisioning to Cloud Run: API + web, so anyone (a new UI designer,
# a judge) gets a real clickable URL, not a screenshot (#84, #97-followup).
#
# Reads API keys from the repo-root .env (never committed, never echoed) and
# forwards only the known set to the API service as runtime env vars via a
# temp file that is deleted immediately after use.
#
# Usage: scripts/deploy-cloud-run.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="africa-south1"       # Johannesburg: closest Cloud Run region to Lagos
PROJECT="$(gcloud config get-value project 2>/dev/null)"
API_SERVICE="monnify-studio-api"
WEB_SERVICE="monnify-studio-web"

if [ -z "$PROJECT" ]; then
  echo "No gcloud project set. Run: gcloud config set project <id>" >&2
  exit 1
fi

echo "==> Project: $PROJECT   Region: $REGION"

echo "==> Enabling required APIs (idempotent)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com --project "$PROJECT" --quiet

# ---- 1. Deploy the API -----------------------------------------------------
echo "==> Building env file for the API service (secrets stay out of the image)"
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT

{
  echo "studio_env: production"
  echo "allow_production_execution: \"false\""   # sandbox-only, always
  echo "cors_origins: \"*\""                       # tightened after web deploys, below
  echo "STUDIO_SEED_DEMO: \"1\""                  # boot seeds a demo business (#116)
} > "$ENV_FILE"

# Forward only known keys — never print values. A real exported env var wins
# (this is how CI hands us secrets, see .github/workflows/deploy.yml); local
# runs fall back to the repo-root .env. Kept UPPERCASE exactly as-is: the AI
# provider module reads os.getenv() with these exact literal names
# (case-sensitive), unlike the Settings/WhatsApp pydantic-settings fields
# below which match case-insensitively either way.
for key in CLAUDE_API_KEY ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_API_KEY \
           MONNIFY_API_KEY MONNIFY_SECRET_KEY MONNIFY_CONTRACT_CODE \
           EVOLUTION_API_URL EVOLUTION_API_KEY EVOLUTION_INSTANCE \
           ZEPTOMAIL_API_KEY ZEPTOMAIL_SENDER ZEPTOMAIL_REPLY_TO; do
  value="${!key:-}"
  if [ -z "$value" ] && [ -f "$ROOT/.env" ]; then
    value="$(grep -E "^${key}=" "$ROOT/.env" | head -1 | cut -d= -f2- || true)"
  fi
  if [ -n "$value" ]; then
    echo "${key}: \"${value}\"" >> "$ENV_FILE"
    echo "   forwarding ${key} (value hidden)"
  fi
done

echo "==> Deploying $API_SERVICE"
gcloud run deploy "$API_SERVICE" \
  --source "$ROOT/apps/api" \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --port 8080 \
  --env-vars-file "$ENV_FILE" \
  --min-instances 1 \
  --max-instances 1 \
  --quiet

rm -f "$ENV_FILE"
trap - EXIT

API_URL="$(gcloud run services describe "$API_SERVICE" --region "$REGION" \
  --project "$PROJECT" --format='value(status.url)')"
echo "==> API live at: $API_URL"

# ---- 2. Build + deploy the web app, API URL baked in -----------------------
WEB_IMAGE="gcr.io/${PROJECT}/${WEB_SERVICE}"
echo "==> Building $WEB_SERVICE with NEXT_PUBLIC_API_URL=$API_URL"
gcloud builds submit "$ROOT/apps/web" \
  --config "$ROOT/apps/web/cloudbuild.yaml" \
  --substitutions "_API_URL=${API_URL},_IMAGE=${WEB_IMAGE}" \
  --project "$PROJECT" \
  --quiet

echo "==> Deploying $WEB_SERVICE"
gcloud run deploy "$WEB_SERVICE" \
  --image "$WEB_IMAGE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --port 8080 \
  --quiet

WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region "$REGION" \
  --project "$PROJECT" --format='value(status.url)')"
echo "==> Web live at: $WEB_URL"

# ---- 3. Tighten API CORS to the real web origin -----------------------------
echo "==> Restricting API CORS to $WEB_URL"
gcloud run services update "$API_SERVICE" \
  --region "$REGION" \
  --project "$PROJECT" \
  --update-env-vars "cors_origins=${WEB_URL}" \
  --quiet

echo ""
echo "============================================================"
echo " Monnify Studio is live:"
echo "   Web (canvas + generated products): $WEB_URL"
echo "   API:                               $API_URL"
echo "============================================================"
