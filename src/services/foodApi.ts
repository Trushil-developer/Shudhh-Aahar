// Open Food Facts API - Free, no key required
// Now using production apiClient with retry, cache, logging, and accuracy scoring

import apiClient from '../utils/apiClient';
import cache, { TTL } from '../utils/cache';
import logger from '../utils/logger';
import perf from '../utils/performance';
import { scoreProductAccuracy, sanitiseProduct, validateNutrition, validateBarcode } from '../utils/accuracyEngine';
import errorReporter from '../utils/errorReporter';
import { AppError } from '../utils/AppError';

export interface Additive {
  code: string;
  name: string;
  riskLevel: 'safe' | 'caution' | 'avoid';
}

export interface UPFScore {
  group: number;
  label: string;
  description: string;
  color: string;
  isUPF: boolean;
}

export interface ProductData {
  barcode: string;
  name: string;
  brand: string;
  image: string;
  ingredients: string;
  ingredientsList: string[];
  allergens: string[];
  nutriments: Nutriments;
  nutriscore: string;
  quantity: string;
  categories: string;
  categoriesTags: string[];
  found: boolean;
  novaGroup: number;
  upfScore: UPFScore;
  additives: Additive[];
  vitamins: Record<string, number>;
  // True only when `found: false` was caused by a network/timeout/server
  // failure (catch block below) rather than a genuine "not in database"
  // result (data.status === 0) — lets the UI tell the two apart instead of
  // showing "Product Not Found" when the real problem is connectivity.
  networkError?: boolean;
}

export interface Nutriments {
  energy_kcal: number;
  fat: number;
  saturated_fat: number;
  carbohydrates: number;
  sugars: number;
  fiber: number;
  proteins: number;
  salt: number;
  sodium: number;
}

const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

