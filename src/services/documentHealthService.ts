// src/services/documentHealthService.ts
// User uploads medical reports, prescriptions, blood tests etc.
// Claude reads them and extracts structured health data to pre-fill the profile

import { HealthProfile, Medication } from './userDataService';
import { isAIConfigured, postClaudeMessages } from './aiProxy';
import { AppError } from '../utils/AppError';

const MODEL = 'claude-sonnet-4-6';

export interface TestResult {
  name: string;                                    // e.g. "Total Cholesterol"
  value: string;                                    // e.g. "5.2 mmol/L"
  range?: string;                                   // e.g. "Normal: <5.0 mmol/L"
  flag?: 'normal' | 'high' | 'low' | 'abnormal';
}

export interface ExtractedHealthData {
  allergies: string[];
  intolerances: string[];
  conditions: string[];
  medications: Medication[];
  dietType?: string;
  dietaryRestrictions: string[];
  healthGoals: string[];
  age?: number;
  gender?: string;
  weightKg?: number;
  heightCm?: number;
  testResults: TestResult[];   // numeric lab/test values found, with reference ranges
  extractedNotes: string;      // summary of what was found
  confidence: 'high' | 'medium' | 'low';
  sourceDocuments: string[];   // which files contributed what
  warnings: string[];          // anything Claude flagged as unclear
}

export interface UploadedDocument {
  name: string;
  type: string;          // 'pdf' | 'image' | 'text'
  base64: string;
  mediaType: string;     // 'application/pdf' | 'image/jpeg' etc.
}

// ─── Main extraction function ─────────────────────────────

// Max images per API call — large base64 payloads cause React Native fetch to fail
export const BATCH_SIZE = 2;

// Hard cap on documents per upload session — keeps requests fast and bounded
export const MAX_DOCUMENTS = 6;

// Returns null if `signal` was aborted (i.e. the user hit Cancel) — callers
// should treat that as "just go back", not as a failed extraction.
export async function extractHealthDataFromDocuments(
  documents: UploadedDocument[],
  onProgress?: (documentsDone: number, documentsTotal: number) => void,
  signal?: AbortSignal,
): Promise<ExtractedHealthData | null> {
  if (!isAIConfigured()) {
    return getMockExtraction(documents);
  }

  try {
    // Split into batches of BATCH_SIZE to keep request bodies small enough
    const batches: UploadedDocument[][] = [];
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      batches.push(documents.slice(i, i + BATCH_SIZE));
    }

    // Process each batch and merge results
    const allResults: ExtractedHealthData[] = [];
    let documentsDone = 0;
    for (const batch of batches) {
      if (signal?.aborted) return null;
      const result = await extractBatch(batch, signal);
      allResults.push(result);
      documentsDone = Math.min(documentsDone + batch.length, documents.length);
      onProgress?.(documentsDone, documents.length);
    }

    return mergeExtractions(allResults, documents.map((d) => d.name));
  } catch (err) {
    if (signal?.aborted) return null;
    console.error('Document extraction error:', err);
    return getErrorResult(documents.map((d) => d.name));
  }
}

