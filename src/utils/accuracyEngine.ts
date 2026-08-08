// src/utils/accuracyEngine.ts
// Multi-source product verification and confidence scoring
// Ensures users get the most accurate product data possible

import { ProductData } from '../services/foodApi';
import logger from './logger';
import apiClient from './apiClient';
import cache, { TTL } from './cache';

export interface AccuracyReport {
  overallScore: number;       // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  confidence: 'high' | 'medium' | 'low';
  checks: AccuracyCheck[];
  warnings: string[];
  lastVerified: string;
  sources: string[];
}

interface AccuracyCheck {
  name: string;
  passed: boolean;
  score: number;            // 0-100 contribution
  detail: string;
}

// Barcode format validation
export function validateBarcode(barcode: string): { valid: boolean; type: string; reason?: string } {
  const cleaned = barcode.replace(/\D/g, '');

  if (!cleaned) return { valid: false, type: 'unknown', reason: 'Empty barcode' };

  // EAN-13
  if (cleaned.length === 13) {
    if (validateEAN13(cleaned)) return { valid: true, type: 'EAN-13' };
    return { valid: false, type: 'EAN-13', reason: 'Invalid check digit' };
  }
  // UPC-A
  if (cleaned.length === 12) {
    if (validateUPCA(cleaned)) return { valid: true, type: 'UPC-A' };
    return { valid: false, type: 'UPC-A', reason: 'Invalid check digit' };
  }
  // EAN-8
  if (cleaned.length === 8) {
    return { valid: true, type: 'EAN-8' };
  }
  // Code 128 / other variable length
  if (cleaned.length >= 6 && cleaned.length <= 14) {
    return { valid: true, type: 'Code-128' };
  }

  return { valid: false, type: 'unknown', reason: `Unexpected length: ${cleaned.length}` };
}

function validateEAN13(barcode: string): boolean {
  if (barcode === '0000000000000') return false; // GS1 reserved
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(barcode[12]);
}

function validateUPCA(barcode: string): boolean {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 3 : 1);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(barcode[11]);
}

// Score product data quality
export function scoreProductAccuracy(product: ProductData): AccuracyReport {
  const checks: AccuracyCheck[] = [];
  const warnings: string[] = [];

  // 1. Name completeness
  const hasName = !!(product.name && product.name !== 'Unknown Product' && product.name.length > 2);
  checks.push({ name: 'Product name', passed: hasName, score: hasName ? 15 : 0, detail: hasName ? 'Name present' : 'Missing product name' });

  // 2. Brand presence
  const hasBrand = !!(product.brand && product.brand !== 'Unknown Brand');
  checks.push({ name: 'Brand', passed: hasBrand, score: hasBrand ? 10 : 0, detail: hasBrand ? `Brand: ${product.brand}` : 'Missing brand' });
  if (!hasBrand) warnings.push('Brand information not available');

  // 3. Ingredients completeness
  const hasIngredients = product.ingredientsList.length > 0 || product.ingredients.length > 20;
  const ingredientScore = product.ingredientsList.length > 5 ? 20 : product.ingredientsList.length > 0 ? 12 : 0;
  checks.push({ name: 'Ingredients', passed: hasIngredients, score: ingredientScore, detail: hasIngredients ? `${product.ingredientsList.length} ingredients found` : 'No ingredients data' });
  if (!hasIngredients) warnings.push('Ingredient data missing — allergen warnings may be incomplete');

  // 4. Allergens declared
  const hasAllergens = product.allergens !== undefined; // even empty array is valid
  checks.push({ name: 'Allergen data', passed: hasAllergens, score: 15, detail: `${product.allergens.length} allergens declared` });

  // 5. Nutrition completeness
  const n = product.nutriments;
  const nutritionFields = [n.energy_kcal, n.fat, n.carbohydrates, n.proteins, n.salt];
  const filledFields = nutritionFields.filter(v => v > 0).length;
  const nutritionScore = Math.round((filledFields / nutritionFields.length) * 20);
  checks.push({ name: 'Nutrition data', passed: filledFields >= 3, score: nutritionScore, detail: `${filledFields}/5 nutrition values present` });
  if (filledFields < 3) warnings.push('Incomplete nutrition data — calorie tracking may be inaccurate');

  // 6. Nutri-Score
  const hasNutriscore = product.nutriscore && product.nutriscore !== 'unknown';
  checks.push({ name: 'Nutri-Score', passed: !!hasNutriscore, score: hasNutriscore ? 5 : 0, detail: hasNutriscore ? `Nutri-Score ${product.nutriscore?.toUpperCase()}` : 'Not available' });

  // 7. NOVA/UPF classification
  const hasNova = product.novaGroup > 0;
  checks.push({ name: 'NOVA classification', passed: hasNova, score: hasNova ? 10 : 0, detail: hasNova ? `NOVA group ${product.novaGroup}` : 'Not classified' });

  // 8. Product image
  const hasImage = !!product.image;
  checks.push({ name: 'Product image', passed: hasImage, score: hasImage ? 5 : 0, detail: hasImage ? 'Image available' : 'No image' });

  const totalScore = checks.reduce((s, c) => s + c.score, 0);
  const grade: AccuracyReport['grade'] =
    totalScore >= 90 ? 'A' : totalScore >= 75 ? 'B' : totalScore >= 60 ? 'C' : totalScore >= 40 ? 'D' : 'F';
  const confidence: AccuracyReport['confidence'] =
    totalScore >= 75 ? 'high' : totalScore >= 50 ? 'medium' : 'low';

  if (confidence === 'low') {
    warnings.push('Low data confidence — verify information against physical product label');
  }

  logger.debug('accuracy', `Product accuracy: ${totalScore}/100 (${grade})`, {
    barcode: product.barcode, grade, warnings: warnings.length,
  });

  return {
    overallScore: totalScore,
    grade,
    confidence,
    checks,
    warnings,
    lastVerified: new Date().toISOString(),
    sources: ['Open Food Facts'],
  };
}