// Open Food Facts is community-edited and occasionally returns a nutrient
// field as a string (or something else non-numeric) instead of a number. The
// old `value || 0` fallback only caught missing/falsy values — a string like
// "12,5" or even "0" sailed straight through untouched, and productScore.ts's
// unguarded .toFixed() calls would then crash on it. Coercing here, once, at
// the API-parse boundary, means every downstream consumer can trust these
// are always real, finite numbers.
function toSafeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchProductByBarcode(barcode: string): Promise<ProductData> {
  // Validate barcode format before API call. Invalid input (e.g. a scanned QR
  // payload — not a product barcode at all — or corrupted data) is rejected
  // here rather than merely logged, so it never reaches the network as a
  // malformed request that would otherwise be indistinguishable from a
  // genuine "not found" result.
  const barcodeValidation = validateBarcode(barcode);
  if (!barcodeValidation.valid) {
    logger.warn('api', `Invalid barcode: ${barcode}`, { reason: barcodeValidation.reason });
    return { barcode, found: false } as ProductData;
  }
  logger.info('api', `Fetching product: ${barcode}`, { type: barcodeValidation.type });

  const cacheKey = `product:${barcode}`;

  try {
    const response = await apiClient.get<any>(
      `${BASE_URL}/${encodeURIComponent(barcode)}.json`,
      {
        cacheKey,
        cacheTTL: TTL.PRODUCT,
        retries: 3,
        timeout: 8000,
        headers: { 'User-Agent': 'Shuddhaahar/1.0 (React Native App; info@shuddhaahar.shop)' },
      }
    );

    const data = response.data;
    if (data.status === 0 || !data.product) {
      logger.info('api', `Product not found: ${barcode}`);
      return { barcode, found: false, networkError: false } as ProductData;
    }

    const p = data.product;

    // Parse ingredients list
    const ingredientsList: string[] = [];
    if (p.ingredients) {
      p.ingredients.forEach((ing: any) => {
        if (ing.text) ingredientsList.push(ing.text);
      });
    } else if (p.ingredients_text) {
      const raw = p.ingredients_text_en || p.ingredients_text || '';
      raw.split(/,|;/).forEach((i: string) => {
        const cleaned = i.trim().replace(/^\*+|\*+$/g, '').trim();
        if (cleaned) ingredientsList.push(cleaned);
      });
    }

    // Parse allergens
    const allergens: string[] = [];
    if (p.allergens_tags) {
      p.allergens_tags.forEach((a: string) => {
        const name = a.replace('en:', '').replace(/-/g, ' ');
        allergens.push(name.charAt(0).toUpperCase() + name.slice(1));
      });
    }

    const nutriments = p.nutriments || {};

    // Parse E-numbers / additives
    const additives: Additive[] = (p.additives_tags || []).map((tag: string) => {
      const code = tag.replace('en:', '').toUpperCase();
      return {
        code,
        name: p.additives_original_tags?.find((t: string) => t.includes(code.toLowerCase()))?.replace(/en:|fr:/g, '') || code,
        riskLevel: getAdditiveRisk(code),
      };
    });

    // NOVA classification (1-4, 4 = ultra processed)
    const novaGroup: number = p.nova_group || p.nova_groups || 0;

    // Vitamins & minerals
    const vitamins: Record<string, number> = {};
    const vitKeys = ['vitamin-a', 'vitamin-c', 'vitamin-d', 'vitamin-b12', 'folates', 'calcium', 'iron', 'zinc', 'magnesium'];
    vitKeys.forEach(k => {
      const val = nutriments[`${k}_100g`];
      if (val !== undefined) vitamins[k] = val;
    });

    const product: ProductData = {
      barcode,
      found: true,
      name: p.product_name_en || p.product_name || 'Unknown Product',
      brand: p.brands || 'Unknown Brand',
      image: p.image_front_url || p.image_url || '',
      ingredients: p.ingredients_text_en || p.ingredients_text || 'Not available',
      ingredientsList,
      allergens,
      nutriments: {
        energy_kcal: toSafeNumber(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal']),
        fat: toSafeNumber(nutriments['fat_100g']),
        saturated_fat: toSafeNumber(nutriments['saturated-fat_100g']),
        carbohydrates: toSafeNumber(nutriments['carbohydrates_100g']),
        sugars: toSafeNumber(nutriments['sugars_100g']),
        fiber: toSafeNumber(nutriments['fiber_100g']),
        proteins: toSafeNumber(nutriments['proteins_100g']),
        salt: toSafeNumber(nutriments['salt_100g']),
        sodium: toSafeNumber(nutriments['sodium_100g']),
      },
      nutriscore: p.nutriscore_grade || p.nutrition_grade_fr || 'unknown',
      quantity: p.quantity || '',
      categories: p.categories || '',
      categoriesTags: p.categories_tags || [],
      novaGroup,
      upfScore: getUPFScore(novaGroup),
      additives,
      vitamins,
    };

    // Validate nutrition values make sense
    const nutritionValidation = validateNutrition(product.nutriments);
    if (!nutritionValidation.valid) {
      logger.warn('api', `Nutrition validation issues for ${barcode}`, { issues: nutritionValidation.issues });
    }

    // Score data quality and log it
    const accuracy = scoreProductAccuracy(product);
    logger.info('api', `Product accuracy: ${accuracy.overallScore}/100 (${accuracy.grade})`, {
      barcode, name: product.name, confidence: accuracy.confidence,
    });

    // Sanitise before returning
    return sanitiseProduct(product) as ProductData;
  } catch (error) {
    await errorReporter.captureAPIError(
      `${BASE_URL}/${barcode}.json`,
      error as Error,
    );
    logger.error('api', `Failed to fetch product: ${barcode}`, error as Error);

    // Open Food Facts' v2 API returns HTTP 404 (not a 200 with a status:0
    // body) for a barcode that's genuinely not in their database — apiClient
    // throws on any non-2xx response before this function ever gets to
    // inspect that body, so a real "not found" was landing in this catch
    // block too, not just actual connectivity/server failures, and getting
    // shown to the user as "Couldn't Reach the Server" instead of "Product
    // Not Found". A 404 specifically means the lookup itself succeeded and
    // came back empty, so treat it the same as the status===0 case above.
    const isNotFound = error instanceof AppError && error.code === 'httpError' && error.params?.status === 404;
    if (isNotFound) {
      logger.info('api', `Product not found (404): ${barcode}`);
      return { barcode, found: false, networkError: false } as ProductData;
    }

    // Any other failure (timeout, network down, 5xx) really is connectivity/
    // server trouble — keep telling the user that, not "not found".
    return { barcode, found: false, networkError: true } as ProductData;
  }
}

function getUPFScore(novaGroup: number): UPFScore {
  const map: Record<number, UPFScore> = {
    1: { group: 1, label: 'Unprocessed', description: 'Natural or minimally processed food', color: '#038141', isUPF: false },
    2: { group: 2, label: 'Processed Ingredient', description: 'Culinary ingredient (oil, sugar, salt)', color: '#85BB2F', isUPF: false },
    3: { group: 3, label: 'Processed Food', description: 'Processed but not ultra-processed', color: '#EE8100', isUPF: false },
    4: { group: 4, label: 'Ultra-Processed', description: 'Industrial formulation with additives not used in home cooking', color: '#E63312', isUPF: true },
  };
  return map[novaGroup] || { group: 0, label: 'Unknown', description: 'Processing level not available', color: '#8A96A8', isUPF: false };
}

const HIGH_RISK = ['E102','E104','E110','E122','E124','E129','E211','E250','E252','E621','E951','E952','E954'];
const CAUTION = ['E100','E101','E120','E150','E160','E171','E172','E220','E249','E310','E320','E321','E407','E412','E415','E422','E450','E471','E472','E476','E481','E500','E503'];

function getAdditiveRisk(code: string): 'safe' | 'caution' | 'avoid' {
  if (HIGH_RISK.includes(code)) return 'avoid';
  if (CAUTION.includes(code)) return 'caution';
  return 'safe';
}