async function extractBatch(
  documents: UploadedDocument[],
  externalSignal?: AbortSignal,
): Promise<ExtractedHealthData> {
  const contentBlocks: any[] = [];

  contentBlocks.push({
    type: 'text',
    text: `I am uploading ${documents.length} medical document(s). Please extract all health-relevant information from them.`,
  });

  for (const doc of documents) {
    contentBlocks.push({ type: 'text', text: `\n--- Document: ${doc.name} ---` });

    if (doc.type === 'pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: doc.base64 },
      });
    } else if (doc.type === 'image') {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: doc.mediaType, data: doc.base64 },
      });
    } else {
      contentBlocks.push({ type: 'text', text: atob(doc.base64) });
    }
  }

  contentBlocks.push({ type: 'text', text: EXTRACTION_PROMPT });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s per batch
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await postClaudeMessages({
      model: MODEL,
      max_tokens: 2048,
      messages: [{ role: 'user', content: contentBlocks }],
    }, controller.signal);

    if (!response.ok) {
      const errBody = await response.text();
      throw new AppError('apiError', `API ${response.status}: ${errBody.slice(0, 200)}`, { status: response.status });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new AppError('noJsonResponse', 'No JSON in response');

    return formatExtractedData(JSON.parse(jsonMatch[0]), documents.map((d) => d.name));
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

// Merge multiple batch results into one combined ExtractedHealthData
function mergeExtractions(
  results: ExtractedHealthData[],
  sourceDocuments: string[],
): ExtractedHealthData {
  if (results.length === 1) return { ...results[0], sourceDocuments };

  const merged: ExtractedHealthData = {
    allergies: [],
    intolerances: [],
    conditions: [],
    medications: [],
    dietaryRestrictions: [],
    healthGoals: [],
    testResults: [],
    warnings: [],
    extractedNotes: '',
    confidence: 'high',
    sourceDocuments,
  };

  for (const r of results) {
    merged.allergies = dedup([...merged.allergies, ...r.allergies]);
    merged.intolerances = dedup([...merged.intolerances, ...r.intolerances]);
    merged.conditions = dedup([...merged.conditions, ...r.conditions]);
    merged.dietaryRestrictions = dedup([...merged.dietaryRestrictions, ...r.dietaryRestrictions]);
    merged.healthGoals = dedup([...merged.healthGoals, ...r.healthGoals]);
    merged.warnings = [...merged.warnings, ...r.warnings];
    merged.medications = mergeMeds(merged.medications, r.medications);
    merged.testResults = mergeTestResults(merged.testResults, r.testResults);
    merged.age = merged.age || r.age;
    merged.gender = merged.gender || r.gender;
    merged.weightKg = merged.weightKg || r.weightKg;
    merged.heightCm = merged.heightCm || r.heightCm;
    merged.dietType = merged.dietType || r.dietType;
    if (r.confidence === 'low') merged.confidence = 'low';
    else if (r.confidence === 'medium' && merged.confidence !== 'low') merged.confidence = 'medium';
    if (r.extractedNotes) merged.extractedNotes += (merged.extractedNotes ? ' | ' : '') + r.extractedNotes;
  }

  return merged;
}

function dedup(arr: string[]): string[] {
  return arr.filter((v, i, a) => a.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
}

function mergeMeds(existing: any[], newMeds: any[]): any[] {
  const combined = [...existing];
  for (const med of newMeds) {
    if (!combined.some((e) => e.name.toLowerCase() === med.name.toLowerCase())) {
      combined.push(med);
    }
  }
  return combined;
}

// The same lab test often comes back with slightly different wording between
// uploads/extractions — e.g. "Epithelial Cells (Urine)" vs "Epithelial Cells" —
// so comparing on a normalised key (dropping parenthetical qualifiers and
// punctuation) catches those as the same test instead of two separate results.
function normalizeTestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Same rule as DocumentUploadScreen's profile-level merge: a same-named result from a
// later batch supersedes an earlier one instead of the first-seen value winning, so
// uploading an old report alongside a newer one doesn't lock in the stale reading.
function mergeTestResults(existing: TestResult[], newResults: TestResult[] = []): TestResult[] {
  const combined = existing.filter((e) => !newResults.some((t) => normalizeTestName(t.name) === normalizeTestName(e.name)));
  return [...combined, ...newResults];
}

// ─── Prompt ───────────────────────────────────────────────

const EXTRACTION_PROMPT = `
Extract ALL health-relevant information from the above medical document(s).

Be thorough — look for:
- Diagnosed medical conditions / diseases
- Allergies (food, drug, environmental)
- Food intolerances
- Current medications with dosages
- Diet restrictions or recommendations
- Patient demographics (age, gender, weight, height, BMI)
- Health goals mentioned by doctor
- Any intolerances or sensitivities noted
- Numeric test/lab results — e.g. cholesterol, HbA1c, blood glucose, blood pressure,
  vitamin D, thyroid (TSH), kidney/liver function, blood counts. Capture the actual
  measured value AND the reference range if the document states one, and flag
  whether it's within range.
- Prescription items

IMPORTANT RULES:
- Only extract information that is clearly stated — do not infer or guess
- For medications, extract name and dosage if available
- For test results, only include ones with an actual numeric/measured value in the
  document — do not invent reference ranges the document doesn't state
- Keep each test result's "value" short — the number and unit only (e.g. "7.1%",
  "138/88 mmHg"). Never add commentary, caveats, or parenthetical notes about
  legibility inside "value" — if a reading is unclear or partially obscured, either
  omit that test result entirely or note it in "warnings" instead
- If something is mentioned as "history of" or "resolved", still include it with a note
- Be conservative — mark confidence as "low" if the document is unclear or partially readable
- Never fabricate information not present in the documents

Respond ONLY in this exact JSON format:
{
  "allergies": ["Penicillin", "Peanuts"],
  "intolerances": ["Lactose"],
  "conditions": ["Type 2 Diabetes", "Hypertension"],
  "medications": [
    { "name": "Metformin", "dosage": "500mg", "frequency": "Twice daily", "reason": "Type 2 Diabetes" },
    { "name": "Lisinopril", "dosage": "10mg", "frequency": "Once daily", "reason": "Hypertension" }
  ],
  "dietType": "Low carbohydrate",
  "dietaryRestrictions": ["Low sodium", "Low sugar"],
  "healthGoals": ["Manage blood sugar", "Reduce blood pressure"],
  "age": 45,
  "gender": "Male",
  "weightKg": 82,
  "heightCm": 175,
  "testResults": [
    { "name": "HbA1c", "value": "7.1%", "range": "Normal: <5.7%", "flag": "high" },
    { "name": "Total Cholesterol", "value": "4.8 mmol/L", "range": "Normal: <5.0 mmol/L", "flag": "normal" },
    { "name": "Blood Pressure", "value": "138/88 mmHg", "range": "Normal: <120/80 mmHg", "flag": "high" }
  ],
  "extractedNotes": "Patient has Type 2 Diabetes diagnosed 2019, currently well-controlled on Metformin. Hypertension managed with Lisinopril. Advised low-carb, low-sodium diet.",
  "confidence": "high",
  "warnings": ["Blood test results from 2021 — may be outdated"]
}

"flag" must be one of: "normal", "high", "low", "abnormal". Omit "range"/"flag" for a
test if the document doesn't state a reference range. If a field has no data, use an
empty array [] or null. Never omit a field.
`;

// ─── Formatters ───────────────────────────────────────────

function formatExtractedData(
  parsed: any,
  sourceDocuments: string[],
): ExtractedHealthData {
  return {
    allergies: parsed.allergies || [],
    intolerances: parsed.intolerances || [],
    conditions: parsed.conditions || [],
    medications: (parsed.medications || []).map((m: any) => ({
      name: m.name || '',
      dosage: m.dosage || '',
      frequency: m.frequency || '',
      reason: m.reason || '',
    })),
    dietType: parsed.dietType || '',
    dietaryRestrictions: parsed.dietaryRestrictions || [],
    healthGoals: parsed.healthGoals || [],
    age: parsed.age || undefined,
    gender: parsed.gender || undefined,
    weightKg: parsed.weightKg || undefined,
    heightCm: parsed.heightCm || undefined,
    testResults: (parsed.testResults || []).map((t: any) => ({
      name: t.name || '',
      value: t.value || '',
      range: t.range || undefined,
      flag: t.flag || undefined,
    })),
    extractedNotes: parsed.extractedNotes || '',
    confidence: parsed.confidence || 'low',
    sourceDocuments,
    warnings: parsed.warnings || [],
  };
}

function getErrorResult(sourceDocuments: string[]): ExtractedHealthData {
  return {
    allergies: [], intolerances: [], conditions: [],
    medications: [], dietaryRestrictions: [], healthGoals: [], testResults: [],
    extractedNotes: 'Could not read the document. Please try again or enter your details manually.',
    confidence: 'low',
    sourceDocuments,
    warnings: ['Document could not be processed'],
  };
}

// ─── Mock for development ─────────────────────────────────

function getMockExtraction(documents: UploadedDocument[]): ExtractedHealthData {
  return {
    allergies: ['Penicillin', 'Peanuts'],
    intolerances: ['Lactose'],
    conditions: ['Type 2 Diabetes', 'Hypertension'],
    medications: [
      { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', reason: 'Type 2 Diabetes' },
      { name: 'Lisinopril', dosage: '10mg', frequency: 'Once daily', reason: 'Hypertension' },
    ],
    dietType: 'Low carbohydrate',
    dietaryRestrictions: ['Low sodium', 'Low sugar'],
    healthGoals: ['Manage blood sugar', 'Reduce blood pressure'],
    age: 45,
    gender: 'Male',
    weightKg: 82,
    heightCm: 175,
    testResults: [
      { name: 'HbA1c', value: '7.1%', range: 'Normal: <5.7%', flag: 'high' },
      { name: 'Total Cholesterol', value: '4.8 mmol/L', range: 'Normal: <5.0 mmol/L', flag: 'normal' },
      { name: 'Blood Pressure', value: '138/88 mmHg', range: 'Normal: <120/80 mmHg', flag: 'high' },
    ],
    extractedNotes: `Found ${documents.length} document(s). Extracted: Type 2 Diabetes (well-controlled on Metformin), Hypertension (on Lisinopril), Peanut & Penicillin allergies, Lactose intolerance. Doctor advised low-carb, low-sodium diet.`,
    confidence: 'high',
    sourceDocuments: documents.map((d) => d.name),
    warnings: ['Demo mode — add your Anthropic API key for real document reading'],
  };
}
