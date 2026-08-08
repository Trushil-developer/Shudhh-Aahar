// src/services/userDataService.ts
// Saves/fetches user health profile from DynamoDB via AWS AppSync
import Config from '../config/environment';
import { getAuthToken } from './authService';

// AppSync auth mode is AWS_LAMBDA (see terraform/lambda_authorizer.tf) — the
// Lambda authorizer verifies the Google ID token itself, so it's passed as
// the plain `Authorization` header, no Amplify client needed.
export async function graphqlRequest<T = any>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(Config.appsyncEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw Object.assign(new Error(json.errors[0].message), { errors: json.errors });
  }
  return json.data;
}

// ─── Types ───────────────────────────────────────────────

export interface Medication {
  name: string;
  dosage?: string;
  frequency?: string;
  reason?: string;
}

export interface HealthTestResult {
  name: string;
  value: string;
  range?: string;
  flag?: 'normal' | 'high' | 'low' | 'abnormal';
  recordedAt: string;   // ISO date — when this was saved to the profile
}

export interface HealthProfile {
  // Allergies
  allergies: string[];
  intolerances: string[];
  allergyNotes?: string;

  // Medical
  conditions: string[];
  conditionNotes?: string;

  // Medications
  medications: Medication[];

  // Diet
  dietType?: string;
  dietaryRestrictions: string[];

  // Lifestyle
  exerciseLevel?: string;
  alcoholConsumption?: string;

  // Metrics
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;

  // Goals
  healthGoals: string[];

  // Test results — from uploaded reports, used to flag scanned products
  // against out-of-range values (e.g. high cholesterol → warn on high-fat items)
  testResults: HealthTestResult[];
}

export const DEFAULT_HEALTH_PROFILE: HealthProfile = {
  allergies: [],
  intolerances: [],
  conditions: [],
  medications: [],
  dietaryRestrictions: [],
  healthGoals: [],
  testResults: [],
};

// ─── GraphQL Queries ─────────────────────────────────────

const GET_USER = /* GraphQL */ `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      email
      name
      profileComplete
      banned
      planId
      subscriptionStatus
      billingPeriod
      subscriptionPeriodEnd
      healthProfile {
        allergies
        intolerances
        allergyNotes
        conditions
        conditionNotes
        medications { name dosage frequency reason }
        dietType
        dietaryRestrictions
        exerciseLevel
        alcoholConsumption
        age
        gender
        weightKg
        heightCm
        healthGoals
        testResults { name value range flag recordedAt }
      }
    }
  }
`;

const CREATE_USER = /* GraphQL */ `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id email name profileComplete
    }
  }
`;

const UPDATE_USER = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id profileComplete
    }
  }
`;

const CREATE_SCAN = /* GraphQL */ `
  mutation CreateScanHistory($input: CreateScanHistoryInput!) {
    createScanHistory(input: $input) {
      id barcode scannedAt
    }
  }
`;

const DELETE_SCAN = /* GraphQL */ `
  mutation DeleteScanHistory($input: DeleteScanHistoryInput!) {
    deleteScanHistory(input: $input) {
      id
    }
  }
`;

// ─── Functions ───────────────────────────────────────────

// Create user record on first login
export async function createUserRecord(userId: string, email: string, name: string) {
  try {
    await graphqlRequest(CREATE_USER, { input: { id: userId, email, name, profileComplete: false } });
  } catch (err: any) {
    if (!err?.errors?.[0]?.message?.includes('already exists')) {
      console.error('createUserRecord error:', err);
    }
  }
}

// Fetch user + health profile
export async function fetchUserProfile(userId: string) {
  try {
    const data = await graphqlRequest(GET_USER, { id: userId });
    return data.getUser;
  } catch (err) {
    console.error('fetchUserProfile error:', err);
    return null;
  }
}

// Save / update health profile
export async function saveHealthProfile(userId: string, profile: HealthProfile) {
  try {
    await graphqlRequest(UPDATE_USER, { input: { id: userId, profileComplete: true, healthProfile: profile } });
    return true;
  } catch (err) {
    console.error('saveHealthProfile error:', err);
    return false;
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Save scan to history
export async function saveScanHistory(
  userId: string, barcode: string, productName: string,
  brand: string, warnings: string[], cheapestPrice?: number, cheapestStore?: string,
  image?: string,
) {
  try {
    await graphqlRequest(CREATE_SCAN, {
      input: {
        id: generateId(),
        userId, barcode, productName, brand, warnings, image,
        cheapestPrice, cheapestStore,
        scannedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('saveScanHistory error:', err);
  }
}

// Delete a scan history record (owner-gated server-side)
export async function deleteScanHistory(id: string): Promise<boolean> {
  try {
    await graphqlRequest(DELETE_SCAN, { input: { id } });
    return true;
  } catch (err) {
    console.error('deleteScanHistory error:', err);
    return false;
  }
}

// ─── Smart Warning Engine ─────────────────────────────────
// Cross-references product allergens/ingredients with user health profile

export function generateWarnings(
  profile: HealthProfile,
  productAllergens: string[],
  ingredientsList: string[],
): string[] {
  const warnings: string[] = [];
  const allIngredients = ingredientsList.map((i) => i.toLowerCase()).join(' ');

  // Check allergens
  profile.allergies.forEach((allergy) => {
    const a = allergy.toLowerCase();
    const match = productAllergens.find((pa) => pa.toLowerCase().includes(a));
    if (match) warnings.push(`⚠️ Contains ${match} — you are allergic to ${allergy}`);
  });

  // Check intolerances
  profile.intolerances.forEach((intol) => {
    const i = intol.toLowerCase();
    if (allIngredients.includes(i)) {
      warnings.push(`⚠️ May contain ${intol} — you have an intolerance`);
    }
  });

  // Check medical conditions
  if (profile.conditions.includes('diabetes') || profile.conditions.includes('Type 2 Diabetes')) {
    if (allIngredients.includes('sugar') || allIngredients.includes('glucose') || allIngredients.includes('syrup')) {
      warnings.push('🩺 High sugar content — be cautious with your diabetes');
    }
  }
  if (profile.conditions.includes('hypertension') || profile.conditions.includes('High Blood Pressure')) {
    if (allIngredients.includes('salt') || allIngredients.includes('sodium')) {
      warnings.push('🩺 Contains salt/sodium — monitor intake with your blood pressure condition');
    }
  }
  if (profile.conditions.includes('Coeliac Disease')) {
    if (allIngredients.includes('gluten') || allIngredients.includes('wheat') || allIngredients.includes('barley')) {
      warnings.push('🩺 Contains gluten — not safe for Coeliac Disease');
    }
  }

  // Check diet type
  if (profile.dietType === 'vegan') {
    const nonVegan = ['milk', 'egg', 'honey', 'gelatin', 'whey', 'casein', 'lactose'];
    nonVegan.forEach((item) => {
      if (allIngredients.includes(item)) {
        warnings.push(`🌱 Contains ${item} — not suitable for vegans`);
      }
    });
  }
  if (profile.dietType === 'vegetarian') {
    const nonVeg = ['gelatin', 'lard', 'rennet', 'anchovies'];
    nonVeg.forEach((item) => {
      if (allIngredients.includes(item)) {
        warnings.push(`🥗 Contains ${item} — not suitable for vegetarians`);
      }
    });
  }

  return warnings;
}
