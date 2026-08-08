// src/services/recommendationService.ts
// Searches Open Food Facts for similar products and uses Claude Haiku
// to rank them by suitability for the user's health profile

import { ProductData } from './foodApi';
import { HealthProfile } from './userDataService';
import Config from '../config/environment';
import { Colors } from '../theme/medical';
import { AppError } from '../utils/AppError';

export interface RecommendedProduct {
  barcode: string;
  name: string;
  brand: string;
  image: string;
  nutriscore: string;
  nutriments: any;
  ingredients: string;
  allergens: string[];
  aiScore: number;       // 0-10 suitability for this user
  aiReason: string;      // why it's better
  verdict: 'better' | 'similar' | 'worse';
  verdictColor: string;
}

const MODEL = 'claude-haiku-4-5';

// ─── Step 1: Search Open Food Facts for similar products ───

async function searchSimilarProducts(product: ProductData): Promise<any[]> {
  try {
    // Pick the most specific category tag (last one in the hierarchy is most specific)
    // e.g. ["en:plant-based-foods","en:fats","en:butters"] → use "en:butters"
    const categoryTags = product.categoriesTags || [];
    const specificTag = categoryTags[categoryTags.length - 1] || '';
    const categorySlug = specificTag.replace('en:', '');

    const urls: string[] = [];

    // 1st choice: Open Food Facts category endpoint (strict same-category)
    if (categorySlug) {
      urls.push(
        `https://world.openfoodfacts.org/category/${encodeURIComponent(categorySlug)}.json?page=1&page_size=40&sort_by=unique_scans_n`
      );
    }

    // 2nd choice: tag-filtered search (also same category)
    if (categorySlug) {
      urls.push(
        `https://world.openfoodfacts.org/cgi/search.pl?tagtype_0=categories&tag_contains_0=contains&tag_0=${encodeURIComponent(categorySlug)}&action=process&json=1&page_size=30&sort_by=unique_scans_n`
      );
    }

    // Fallback: name-keyword search
    const keyword = product.name.split(' ').slice(0, 2).join(' ');
    urls.push(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(keyword)}&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n`
    );

    for (const url of urls) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Shuddhaahar/1.0 (React Native App)' },
      });
      if (!res.ok) continue;

      const data = await res.json();
      const products = data.products || [];

      const filtered = products.filter((p: any) =>
        p.code !== product.barcode &&
        (p.product_name_en || p.product_name) &&
        p.nutriscore_grade &&
        p.nutriscore_grade !== 'unknown'
      );

      if (filtered.length >= 3) return filtered.slice(0, 8);
    }

    return [];
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
}

// ─── Step 2: Ask Claude to rank them for this user ────────

async function rankWithAI(
  scannedProduct: ProductData,
  candidates: any[],
  profile: HealthProfile,
  scannedScore: number,
): Promise<RecommendedProduct[]> {

  if (!candidates.length) return [];

  // Build compact candidate list for Claude
  const candidateList = candidates.map((p, i) => {
    const n = p.nutriments || {};
    return {
      index: i,
      name: p.product_name_en || p.product_name || 'Unknown',
      brand: p.brands || '',
      nutriscore: p.nutriscore_grade || 'unknown',
      sugar: n['sugars_100g'] || 0,
      fat: n['fat_100g'] || 0,
      salt: n['salt_100g'] || 0,
      calories: n['energy-kcal_100g'] || 0,
      protein: n['proteins_100g'] || 0,
      allergens: (p.allergens_tags || []).map((a: string) => a.replace('en:', '')),
      ingredients: (p.ingredients_text_en || p.ingredients_text || '').slice(0, 150),
    };
  });

  const healthContext = [
    profile.allergies?.length ? `Allergies: ${profile.allergies.join(', ')}` : '',
    profile.intolerances?.length ? `Intolerances: ${profile.intolerances.join(', ')}` : '',
    profile.conditions?.length ? `Conditions: ${profile.conditions.join(', ')}` : '',
    profile.dietType ? `Diet: ${profile.dietType}` : '',
    profile.healthGoals?.length ? `Goals: ${profile.healthGoals.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const prompt = `The user just scanned: "${scannedProduct.name}" by ${scannedProduct.brand} (Nutri-Score ${scannedProduct.nutriscore?.toUpperCase()}, personal health score: ${scannedScore}/100).

USER HEALTH PROFILE:
${healthContext || 'No health data provided — rank by general nutrition quality'}

SIMILAR PRODUCTS TO EVALUATE:
${JSON.stringify(candidateList, null, 2)}

Rank the TOP 3 most suitable alternatives for this user. For each:
- Give a personal suitability score (0-10)
- One short reason why it's better/worse than the scanned product
- verdict: "better", "similar", or "worse" compared to scanned product

Respond ONLY in this JSON format, no other text:
{
  "recommendations": [
    {
      "index": 0,
      "aiScore": 8,
      "aiReason": "Lower sugar and better Nutri-Score — more suitable for your diabetes goals",
      "verdict": "better"
    }
  ]
}`;

  const anthropicApiKey = Config.anthropicApiKey;

  if (!anthropicApiKey) {
    return getMockRecommendations(candidates);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new AppError('noJsonResponse', 'No JSON');

    const parsed = JSON.parse(jsonMatch[0]);
    const recs: RecommendedProduct[] = [];

    for (const rec of parsed.recommendations || []) {
      const candidate = candidates[rec.index];
      if (!candidate) continue;

      const n = candidate.nutriments || {};
      recs.push({
        barcode: candidate.code,
        name: candidate.product_name_en || candidate.product_name || 'Unknown',
        brand: candidate.brands || '',
        image: candidate.image_front_url || candidate.image_url || '',
        nutriscore: candidate.nutriscore_grade || 'unknown',
        nutriments: {
          energy_kcal: n['energy-kcal_100g'] || 0,
          sugars: n['sugars_100g'] || 0,
          fat: n['fat_100g'] || 0,
          salt: n['salt_100g'] || 0,
          proteins: n['proteins_100g'] || 0,
        },
        ingredients: candidate.ingredients_text_en || candidate.ingredients_text || '',
        allergens: (candidate.allergens_tags || []).map((a: string) =>
          a.replace('en:', '').replace(/-/g, ' ')
        ),
        aiScore: rec.aiScore,
        aiReason: rec.aiReason,
        verdict: rec.verdict,
        verdictColor: rec.verdict === 'better' ? Colors.safe : rec.verdict === 'similar' ? Colors.caution : Colors.danger,
      });
    }

    return recs;
  } catch (err) {
    console.error('Ranking error:', err);
    return getMockRecommendations(candidates);
  }
}

// ─── Main export ──────────────────────────────────────────

export async function findSimilarProducts(
  product: ProductData,
  profile: HealthProfile,
  scannedScore: number,
): Promise<RecommendedProduct[]> {
  const candidates = await searchSimilarProducts(product);
  if (!candidates.length) return [];
  return rankWithAI(product, candidates, profile, scannedScore);
}

// ─── Mock data for development ────────────────────────────

function getMockRecommendations(candidates: any[]): RecommendedProduct[] {
  const mock: RecommendedProduct[] = [
    {
      barcode: '5000112637012',
      name: 'Coca-Cola Zero Sugar',
      brand: 'Coca-Cola',
      image: '',
      nutriscore: 'b',
      nutriments: { energy_kcal: 1, sugars: 0, fat: 0, salt: 0, proteins: 0 },
      ingredients: 'Carbonated Water, Colour (Caramel E150d), Phosphoric Acid, Sweeteners (Aspartame, Acesulfame K)...',
      allergens: [],
      aiScore: 7,
      aiReason: 'Zero sugar version — much better for blood sugar management while keeping the same taste',
      verdict: 'better',
      verdictColor: Colors.safe,
    },
    {
      barcode: '5000112548587',
      name: 'Sparkling Water Lemon',
      brand: 'Highland Spring',
      image: '',
      nutriscore: 'a',
      nutriments: { energy_kcal: 0, sugars: 0, fat: 0, salt: 0.01, proteins: 0 },
      ingredients: 'Carbonated Natural Mineral Water, Natural Lemon Flavouring',
      allergens: [],
      aiScore: 9,
      aiReason: 'Zero sugar, zero calories — the healthiest fizzy drink option and perfect for your goals',
      verdict: 'better',
      verdictColor: Colors.safe,
    },
    {
      barcode: '5000112637029',
      name: 'Coca-Cola Life (Stevia)',
      brand: 'Coca-Cola',
      image: '',
      nutriscore: 'c',
      nutriments: { energy_kcal: 22, sugars: 4.7, fat: 0, salt: 0, proteins: 0 },
      ingredients: 'Carbonated Water, Sugar, Colour (Caramel E150d), Phosphoric Acid, Natural Flavourings, Sweetener (Stevia)',
      allergens: [],
      aiScore: 5,
      aiReason: 'Reduced sugar with stevia — a middle ground but still contains some sugar',
      verdict: 'similar',
      verdictColor: Colors.caution,
    },
  ];
  return mock;
}
