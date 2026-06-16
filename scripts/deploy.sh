#!/usr/bin/env bash
set -e

DOMAIN="onclockph.com"
WILDCARD="*.onclockph.com"

echo "Deploying to Vercel..."
DEPLOY_URL=$(npx vercel --prod 2>&1 | tee /dev/stderr | grep -oE 'ph-hrpayroll-[a-z0-9]+-jepoyg0225s-projects\.vercel\.app' | head -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "Could not parse deployment URL — skipping alias reassignment"
  exit 0
fi

echo ""
echo "Latest deployment: $DEPLOY_URL"
echo "Reassigning aliases..."

npx vercel alias rm "$WILDCARD" --yes 2>/dev/null || true
npx vercel alias set "$DEPLOY_URL" "$DOMAIN"
npx vercel alias set "$DEPLOY_URL" "$WILDCARD"

echo ""
echo "Done. $WILDCARD → $DEPLOY_URL"
