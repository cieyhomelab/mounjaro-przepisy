#!/usr/bin/env bash
# Builds src/shared/nutrition/ingredients.pl.json from the mapping file
# (src/shared/nutrition/ingredients.map.json) and USDA FoodData Central, SR Legacy (CSV):
#   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
# Usage: scripts/build-nutrition-data.sh <directory with the unpacked CSV files>
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ "$#" -ne 1 ] || [ ! -f "$1/food_nutrient.csv" ]; then
  echo "Usage: $0 <directory with food.csv and food_nutrient.csv from FoodData Central SR Legacy>" >&2
  exit 2
fi
DATA_DIR="$(cd "$1" && pwd)"

docker run --rm --init \
  --user "$(id -u):$(id -g)" \
  -v "$ROOT_DIR":/app -v "$DATA_DIR":/fdc:ro -w /app \
  node:24-bookworm-slim node scripts/nutrition/build.ts /fdc
