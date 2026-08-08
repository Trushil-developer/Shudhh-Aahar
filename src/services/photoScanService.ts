// src/services/photoScanService.ts
// User takes a photo of any meal (restaurant, home cooked, etc.)
// Claude Vision identifies foods and estimates nutrition + health assessment

import { AppError } from '../utils/AppError';

const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY';
const MODEL = 'claude-haiku-4-5';

export interface PhotoMealResult {
  found: boolean;
  mealName: string;
  description: string;
  foods: IdentifiedFood[];
  totals: MealTotals;
  healthVerdict: 'good' | 'moderate' | 'poor';
  verdictReason: string;
  healthTips: string[];
  isUPF: boolean;
  upfFoods: string[];
}

export interface IdentifiedFood {
  name: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isProcessed: boolean;
}

export interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export async function analysePhotoMeal(
  base64Image: string,
  mediaType: string,
  userProfile: any,
): Promise<PhotoMealResult> {
  if (ANTHROPIC_API_KEY === 'YOUR_ANTHROPIC_API_KEY') {
    return getMockPhotoResult();
  }

  const healthCtx = [
    userProfile?.allergies?.length ? `Allergies: ${userProfile.allergies.join(', ')}` : '',
    userProfile?.conditions?.length ? `Conditions: ${userProfile.conditions.join(', ')}` : '',
    userProfile?.dietType ? `Diet: ${userProfile.dietType}` : '',
  ].filter(Boolean).join(' | ');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
            { type: 'text', text: buildPhotoPrompt(healthCtx) },
          ],
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new AppError('noJsonResponse', 'No JSON');
    return formatPhotoResult(JSON.parse(json));
  } catch (err) {
    console.error('Photo scan error:', err);
    return getMockPhotoResult();
  }
}

const HEALTH_VERDICTS: readonly PhotoMealResult['healthVerdict'][] = ['good', 'moderate', 'poor'];

// A busy plate is exactly the case most likely to hit max_tokens mid-object —
// the result is still valid, parseable JSON, just with fields missing. This
// app's other two AI-parsing services (aiHealthService, documentHealthService)
// already default every field before it reaches the UI; this one shipped the
// parsed JSON straight through, so PhotoScanScreen's unguarded .length/.map/
// .join calls on missing fields could crash the whole app. Same fix, same
// pattern as the other two.
function formatPhotoResult(parsed: any): PhotoMealResult {
  const healthVerdict = HEALTH_VERDICTS.includes(parsed?.healthVerdict) ? parsed.healthVerdict : 'moderate';

  return {
    found: parsed?.found !== false,
    mealName: parsed?.mealName || 'Meal',
    description: parsed?.description || '',
    foods: (parsed?.foods || []).map((f: any) => ({
      name: f?.name || 'Unknown item',
      estimatedGrams: Number(f?.estimatedGrams) || 0,
      calories: Number(f?.calories) || 0,
      protein: Number(f?.protein) || 0,
      carbs: Number(f?.carbs) || 0,
      fat: Number(f?.fat) || 0,
      isProcessed: !!f?.isProcessed,
    })),
    totals: {
      calories: Number(parsed?.totals?.calories) || 0,
      protein: Number(parsed?.totals?.protein) || 0,
      carbs: Number(parsed?.totals?.carbs) || 0,
      fat: Number(parsed?.totals?.fat) || 0,
      fibre: Number(parsed?.totals?.fibre) || 0,
    },
    healthVerdict,
    verdictReason: parsed?.verdictReason || '',
    healthTips: parsed?.healthTips || [],
    isUPF: !!parsed?.isUPF,
    upfFoods: parsed?.upfFoods || [],
  };
}

function buildPhotoPrompt(healthCtx: string): string {
  return `Analyse this meal photo and estimate its nutritional content.

USER HEALTH PROFILE: ${healthCtx || 'No profile set'}

Identify every food item visible. Estimate portion sizes in grams based on typical serving sizes. Calculate estimated nutrition.

Respond ONLY in this exact JSON format:
{
  "found": true,
  "mealName": "Grilled Chicken Salad",
  "description": "Brief description of what you see",
  "foods": [
    { "name": "Grilled chicken breast", "estimatedGrams": 150, "calories": 248, "protein": 46, "carbs": 0, "fat": 5, "isProcessed": false }
  ],
  "totals": { "calories": 450, "protein": 38, "carbs": 22, "fat": 14, "fibre": 6 },
  "healthVerdict": "good",
  "verdictReason": "High protein, good fibre, low processed food content",
  "healthTips": ["Consider adding more vegetables for extra micronutrients"],
  "isUPF": false,
  "upfFoods": []
}

healthVerdict options: "good" (nutritious, balanced), "moderate" (okay but improvable), "poor" (high UPF, sugar, or allergen risk)
isUPF: true if more than 50% of foods are ultra-processed
upfFoods: list any ultra-processed items visible`;
}

function getMockPhotoResult(): PhotoMealResult {
  return {
    found: true,
    mealName: 'Grilled Salmon with Vegetables',
    description: 'A balanced meal with grilled salmon fillet, roasted sweet potato, and steamed broccoli',
    foods: [
      { name: 'Grilled salmon fillet', estimatedGrams: 180, calories: 374, protein: 40, carbs: 0, fat: 22, isProcessed: false },
      { name: 'Roasted sweet potato', estimatedGrams: 150, calories: 129, protein: 2, carbs: 30, fat: 0, isProcessed: false },
      { name: 'Steamed broccoli', estimatedGrams: 100, calories: 34, protein: 3, carbs: 6, fat: 0, isProcessed: false },
      { name: 'Olive oil drizzle', estimatedGrams: 10, calories: 88, protein: 0, carbs: 0, fat: 10, isProcessed: false },
    ],
    totals: { calories: 625, protein: 45, carbs: 36, fat: 32, fibre: 8 },
    healthVerdict: 'good',
    verdictReason: 'Excellent protein source from salmon, good complex carbohydrates, high fibre from vegetables. No ultra-processed ingredients detected.',
    healthTips: [
      'Great omega-3 content from the salmon — beneficial for heart health',
      'Consider a side salad to boost micronutrient variety',
    ],
    isUPF: false,
    upfFoods: [],
  };
}