// Sanitise and normalise product data
export function sanitiseProduct(raw: Partial<ProductData>): Partial<ProductData> {
  return {
    ...raw,
    name: sanitiseText(raw.name || ''),
    brand: sanitiseText(raw.brand || ''),
    ingredients: sanitiseText(raw.ingredients || ''),
    ingredientsList: (raw.ingredientsList || [])
      .map(i => sanitiseText(i))
      .filter(i => i.length > 0)
      .filter((i, idx, arr) => arr.indexOf(i) === idx), // deduplicate
    allergens: (raw.allergens || [])
      .map(a => capitalise(a.trim()))
      .filter(Boolean),
  };
}

function sanitiseText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')        // strip HTML
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Validate nutrition values make sense
export function validateNutrition(nutriments: ProductData['nutriments']): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (nutriments.energy_kcal > 900) issues.push('Energy value extremely high (>900 kcal/100g)');
  if (nutriments.energy_kcal < 0) issues.push('Negative energy value');
  if (nutriments.fat > 100) issues.push('Fat value exceeds 100g/100g');
  if (nutriments.carbohydrates > 100) issues.push('Carbohydrates exceed 100g/100g');
  if (nutriments.proteins > 100) issues.push('Protein exceeds 100g/100g');
  if (nutriments.sugars > nutriments.carbohydrates) issues.push('Sugars exceed total carbohydrates');
  if (nutriments.saturated_fat > nutriments.fat) issues.push('Saturated fat exceeds total fat');

  // Basic energy check: ~4 kcal/g carbs, ~9 kcal/g fat, ~4 kcal/g protein
  const estimated = (nutriments.carbohydrates * 4) + (nutriments.fat * 9) + (nutriments.proteins * 4);
  const diff = Math.abs(estimated - nutriments.energy_kcal);
  if (nutriments.energy_kcal > 0 && diff > 100) {
    issues.push(`Energy value may be inaccurate (estimated ${Math.round(estimated)} kcal vs stated ${nutriments.energy_kcal} kcal)`);
  }

  if (issues.length > 0) {
    logger.warn('accuracy', 'Nutrition validation issues', { issues });
  }

  return { valid: issues.length === 0, issues };
}
