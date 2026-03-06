#!/usr/bin/env bash
set -euo pipefail

# Only run for Vercel preview deployments
if [ "${VERCEL_ENV:-}" != "preview" ]; then
  echo "Not a preview deployment (VERCEL_ENV=${VERCEL_ENV:-unset}), skipping ephemeral app setup."
  exit 0
fi

SHORT_SHA="${VERCEL_GIT_COMMIT_SHA:0:7}"
APP_TITLE="inkdot-preview-${SHORT_SHA}"

echo "Creating ephemeral Instant app: ${APP_TITLE}"
INIT_OUTPUT=$(npx instant-cli init-without-files --title "$APP_TITLE" --temp)
echo "$INIT_OUTPUT"

# Parse JSON output to extract appId and adminToken
eval "$(node -e "
  const out = JSON.parse(process.argv[1]);
  console.log('APP_ID=' + out.appId);
  console.log('ADMIN_TOKEN=' + out.adminToken);
" "$INIT_OUTPUT")"

if [ -z "${APP_ID:-}" ] || [ -z "${ADMIN_TOKEN:-}" ]; then
  echo "Failed to extract appId/adminToken from init output"
  exit 1
fi

echo "Ephemeral app created: ${APP_ID}"

# Write .env file for instant-cli and .env.local for Next.js build
cat > .env <<EOF
INSTANT_APP_ID=${APP_ID}
INSTANT_APP_ADMIN_TOKEN=${ADMIN_TOKEN}
EOF

cat > .env.local <<EOF
NEXT_PUBLIC_INSTANT_APP_ID=${APP_ID}
INSTANT_APP_ADMIN_TOKEN=${ADMIN_TOKEN}
EOF

# Push schema and permissions to the ephemeral app
echo "Pushing schema and permissions..."
npx instant-cli push --yes --env .env

echo "Preview DB setup complete."
