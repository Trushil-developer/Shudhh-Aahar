// src/services/diaryService.ts
// Daily food diary — log scanned products, track calories and macros
// Stored in AsyncStorage per day

import AsyncStorage from '@react-native-async-storage/async-storage';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DiaryEntry {
  id: string;
  date: string;            // YYYY-MM-DD
  meal: MealType;
  barcode: string;
  name: string;
  brand: string;
  image: string;
  servingGrams: number;    // how many grams they ate
  loggedAt: string;
  // Calculated from serving size
  calories: number;
  fat: number;
  carbs: number;
  sugars: number;
  protein: number;
  salt: number;
  aiScore?: number;
}

export interface DaySummary {
  date: string;
  entries: DiaryEntry[];
  totals: MacroTotals;
  meals: Record<MealType, DiaryEntry[]>;
}

export interface MacroTotals {
  calories: number;
  fat: number;
  carbs: number;
  sugars: number;
  protein: number;
  salt: number;
  entryCount: number;
}

const key = (date: string) => `shuddhaahar_diary_${date}`;

export function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getDiaryForDay(date: string): Promise<DiaryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(key(date));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function addDiaryEntry(entry: Omit<DiaryEntry, 'id' | 'loggedAt'>): Promise<void> {
  const entries = await getDiaryForDay(entry.date);
  entries.push({ ...entry, id: Date.now().toString(), loggedAt: new Date().toISOString() });
  await AsyncStorage.setItem(key(entry.date), JSON.stringify(entries));
}

export async function removeDiaryEntry(date: string, id: string): Promise<void> {
  const entries = await getDiaryForDay(date);
  await AsyncStorage.setItem(key(date), JSON.stringify(entries.filter(e => e.id !== id)));
}

export function calcMacros(n: any, servingGrams: number): Omit<MacroTotals, 'entryCount'> {
  const factor = servingGrams / 100;
  return {
    calories: Math.round((n.energy_kcal || 0) * factor),
    fat: +((n.fat || 0) * factor).toFixed(1),
    carbs: +((n.carbohydrates || 0) * factor).toFixed(1),
    sugars: +((n.sugars || 0) * factor).toFixed(1),
    protein: +((n.proteins || 0) * factor).toFixed(1),
    salt: +((n.salt || 0) * factor).toFixed(2),
  };
}

const KNOWN_MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function buildDaySummary(date: string, entries: DiaryEntry[]): DaySummary {
  // getDiaryForDay does a bare JSON.parse with no per-entry schema check, so
  // anything written under a future/different schema version, or corrupted
  // by a partial AsyncStorage write, reaches here untrusted. Indexing
  // `meals[e.meal]` on an unrecognized value would throw and crash the whole
  // app (this runs on every Diary focus) — drop such entries instead, with a
  // log so it's not entirely silent.
  const validEntries = entries.filter(e => {
    const isValid = KNOWN_MEAL_TYPES.includes(e?.meal);
    if (!isValid) {
      console.warn('diaryService: dropping diary entry with unrecognized meal type', { id: e?.id, meal: e?.meal });
    }
    return isValid;
  });

  const totals: MacroTotals = {
    calories: 0, fat: 0, carbs: 0, sugars: 0, protein: 0, salt: 0, entryCount: validEntries.length,
  };
  const meals: Record<MealType, DiaryEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };

  validEntries.forEach(e => {
    totals.calories += e.calories;
    totals.fat += e.fat;
    totals.carbs += e.carbs;
    totals.sugars += e.sugars;
    totals.protein += e.protein;
    totals.salt += e.salt;
    meals[e.meal].push(e);
  });

  // Round totals
  totals.fat = +totals.fat.toFixed(1);
  totals.carbs = +totals.carbs.toFixed(1);
  totals.sugars = +totals.sugars.toFixed(1);
  totals.protein = +totals.protein.toFixed(1);
  totals.salt = +totals.salt.toFixed(2);

  return { date, entries: validEntries, totals, meals };
}

// Get last 7 days for weekly view
export async function getWeekSummary(): Promise<DaySummary[]> {
  const summaries: DaySummary[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    const entries = await getDiaryForDay(date);
    summaries.push(buildDaySummary(date, entries));
  }
  return summaries;
}

// Daily calorie goals based on profile
export function getDailyGoals(profile: any): MacroTotals {
  // Defense-in-depth: `> 0` catches negative values too, not just falsy ones
  // (0/NaN/undefined) — an invalid weight/height/age should never reach the
  // BMR formula below, even if screen-level validation is ever bypassed.
  const weight = profile?.weightKg > 0 ? profile.weightKg : 70;
  const height = profile?.heightCm > 0 ? profile.heightCm : 170;
  const age = profile?.age > 0 ? profile.age : 35;
  const exerciseMultiplier = { 'Sedentary': 1.2, 'Light (1-2x/week)': 1.375, 'Moderate (3-4x/week)': 1.55, 'Active (5+x/week)': 1.725 };
  const mult = exerciseMultiplier[profile?.exerciseLevel as keyof typeof exerciseMultiplier] || 1.4;
  // Mifflin-St Jeor BMR (using average between male/female)
  const bmr = (10 * weight) + (6.25 * height) - (5 * age);
  const tdee = Math.round(bmr * mult);
  return {
    calories: tdee,
    fat: Math.round(tdee * 0.30 / 9),
    carbs: Math.round(tdee * 0.50 / 4),
    sugars: 30,    // General guideline: max 30g free sugars/day
    protein: Math.round(weight * 0.8),
    salt: 6,       // General guideline: max 6g salt/day
    entryCount: 0,
  };
}
