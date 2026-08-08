// src/utils/productScore.ts
// General (non-personalised) 0-100 product quality score, in the style of
// well-known barcode scanners (e.g. Yuka): a blend of nutritional quality,
// additive risk, and organic status — the same score for every user,
// independent of anyone's personal health profile.
//
// Weighting: 60% nutrition (from Nutri-Score), 30% additives, 10% organic.
// Shuddhaahar doesn't currently source organic status from Open Food Facts,
// so that 10% is held at a neutral midpoint rather than invented.

import { ProductData } from '../services/foodApi';
import { Colors } from '../theme/medical';

export type ScoreBand = 'excellent' | 'good' | 'poor' | 'bad';
export type ItemStatus = 'good' | 'neutral' | 'bad';

export interface ScoreItem {
  key: string;
  icon: string;
  title: string;
  description: string;
  value: string;
  status: ItemStatus;
}

export interface ProductScore {
  score: number; // 0-100
  band: ScoreBand;
  label: string;
  color: string;
  positives: ScoreItem[];
  negatives: ScoreItem[];
}

const NUTRISCORE_POINTS: Record<string, number> = {
  a: 100, b: 80, c: 60, d: 40, e: 20,
};

const ORGANIC_NEUTRAL_SCORE = 50; // organic status unknown — neutral midpoint, not penalised

function nutritionSubScore(product: ProductData): number {
  const grade = product.nutriscore?.toLowerCase();
  return NUTRISCORE_POINTS[grade || ''] ?? 50; // unknown grade → neutral midpoint
}

function additiveSubScore(product: ProductData): number {
  const additives = product.additives || [];
  if (additives.length === 0) return 100;
  if (additives.some(a => a.riskLevel === 'avoid')) return 20;
  if (additives.some(a => a.riskLevel === 'caution')) return 55;
  return 90; // all declared additives are low-risk
}

function bandFor(score: number): { band: ScoreBand; label: string; color: string } {
  if (score >= 75) return { band: 'excellent', label: 'Excellent', color: Colors.safe };
  if (score >= 50) return { band: 'good', label: 'Good', color: Colors.safe };
  if (score >= 25) return { band: 'poor', label: 'Poor', color: Colors.caution };
  return { band: 'bad', label: 'Bad', color: Colors.danger };
}

// UK FSA-style per-100g "traffic light" thresholds, used only to describe
// each nutrient as good/neutral/bad for the Positives/Negatives breakdown —
// this is display categorisation, not the 0-100 score itself.
function buildNutrientItems(product: ProductData): ScoreItem[] {
  const n = product.nutriments;
  const items: ScoreItem[] = [];

  if (n.proteins != null) {
    const good = n.proteins >= 8;
    items.push({
      key: 'protein', icon: '🥩', title: 'Protein',
      description: good ? 'Excellent amount of protein' : 'Low amount of protein',
      value: `${n.proteins.toFixed(1)}g`, status: good ? 'good' : 'neutral',
    });
  }
  if (n.fiber != null) {
    const good = n.fiber >= 3;
    items.push({
      key: 'fibre', icon: '🌾', title: 'Fibre',
      description: good ? 'Excellent amount of fibre' : 'Low amount of fibre',
      value: `${n.fiber.toFixed(1)}g`, status: good ? 'good' : 'neutral',
    });
  }
  if (n.saturated_fat != null) {
    const good = n.saturated_fat <= 1.5;
    const bad = n.saturated_fat > 5;
    items.push({
      key: 'saturates', icon: '💧', title: 'Saturates',
      description: good ? 'Low saturates' : bad ? 'High saturates' : 'Moderate saturates',
      value: `${n.saturated_fat.toFixed(1)}g`, status: good ? 'good' : bad ? 'bad' : 'neutral',
    });
  }
  if (n.sugars != null) {
    const good = n.sugars <= 5;
    const bad = n.sugars > 22.5;
    items.push({
      key: 'sugar', icon: '🧊', title: 'Sugar',
      description: good ? 'Low sugar' : bad ? 'High sugar' : 'Moderate sugar',
      value: `${n.sugars.toFixed(1)}g`, status: good ? 'good' : bad ? 'bad' : 'neutral',
    });
  }
  if (n.energy_kcal != null) {
    const good = n.energy_kcal <= 150;
    const bad = n.energy_kcal > 400;
    items.push({
      key: 'energy', icon: '🔥', title: 'Energy',
      description: good ? 'Low impact' : bad ? 'High energy density' : 'Moderate impact',
      value: `${Math.round(n.energy_kcal)} kcal`, status: good ? 'good' : bad ? 'bad' : 'neutral',
    });
  }
  if (n.salt != null) {
    const good = n.salt <= 0.3;
    const bad = n.salt > 1.5;
    items.push({
      key: 'salt', icon: '🧂', title: 'Salt',
      description: good ? 'Low impact' : bad ? 'High salt' : 'Moderate impact',
      value: `${n.salt.toFixed(2)}g`, status: good ? 'good' : bad ? 'bad' : 'neutral',
    });
  }

  return items;
}

function buildAdditiveItem(product: ProductData): ScoreItem | null {
  const additives = product.additives || [];
  if (additives.length === 0) return null;

  const worst = additives.some(a => a.riskLevel === 'avoid') ? 'avoid'
    : additives.some(a => a.riskLevel === 'caution') ? 'caution'
    : 'safe';

  if (worst === 'safe') {
    return {
      key: 'additives', icon: '🧪', title: 'Additives',
      description: 'No high-risk additives detected',
      value: `${additives.length}`, status: 'good',
    };
  }

  return {
    key: 'additives', icon: '🧪', title: 'Additives',
    description: worst === 'avoid' ? 'Contains high-risk additives' : 'Contains additives to watch',
    value: `${additives.length}`, status: worst === 'avoid' ? 'bad' : 'neutral',
  };
}

export function calculateProductScore(product: ProductData): ProductScore {
  const nutrition = nutritionSubScore(product);
  const additive = additiveSubScore(product);
  const raw = 0.6 * nutrition + 0.3 * additive + 0.1 * ORGANIC_NEUTRAL_SCORE;
  const score = Math.round(Math.min(100, Math.max(0, raw)));
  const { band, label, color } = bandFor(score);

  const nutrientItems = buildNutrientItems(product);
  const additiveItem = buildAdditiveItem(product);
  const allItems = additiveItem ? [...nutrientItems, additiveItem] : nutrientItems;

  return {
    score,
    band,
    label,
    color,
    positives: allItems.filter(i => i.status === 'good'),
    negatives: allItems.filter(i => i.status !== 'good'),
  };
}
