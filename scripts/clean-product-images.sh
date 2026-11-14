#!/usr/bin/env bash
# scripts/clean-product-images.sh
# Gives every shop product a clean white-background packshot. For each
# catalogue product whose photo still comes from Open Food Facts, it downloads
# the full-size photo, cleans it with clean-product-image.swift (Apple Vision
# subject lifting, centred on white), uploads it to the website bucket under
# /products/<barcode>.jpg and points the catalogue at it.
#
# Run after adding products in Admin → Products:
#   bash scripts/clean-product-images.sh
# Then look over the results at https://www.shuddhaahar.shop — a photo where
# the product is held in a hand, or cut off at the edge, can lift the wrong
# thing; replace those by uploading a better photo with the same barcode.
#
# Needs: macOS 14+, Xcode command-line tools, AWS CLI signed in to the prod account.

set -euo pipefail

CATALOG_URL="https://v36cyuprlc.execute-api.eu-west-2.amazonaws.com"
BUCKET="shuddhaahar-admin-195275671852"
TABLE="CatalogProduct-shuddhaahar-prod"
SITE="https://www.shuddhaahar.shop"
REGION="eu-west-2"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

swiftc -O "$SCRIPT_DIR/clean-product-image.swift" -o "$WORK/clean-product-image"

curl -sf "$CATALOG_URL" -o "$WORK/catalog.json"
node -e '
  const d = require(process.argv[1]);
  for (const p of d.products) {
    if (!p.image || p.image.startsWith(process.argv[2] + "/products/")) continue;
    console.log(p.barcode + " " + p.image.replace(/\.(400|200|100)\.jpg$/, ".full.jpg"));
  }' "$WORK/catalog.json" "$SITE" > "$WORK/todo.txt"

if [ ! -s "$WORK/todo.txt" ]; then
  echo "All product photos are already cleaned."
  exit 0
fi

done_count=0
while read -r barcode url; do
  if ! curl -sf -m 30 -A "ShuddhAaharShop/1.0 (catalogue images)" -o "$WORK/$barcode.raw" "$url"; then
    echo "skip $barcode: could not download photo"; continue
  fi
  status=0
  "$WORK/clean-product-image" "$WORK/$barcode.raw" "$WORK/$barcode.jpg" 1000 || status=$?
  if [ "$status" -eq 1 ]; then echo "skip $barcode: could not process photo"; continue; fi
  [ "$status" -eq 2 ] && echo "note $barcode: no clear product found — fitted the whole photo on white"

  aws s3 cp "$WORK/$barcode.jpg" "s3://$BUCKET/products/$barcode.jpg" \
    --content-type image/jpeg --cache-control "public, max-age=86400" --only-show-errors
  aws dynamodb update-item --region "$REGION" --table-name "$TABLE" \
    --key "{\"barcode\":{\"S\":\"$barcode\"}}" \
    --update-expression "SET image = :i, updatedAt = :u" \
    --condition-expression "attribute_exists(barcode)" \
    --expression-attribute-values "{\":i\":{\"S\":\"$SITE/products/$barcode.jpg\"},\":u\":{\"S\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"
  echo "cleaned $barcode"
  done_count=$((done_count + 1))
  sleep 0.3
done < "$WORK/todo.txt"

echo "Done — cleaned $done_count photo(s)."
