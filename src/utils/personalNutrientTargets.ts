// src/utils/personalNutrientTargets.ts
// Personalised per-nutrient breakdown for the Personal Score card. Unlike
// productScore.ts (a fixed general reference, same for everyone), this uses
// the signed-in user's own daily reference amounts — calorie and protein
// targets are calculated from their age, weight, height and activity level
// (the same formula the Diary screen uses); sugar, salt, saturated fat and
// fibre fall back to general adult guidelines where there's no per-user
// equivalent yet.
//
// Kept to a single short line each ("41% of 30g daily limit") and only the
// nutrients that actually stand out (skip anything unremarkable) — this is
// meant to be scanned in a couple of seconds, not read like a report.

import { ProductData } from '../services/foodApi';
import { HealthProfile } from '../services/userDataService';
import { getDailyGoals } from '../services/diaryService';
import { Colors } from '../theme/medical';

export type PersonalNutrientStatus = 'good' | 'bad';

export interface PersonalNutrientRow {
  key: string;
  icon: string;
  title: string;
  value: string;
  status: PersonalNutrientStatus;
  note: string;
  color: string;
}

// The AI is given the exact nutrition numbers, so it often names a nutrient
// (and its amount) directly in its own sentences — e.g. "high in sugar
// (17.3g)". When that happens, a structured row for the same nutrient right
// underneath would just repeat it, so callers should drop rows whose keyword
// already appears in the AI's own text.
const NUTRIENT_KEYWORDS: Record<string, string[]> = {
  energy: ['energy', 'calorie', 'kcal'],
  protein: ['protein'],
  sugar: ['sugar'],
  salt: ['salt', 'sodium'],
  saturates: ['saturat'], // matches "saturate(s)" and "saturated fat"
  fibre: ['fibre', 'fiber'],
};

// Drop any row whose nutrient is already named in the AI's own text, so the
// same fact isn't shown twice in two different formats.
export function excludeAlreadyMentioned(rows: PersonalNutrientRow[], aiText: string): PersonalNutrientRow[] {
  const text = aiText.toLowerCase();
  return rows.filter(row => {
    const keywords = NUTRIENT_KEYWORDS[row.key] || [row.title.toLowerCase()];
    return !keywords.some(kw => text.includes(kw));
  });
}

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${r}` : `${r.toFixed(1)}`;
}

// LIMIT nutrient — there's a personal daily ceiling to stay under. Only
// surfaced when it's clearly low (good) or clearly high (bad) for a single
// 100g portion — unremarkable amounts are left out rather than shown as
// "neutral" filler.
function limitRow(
  key: string, icon: string, title: string,
  value: number, dailyLimit: number, unit: string,
): PersonalNutrientRow | null {
  // Guard against a zero/negative daily limit (e.g. from a corrupted profile
  // reaching getDailyGoals despite upstream fixes) producing a negative or
  // NaN percentage in the UI — this function should be robust on its own.
  const safeLimit = Math.max(dailyLimit, 1);
  const pct = Math.round((value / safeLimit) * 100);
  if (pct > 15 && pct <= 50) return null; // unremarkable — not worth a line
  const good = pct <= 15;
  return {
    key, icon, title,
    value: `${fmt(value)}${unit}`,
    status: good ? 'good' : 'bad',
    note: `${pct}% of ${fmt(safeLimit)}${unit} daily limit`,
    color: good ? Colors.safe : Colors.danger,
  };
}

// TARGET nutrient — there's a personal daily floor to work towards. Only
// surfaced when a single 100g portion makes a genuinely good contribution;
// otherwise it's not worth a line.
function targetRow(
  key: string, icon: string, title: string,
  value: number, dailyTarget: number, unit: string,
): PersonalNutrientRow | null {
  // Same independent guard as limitRow — a zero/negative target must not
  // produce a negative or NaN percentage.
  const safeTarget = Math.max(dailyTarget, 1);
  const pct = Math.round((value / safeTarget) * 100);
  if (pct < 15) return null; // too small a contribution to be worth flagging
  return {
    key, icon, title,
    value: `${fmt(value)}${unit}`,
    status: 'good',
    note: `${pct}% of ${fmt(safeTarget)}${unit} daily target`,
    color: Colors.safe,
  };
}

export function buildPersonalNutrientRows(product: ProductData, profile?: HealthProfile): PersonalNutrientRow[] {
  const n = product.nutriments;
  const goals = getDailyGoals(profile);
  const saturatesMaxG = profile?.gender?.toLowerCase() === 'male' ? 30 : 20;
  const fibreTargetG = 30; // UK general adult guideline

  const candidates = [
    n.energy_kcal != null ? limitRow('energy', '🔥', 'Energy', n.energy_kcal, goals.calories, ' kcal') : null,
    n.proteins != null ? targetRow('protein', '🥩', 'Protein', n.proteins, goals.protein, 'g') : null,
    n.sugars != null ? limitRow('sugar', '🧊', 'Sugar', n.sugars, goals.sugars, 'g') : null,
    n.salt != null ? limitRow('salt', '🧂', 'Salt', n.salt, goals.salt, 'g') : null,
    n.saturated_fat != null ? limitRow('saturates', '💧', 'Saturates', n.saturated_fat, saturatesMaxG, 'g') : null,
    n.fiber != null ? targetRow('fibre', '🌾', 'Fibre', n.fiber, fibreTargetG, 'g') : null,
  ];

  return candidates.filter((r): r is PersonalNutrientRow => r !== null);
}
