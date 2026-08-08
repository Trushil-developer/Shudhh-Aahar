// src/services/aiHealthService.ts
// Uses Claude Haiku 4.5 to analyse product vs user health profile
// Cost: ~$0.001 per scan (extremely cheap)

import { HealthProfile } from './userDataService';
import { ProductData } from './foodApi';
import Config from '../config/environment';
import { Colors } from '../theme/medical';
import { AppError } from '../utils/AppError';

export interface AIHealthAnalysis {
  verdict: 'safe' | 'caution' | 'avoid';
  verdictLabel: string;
  verdictColor: string;
  summary: string;
  warnings: AIWarning[];
  positives: string[];
  suggestion: string;
  personalScore: number; // 0-100 for this user specifically — same scale as the general Product Score
}

export interface AIWarning {
  severity: 'high' | 'medium' | 'low';
  message: string;
  icon: string;
}

const MODEL = 'claude-haiku-4-5';

// Returns null (never mock/rule-based data) whenever a real AI result can't
// be produced — no API key configured, the request fails, or the response
// can't be parsed. Callers must treat null as "analysis unavailable" and
// show that plainly rather than rendering a fabricated result as if it were
// real, personalised guidance.
export async function analyseProductForUser(
  product: ProductData,
  profile: HealthProfile,
): Promise<AIHealthAnalysis | null> {
  const anthropicApiKey = Config.anthropicApiKey;

  if (!anthropicApiKey) {
    console.error('AI analysis unavailable: no Anthropic API key configured');
    return null;
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(product, profile);

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
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new AppError('apiError', `API error: ${response.status}`, { status: response.status });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON response from Claude
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new AppError('noJsonResponse', 'No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    return formatAnalysis(parsed);
  } catch (err) {
    console.error('AI analysis error:', err);
    return null;
  }
}

// ─── Prompt Builder ───────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a personal health and nutrition assistant built into a product scanning app.

Your job is to analyse a food/drink product against a user's personal health profile and give clear, helpful, personalised advice.

IMPORTANT RULES:
- Be honest but not alarmist
- Consider the FULL context (e.g. one chocolate bar won't harm a diabetic if eaten occasionally)
- Focus on what's most relevant to THIS specific user
- Be concise — this is shown on a mobile screen
- Never give medical diagnoses — give nutritional/ingredient-based guidance only
- Always suggest a positive action

You MUST respond in this exact JSON format, nothing else:
{
  "verdict": "safe" | "caution" | "avoid",
  "summary": "2-3 sentence personalised summary for this user",
  "warnings": [
    {
      "severity": "high" | "medium" | "low",
      "message": "specific warning message",
      "icon": "emoji"
    }
  ],
  "positives": ["positive aspect 1", "positive aspect 2"],
  "suggestion": "One clear actionable suggestion for this user",
  "personalScore": 0-100
}

personalScore meaning: 100 = perfect for this user, 0 = completely unsuitable, 50 = okay in moderation.
Use the full range — this is the same 0-100 scale shown elsewhere in the app, so be as precise as the
evidence supports rather than just picking round multiples of 10.`;
}

function buildUserPrompt(product: ProductData, profile: HealthProfile): string {
  // Build health context — only include what user has filled in
  const healthContext: string[] = [];

  if (profile.allergies?.length) {
    healthContext.push(`ALLERGIES: ${profile.allergies.join(', ')}`);
  }
  if (profile.intolerances?.length) {
    healthContext.push(`INTOLERANCES: ${profile.intolerances.join(', ')}`);
  }
  if (profile.conditions?.length) {
    healthContext.push(`MEDICAL CONDITIONS: ${profile.conditions.join(', ')}`);
  }
  if (profile.medications?.length) {
    const medNames = profile.medications.map((m) => m.name).join(', ');
    healthContext.push(`MEDICATIONS: ${medNames}`);
  }
  if (profile.dietType) {
    healthContext.push(`DIET TYPE: ${profile.dietType}`);
  }
  if (profile.dietaryRestrictions?.length) {
    healthContext.push(`DIETARY RESTRICTIONS: ${profile.dietaryRestrictions.join(', ')}`);
  }
  if (profile.healthGoals?.length) {
    healthContext.push(`HEALTH GOALS: ${profile.healthGoals.join(', ')}`);
  }
  if (profile.age) healthContext.push(`AGE: ${profile.age}`);
  if (profile.weightKg && profile.heightCm) {
    const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);
    healthContext.push(`BMI: ${bmi.toFixed(1)}`);
  }
  if (profile.exerciseLevel) {
    healthContext.push(`EXERCISE LEVEL: ${profile.exerciseLevel}`);
  }

  const n = product.nutriments;

  return `PRODUCT BEING SCANNED:
Name: ${product.name}
Brand: ${product.brand}
Quantity: ${product.quantity || 'unknown'}
Nutri-Score: ${product.nutriscore?.toUpperCase() || 'unknown'}

INGREDIENTS:
${product.ingredients || 'Not available'}

ALLERGENS DECLARED:
${product.allergens?.join(', ') || 'None declared'}

NUTRITION (per 100g):
- Energy: ${n.energy_kcal} kcal
- Fat: ${n.fat}g (saturated: ${n.saturated_fat}g)
- Carbohydrates: ${n.carbohydrates}g (sugars: ${n.sugars}g)
- Fibre: ${n.fiber}g
- Protein: ${n.proteins}g
- Salt: ${n.salt}g

USER HEALTH PROFILE:
${healthContext.length > 0 ? healthContext.join('\n') : 'No health data provided — give general nutrition analysis'}

Analyse this product for this specific user and respond in the required JSON format.`;
}

// ─── Response Formatter ───────────────────────────────────

function formatAnalysis(parsed: any): AIHealthAnalysis {
  const verdictMap = {
    safe: { label: 'Looks Good', color: Colors.safe },
    caution: { label: 'Use Caution', color: Colors.caution },
    avoid: { label: 'Not Recommended', color: Colors.danger },
  };

  // The verdict comes from prose JSON parsed out of a model response, not a
  // schema-enforced field, so validate it against the known set explicitly —
  // an unexpected value should degrade gracefully to 'caution' instead of
  // throwing when `verdictMap[verdict]` is looked up below (which would
  // otherwise discard a valid, billed API response and be indistinguishable
  // from an actual outage).
  const knownVerdicts: ('safe' | 'caution' | 'avoid')[] = ['safe', 'caution', 'avoid'];
  let verdict: 'safe' | 'caution' | 'avoid';
  if (knownVerdicts.includes(parsed.verdict)) {
    verdict = parsed.verdict;
  } else {
    console.error('AI analysis: unexpected verdict value from model, falling back to "caution"', parsed.verdict);
    verdict = 'caution';
  }

  return {
    verdict,
    verdictLabel: verdictMap[verdict].label,
    verdictColor: verdictMap[verdict].color,
    summary: parsed.summary || '',
    warnings: (parsed.warnings || []).map((w: any) => ({
      severity: w.severity || 'medium',
      message: w.message || '',
      icon: w.icon || '⚠️',
    })),
    positives: parsed.positives || [],
    suggestion: parsed.suggestion || '',
    personalScore: Math.round(Math.min(100, Math.max(0, parsed.personalScore || 50))),
  };
}

