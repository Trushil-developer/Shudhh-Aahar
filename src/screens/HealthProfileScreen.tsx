import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, StatusBar,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useAppConfig } from '../context/AppConfigContext';
import { saveHealthProfile, HealthProfile, HealthTestResult, DEFAULT_HEALTH_PROFILE } from '../services/userDataService';
import DocumentUploadScreen from './DocumentUploadScreen';
import { Colors, Shadow } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';

// STEPS is kept only for `.length` / indexing — the displayed step title now
// comes from STEP_KEYS via t(), so translations stay in sync automatically.
const STEPS = ['Allergies', 'Conditions', 'Diet & Lifestyle', 'Goals'];
const STEP_KEYS = ['allergies', 'stepConditions', 'stepDietLifestyle', 'stepGoals'];

const COMMON_ALLERGIES    = ['Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Wheat/Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame'];
const COMMON_INTOLERANCES = ['Lactose', 'Gluten', 'Fructose', 'Histamine', 'Caffeine', 'Alcohol', 'Sulphites'];
const COMMON_CONDITIONS   = ['Type 1 Diabetes', 'Type 2 Diabetes', 'Hypertension', 'Coeliac Disease', 'Crohn\'s Disease', 'IBS', 'High Cholesterol', 'Heart Disease', 'Kidney Disease', 'Anaemia', 'Thyroid Condition', 'PCOS'];
const DIET_TYPES          = ['None', 'Vegan', 'Vegetarian', 'Pescatarian', 'Halal', 'Kosher', 'Keto', 'Paleo', 'Low FODMAP'];
const EXERCISE_LEVELS     = ['Sedentary', 'Light (1-2x/week)', 'Moderate (3-4x/week)', 'Active (5+x/week)'];
const HEALTH_GOALS        = ['Lose Weight', 'Reduce Sugar', 'Reduce Salt', 'Avoid Allergens', 'Eat More Protein', 'Improve Heart Health', 'Manage Diabetes', 'Build Muscle', 'Eat Cleaner'];

// These predefined lists are a fixed, app-defined vocabulary (unlike custom
// user-typed items), so their displayed labels are translated — but the
// underlying stored value stays the canonical English string, since that's
// the identifier other parts of the app (and this screen's own toggle/
// isSelected matching) compare against.
const ALLERGY_LABELS: Record<string, string> = {
  'Peanuts': 'allergyPeanuts', 'Tree Nuts': 'allergyTreeNuts', 'Milk': 'allergyMilk', 'Eggs': 'allergyEggs',
  'Wheat/Gluten': 'allergyWheatGluten', 'Soy': 'allergySoy', 'Fish': 'allergyFish', 'Shellfish': 'allergyShellfish', 'Sesame': 'allergySesame',
};
const INTOLERANCE_LABELS: Record<string, string> = {
  'Lactose': 'intoleranceLactose', 'Gluten': 'intoleranceGluten', 'Fructose': 'intoleranceFructose',
  'Histamine': 'intoleranceHistamine', 'Caffeine': 'intoleranceCaffeine', 'Alcohol': 'intoleranceAlcohol', 'Sulphites': 'intoleranceSulphites',
};
const CONDITION_LABELS: Record<string, string> = {
  'Type 1 Diabetes': 'conditionType1Diabetes', 'Type 2 Diabetes': 'conditionType2Diabetes', 'Hypertension': 'conditionHypertension',
  'Coeliac Disease': 'conditionCoeliacDisease', "Crohn's Disease": 'conditionCrohnsDisease', 'IBS': 'conditionIbs',
  'High Cholesterol': 'conditionHighCholesterol', 'Heart Disease': 'conditionHeartDisease', 'Kidney Disease': 'conditionKidneyDisease',
  'Anaemia': 'conditionAnaemia', 'Thyroid Condition': 'conditionThyroid', 'PCOS': 'conditionPcos',
};
const DIET_TYPE_LABELS: Record<string, string> = {
  'None': 'dietNone', 'Vegan': 'dietVegan', 'Vegetarian': 'dietVegetarian', 'Pescatarian': 'dietPescatarian',
  'Halal': 'dietHalal', 'Kosher': 'dietKosher', 'Keto': 'dietKeto', 'Paleo': 'dietPaleo', 'Low FODMAP': 'dietLowFodmap',
};
const EXERCISE_LEVEL_LABELS: Record<string, string> = {
  'Sedentary': 'exerciseSedentary', 'Light (1-2x/week)': 'exerciseLight', 'Moderate (3-4x/week)': 'exerciseModerate', 'Active (5+x/week)': 'exerciseActive',
};
const HEALTH_GOAL_LABELS: Record<string, string> = {
  'Lose Weight': 'goalLoseWeight', 'Reduce Sugar': 'goalReduceSugar', 'Reduce Salt': 'goalReduceSalt', 'Avoid Allergens': 'goalAvoidAllergens',
  'Eat More Protein': 'goalEatMoreProtein', 'Improve Heart Health': 'goalImproveHeartHealth', 'Manage Diabetes': 'goalManageDiabetes',
  'Build Muscle': 'goalBuildMuscle', 'Eat Cleaner': 'goalEatCleaner',
};

// Looks up the translated display label for a predefined value; falls back
// to the raw value untranslated for custom/user-entered items that aren't
// in the map (e.g. a condition the user typed in themselves).
function chipLabel(value: string, labels: Record<string, string>, t: (key: string) => string): string {
  const key = labels[value];
  return key ? t(`healthProfile.${key}`) : value;
}

// Items in the profile array that are not in the predefined list
function getCustomItems(profileItems: string[] = [], predefined: string[]): string[] {
  return profileItems.filter(
    item => !predefined.some(p => p.toLowerCase() === item.toLowerCase()),
  );
}

function hasExistingProfile(hp: HealthProfile): boolean {
  return (hp.allergies?.length || 0) > 0
    || (hp.intolerances?.length || 0) > 0
    || (hp.conditions?.length || 0) > 0
    || (hp.medications?.length || 0) > 0
    || (hp.healthGoals?.length || 0) > 0
    || !!hp.dietType;
}

function calcBMI(weightKg?: number, heightCm?: number): number | null {
  if (!weightKg || !heightCm) return null;
  const h = heightCm / 100;
  return Math.round((weightKg / (h * h)) * 10) / 10;
}

function bmiStatus(bmi: number, t: (key: string) => string): { label: string; color: string } {
  if (bmi < 18.5) return { label: t('healthProfile.bmiUnderweight'), color: Colors.caution };
  if (bmi < 25)   return { label: t('healthProfile.bmiNormal'), color: Colors.safe };
  if (bmi < 30)   return { label: t('healthProfile.bmiOverweight'), color: Colors.caution };
  return { label: t('healthProfile.bmiObese'), color: Colors.danger };
}

// ── Inline edit modal — lets the user correct a saved value directly from
// the report, the same way they can on the document-upload review screen ──
type ChipField = 'allergies' | 'intolerances' | 'conditions' | 'healthGoals';
type MetricField = 'age' | 'weightKg' | 'heightCm' | 'gender';

interface EditFieldSpec {
  key: string;
  label: string;
  keyboardType?: 'default' | 'numeric';
}

interface EditState {
  kind: 'chip' | 'medication' | 'testResult' | 'metric';
  title: string;
  fields: EditFieldSpec[];
  showFlag?: boolean;
  chipField?: ChipField;
  originalValue?: string;
  medIndex?: number;
  originalTestName?: string;
  metricField?: MetricField;
}

// Sane min/max bounds for numeric profile metrics — anything outside these
// is rejected rather than silently accepted (see handleEditSave).
const METRIC_BOUNDS: Partial<Record<MetricField, [number, number]>> = {
  age: [0, 120],
  weightKg: [1, 500],
  heightCm: [30, 300],
};

export default function HealthProfileScreen({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation();
  const { user, healthProfile, updateHealthProfile } = useAuth();
  const { config: appConfig } = useAppConfig();
  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const existingData = hasExistingProfile(healthProfile);
  const [mode, setMode] = useState<'view' | 'edit'>(existingData ? 'view' : 'edit');
  const [step, setStep]   = useState(0);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<HealthProfile>({
    ...DEFAULT_HEALTH_PROFILE,
    ...healthProfile,
    allergies:           healthProfile.allergies           ?? [],
    intolerances:        healthProfile.intolerances         ?? [],
    conditions:          healthProfile.conditions           ?? [],
    medications:         healthProfile.medications          ?? [],
    dietaryRestrictions: healthProfile.dietaryRestrictions  ?? [],
    healthGoals:         healthProfile.healthGoals          ?? [],
  });
  const [showDocUpload, setShowDocUpload] = useState(false);

  const [editing, setEditing] = useState<EditState | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editFlag, setEditFlag] = useState<HealthTestResult['flag'] | undefined>(undefined);
  const [editSaving, setEditSaving] = useState(false);

  const openChipEdit = (field: ChipField, value: string, singular: string) => {
    setEditValues({ value });
    setEditFlag(undefined);
    setEditing({ kind: 'chip', title: t('healthProfile.editItemTitle', { item: singular }), chipField: field, originalValue: value, fields: [{ key: 'value', label: singular }] });
  };

  const openMedicationEdit = (index: number) => {
    const med = profile.medications[index];
    if (!med) return;
    setEditValues({ name: med.name || '', dosage: med.dosage || '', frequency: med.frequency || '', reason: med.reason || '' });
    setEditFlag(undefined);
    setEditing({
      kind: 'medication', title: t('healthProfile.editMedicationTitle'), medIndex: index,
      fields: [
        { key: 'name', label: t('healthProfile.fieldName') },
        { key: 'dosage', label: t('healthProfile.fieldDosage') },
        { key: 'frequency', label: t('healthProfile.fieldFrequency') },
        { key: 'reason', label: t('healthProfile.fieldReason') },
      ],
    });
  };

  const openTestResultEdit = (name: string) => {
    const testResult = profile.testResults.find(x => x.name === name);
    if (!testResult) return;
    setEditValues({ name: testResult.name, value: testResult.value, range: testResult.range || '' });
    setEditFlag(testResult.flag);
    setEditing({
      kind: 'testResult', title: t('healthProfile.editTestResultTitle'), originalTestName: name, showFlag: true,
      fields: [
        { key: 'name', label: t('healthProfile.fieldTestName') },
        { key: 'value', label: t('healthProfile.fieldResult') },
        { key: 'range', label: t('healthProfile.fieldReferenceRange') },
      ],
    });
  };

  const openMetricEdit = (field: MetricField, label: string) => {
    const current = profile[field];
    setEditValues({ value: current != null ? String(current) : '' });
    setEditFlag(undefined);
    setEditing({
      kind: 'metric', title: t('healthProfile.editItemTitle', { item: label }), metricField: field,
      fields: [{ key: 'value', label, keyboardType: field === 'gender' ? 'default' : 'numeric' }],
    });
  };

  // Applies the pending edit to a fresh profile object and persists it before
  // committing to local/context state — a failed save can't leave the report
  // showing a change that never actually made it to the server.
  const commitProfileChange = async (updater: (p: HealthProfile) => HealthProfile) => {
    if (!user) return;
    const updated = updater(profile);
    setEditSaving(true);
    const ok = await saveHealthProfile(user.id, updated);
    setEditSaving(false);
    if (ok) {
      setProfile(updated);
      updateHealthProfile(updated);
      setEditing(null);
    } else {
      Alert.alert(t('common.error'), t('healthProfile.saveChangeError'));
    }
  };

  const handleEditSave = () => {
    if (!editing) return;

    if (editing.kind === 'chip' && editing.chipField && editing.originalValue != null) {
      const chipField = editing.chipField;
      const originalValue = editing.originalValue;
      const newValue = (editValues.value || '').trim();
      commitProfileChange(p => {
        const list = (p[chipField] as string[]) || [];
        const updatedList = newValue
          ? list.map(v => (v.toLowerCase() === originalValue.toLowerCase() ? newValue : v))
          : list.filter(v => v.toLowerCase() !== originalValue.toLowerCase());
        return { ...p, [chipField]: updatedList };
      });
    } else if (editing.kind === 'medication' && editing.medIndex != null) {
      const medIndex = editing.medIndex;
      commitProfileChange(p => ({
        ...p,
        medications: p.medications.map((m, i) => i === medIndex ? {
          name: (editValues.name || '').trim() || m.name,
          dosage: (editValues.dosage || '').trim() || undefined,
          frequency: (editValues.frequency || '').trim() || undefined,
          reason: (editValues.reason || '').trim() || undefined,
        } : m),
      }));
    } else if (editing.kind === 'testResult' && editing.originalTestName) {
      const originalTestName = editing.originalTestName;
      commitProfileChange(p => ({
        ...p,
        testResults: p.testResults.map(t => t.name === originalTestName ? {
          ...t,
          name: (editValues.name || '').trim() || t.name,
          value: (editValues.value || '').trim() || t.value,
          range: (editValues.range || '').trim() || undefined,
          flag: editFlag,
        } : t),
      }));
    } else if (editing.kind === 'metric' && editing.metricField) {
      const raw = (editValues.value || '').trim();
      const metricField = editing.metricField;

      if (metricField === 'gender') {
        commitProfileChange(p => ({ ...p, gender: raw || undefined }));
        return;
      }
      if (!raw) {
        commitProfileChange(p => ({ ...p, [metricField]: undefined }));
        return;
      }
      // Validate the parsed number is finite and within a sane range before
      // accepting it — a bare Number(raw) would silently let NaN or a
      // negative/garbage value through and corrupt every downstream
      // calculation (BMI, BMR, nutrient percentages) with no visible error.
      const num = Number(raw);
      const bounds = METRIC_BOUNDS[metricField];
      if (!bounds || !Number.isFinite(num) || num < bounds[0] || num > bounds[1]) {
        Alert.alert(
          t('healthProfile.invalidValueTitle'),
          bounds ? t('healthProfile.invalidValueRangeMessage', { min: bounds[0], max: bounds[1] }) : t('healthProfile.invalidValueMessage'),
        );
        return;
      }
      commitProfileChange(p => ({ ...p, [metricField]: num }));
    }
  };

  if (showDocUpload) {
    return (
      <DocumentUploadScreen
        existingProfile={profile}
        onComplete={(updated) => { setProfile(updated); updateHealthProfile(updated); setMode('view'); setShowDocUpload(false); }}
        onSkip={() => setShowDocUpload(false)}
      />
    );
  }

  // ── View mode — show existing data first ────────────────
  if (mode === 'view') {
    const bmi = calcBMI(profile.weightKg, profile.heightCm);
    const bmiInfo = bmi != null ? bmiStatus(bmi, t) : null;

    return (
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <View style={s.header}>
          <View style={s.headerTop}>
            <Text style={s.headerTitle}>{t('healthProfile.headerTitle')}</Text>
            <TouchableOpacity onPress={onComplete}>
              <Text style={s.skipLink}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scrollContent, isTablet && s.scrollCenterWrap]}>
        <View style={isTablet ? s.tabletContent : s.fullWidthContent}>

          {appConfig.documentUploadEnabled && <DocumentUploadPrompt onPress={() => setShowDocUpload(true)} />}

          <Text style={s.editHint}>{t('healthProfile.editHint')}</Text>

          {/* Vitals */}
          {(profile.age || profile.weightKg || profile.heightCm) && (
            <View style={s.vitalsCard}>
              <Text style={s.reportSectionLabel}>{t('healthProfile.vitalsLabel')}</Text>
              <View style={s.vitalsRow}>
                {profile.age      ? <VitalStat label={t('healthProfile.age')} value={`${profile.age}`} unit={t('healthProfile.unitYears')} onEdit={() => openMetricEdit('age', t('healthProfile.age'))} /> : null}
                {profile.heightCm ? <VitalStat label={t('healthProfile.height')} value={`${profile.heightCm}`} unit={t('healthProfile.unitCm')} onEdit={() => openMetricEdit('heightCm', t('healthProfile.height'))} /> : null}
                {profile.weightKg ? <VitalStat label={t('healthProfile.weight')} value={`${profile.weightKg}`} unit={t('healthProfile.unitKg')} onEdit={() => openMetricEdit('weightKg', t('healthProfile.weight'))} /> : null}
                {bmi != null && bmiInfo ? <VitalStat label={t('healthProfile.bmi')} value={`${bmi}`} unit={bmiInfo.label} unitColor={bmiInfo.color} last /> : null}
              </View>
            </View>
          )}

          {/* Allergies */}
          {(profile.allergies.length > 0 || profile.allergyNotes) && (
            <ReportSection icon="⚠" title={t('healthProfile.allergies')} count={profile.allergies.length} accent={Colors.danger}>
              {profile.allergies.length > 0 && (
                <View style={s.viewChips}>
                  {profile.allergies.map((a, i) => (
                    <TouchableOpacity key={i} style={[s.viewChip, s.viewChipDanger]} onPress={() => openChipEdit('allergies', a, t('healthProfile.allergySingular'))} activeOpacity={0.7}>
                      <Text style={[s.viewChipText, { color: Colors.danger }]}>{chipLabel(a, ALLERGY_LABELS, t)} ✎</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {profile.allergyNotes ? <Text style={s.viewNoteText}>{profile.allergyNotes}</Text> : null}
            </ReportSection>
          )}

          {/* Intolerances */}
          {profile.intolerances.length > 0 && (
            <ReportSection icon="◐" title={t('healthProfile.intolerances')} count={profile.intolerances.length} accent={Colors.caution}>
              <View style={s.viewChips}>
                {profile.intolerances.map((a, i) => (
                  <TouchableOpacity key={i} style={[s.viewChip, s.viewChipAmber]} onPress={() => openChipEdit('intolerances', a, t('healthProfile.intoleranceSingular'))} activeOpacity={0.7}>
                    <Text style={[s.viewChipText, { color: Colors.caution }]}>{chipLabel(a, INTOLERANCE_LABELS, t)} ✎</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ReportSection>
          )}

          {/* Conditions */}
          {(profile.conditions.length > 0 || profile.conditionNotes) && (
            <ReportSection icon="✚" title={t('healthProfile.medicalConditions')} count={profile.conditions.length} accent={Colors.navy}>
              {profile.conditions.length > 0 && (
                <View style={s.viewChips}>
                  {profile.conditions.map((c, i) => (
                    <TouchableOpacity key={i} style={[s.viewChip, s.viewChipNavy]} onPress={() => openChipEdit('conditions', c, t('healthProfile.medicalConditionSingular'))} activeOpacity={0.7}>
                      <Text style={[s.viewChipText, { color: Colors.navy }]}>{chipLabel(c, CONDITION_LABELS, t)} ✎</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {profile.conditionNotes ? <Text style={s.viewNoteText}>{profile.conditionNotes}</Text> : null}
            </ReportSection>
          )}

          {/* Medications */}
          {profile.medications.length > 0 && (
            <ReportSection icon="💊" title={t('healthProfile.medications')} count={profile.medications.length} accent={Colors.info}>
              {profile.medications.map((m, i) => (
                <View key={i} style={[s.viewMedRow, i === profile.medications.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.viewMedDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.viewMedName}>{m.name}{m.dosage ? ` · ${m.dosage}` : ''}</Text>
                    {(m.frequency || m.reason) ? (
                      <Text style={s.viewMedDetail}>{[m.frequency, m.reason ? t('healthProfile.medicationReasonSuffix', { reason: m.reason }) : null].filter(Boolean).join(' · ')}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => openMedicationEdit(i)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.rowEditBtn}>
                    <Text style={s.rowEditBtnText}>✎</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ReportSection>
          )}

          {/* Diet & Goals */}
          {(profile.dietType || profile.healthGoals.length > 0) && (
            <ReportSection icon="✓" title={t('healthProfile.dietAndGoals')} accent={Colors.safe}>
              <View style={s.viewChips}>
                {profile.dietType ? (
                  <View style={[s.viewChip, s.viewChipNavy]}>
                    <Text style={[s.viewChipText, { color: Colors.navy }]}>{chipLabel(profile.dietType, DIET_TYPE_LABELS, t)}</Text>
                  </View>
                ) : null}
                {profile.healthGoals.map((g, i) => (
                  <TouchableOpacity key={i} style={[s.viewChip, s.viewChipGreen]} onPress={() => openChipEdit('healthGoals', g, t('healthProfile.healthGoalSingular'))} activeOpacity={0.7}>
                    <Text style={[s.viewChipText, { color: Colors.safe }]}>{chipLabel(g, HEALTH_GOAL_LABELS, t)} ✎</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ReportSection>
          )}

          {/* Test results — from uploaded reports */}
          {profile.testResults.length > 0 && (
            <ReportSection icon="🧪" title={t('healthProfile.testResults')} count={profile.testResults.length} accent={Colors.info}>
              <View style={s.testTableHead}>
                <Text style={s.testTableHeadText}>{t('healthProfile.testTableTest')}</Text>
                <Text style={s.testTableHeadText}>{t('healthProfile.testTableResult')}</Text>
              </View>
              {profile.testResults.map((test, i) => {
                const flagColor = test.flag === 'high' || test.flag === 'abnormal' ? Colors.danger
                  : test.flag === 'low' ? Colors.caution : Colors.safe;
                return (
                  <View key={i} style={[s.testRow, i === profile.testResults.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={s.testNameCol}>
                      <Text style={s.viewMedName} numberOfLines={2}>{test.name}</Text>
                      {test.range ? <Text style={s.viewMedDetail} numberOfLines={1}>{t('healthProfile.refRangeLabel', { range: test.range })}</Text> : null}
                    </View>
                    <View style={s.testValueCol}>
                      <Text style={[s.testValue, { color: flagColor }]} numberOfLines={2} ellipsizeMode="tail">{test.value}</Text>
                      {test.flag ? (
                        <View style={[s.testFlagPill, { backgroundColor: flagColor + '15', borderColor: flagColor + '40' }]}>
                          <Text style={[s.testFlagText, { color: flagColor }]}>{t(`healthProfile.testFlag_${test.flag}`)}</Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => openTestResultEdit(test.name)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={s.rowEditBtn}>
                      <Text style={s.rowEditBtnText}>✎</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ReportSection>
          )}

          <Text style={s.reportFooter}>
            {t('healthProfile.reportFooter')}
          </Text>

          <View style={{ height: rh(100) }} />
        </View>
        </ScrollView>

        {/* Edit button */}
        <View style={s.bottomNav}>
          <TouchableOpacity
            style={[s.nextBtn, { flex: 1 }]}
            onPress={() => { setStep(0); setMode('edit'); }}
            activeOpacity={0.88}
          >
            <Text style={s.nextBtnText}>{t('healthProfile.editProfileButton')}</Text>
          </TouchableOpacity>
        </View>

        <EditModal
          editing={editing}
          values={editValues}
          onChangeValue={(key, v) => setEditValues(prev => ({ ...prev, [key]: v }))}
          flag={editFlag}
          onChangeFlag={setEditFlag}
          saving={editSaving}
          onCancel={() => setEditing(null)}
          onSave={handleEditSave}
        />
      </SafeAreaView>
    );
  }

  // Case-insensitive toggle — keeps the original casing of existing values
  const toggle = (field: keyof HealthProfile, value: string) => {
    const current = (profile[field] as string[]) || [];
    const exists = current.some(v => v.toLowerCase() === value.toLowerCase());
    const updated = exists
      ? current.filter(v => v.toLowerCase() !== value.toLowerCase())
      : [...current, value];
    setProfile(p => ({ ...p, [field]: updated }));
  };

  const isSelected = (field: keyof HealthProfile, value: string) =>
    ((profile[field] as string[]) || []).some(v => v.toLowerCase() === value.toLowerCase());

  const handleSave = async () => {
    if (!user) return;

    // Guard against silently wiping out previously-saved data — e.g. if local
    // state ever goes stale and the wizard opens blank despite real data
    // sitting on the server, this stops that blank profile from overwriting it.
    if (hasExistingProfile(healthProfile) && !hasExistingProfile(profile)) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          t('healthProfile.clearDataTitle'),
          t('healthProfile.clearDataMessage'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('healthProfile.clearDataConfirm'), style: 'destructive', onPress: () => resolve(true) },
          ],
        );
      });
      if (!confirmed) return;
    }

    setSaving(true);
    const ok = await saveHealthProfile(user.id, profile);
    if (ok) {
      updateHealthProfile(profile);
      setMode('view'); // land on the saved summary next time, not back in the wizard
      onComplete();
    } else {
      Alert.alert(t('common.error'), t('healthProfile.saveProfileError'));
    }
    setSaving(false);
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <View>
            <StepLabel title={t('healthProfile.allergies')} sub={t('healthProfile.allergiesStepSub')} />
            <ChipsWithCustom
              predefined={COMMON_ALLERGIES}
              custom={getCustomItems(profile.allergies, COMMON_ALLERGIES)}
              field="allergies"
              toggle={toggle}
              isSelected={isSelected}
              labelKeys={ALLERGY_LABELS}
            />
            <StepLabel title={t('healthProfile.intolerances')} sub={t('healthProfile.intolerancesStepSub')} />
            <ChipsWithCustom
              predefined={COMMON_INTOLERANCES}
              custom={getCustomItems(profile.intolerances, COMMON_INTOLERANCES)}
              field="intolerances"
              toggle={toggle}
              isSelected={isSelected}
              labelKeys={INTOLERANCE_LABELS}
            />
            <NoteInput
              label={t('healthProfile.otherAllergiesLabel')}
              value={profile.allergyNotes || ''}
              onChange={v => setProfile(p => ({ ...p, allergyNotes: v }))}
              placeholder={t('healthProfile.otherAllergiesPlaceholder')}
            />
          </View>
        );

      case 1:
        return (
          <View>
            <StepLabel title={t('healthProfile.medicalConditions')} sub={t('healthProfile.conditionsStepSub')} />
            <ChipsWithCustom
              predefined={COMMON_CONDITIONS}
              custom={getCustomItems(profile.conditions, COMMON_CONDITIONS)}
              field="conditions"
              toggle={toggle}
              isSelected={isSelected}
              labelKeys={CONDITION_LABELS}
            />
            {/* Medications from documents */}
            {profile.medications.length > 0 && (
              <View style={s.medsCard}>
                <Text style={s.medsCardTitle}>{t('healthProfile.medicationsFromDocuments')}</Text>
                {profile.medications.map((med, i) => (
                  <View key={i} style={s.medRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.medName}>{med.name}{med.dosage ? ` · ${med.dosage}` : ''}</Text>
                      {med.frequency ? <Text style={s.medDetail}>{med.frequency}{med.reason ? ` · ${t('healthProfile.medicationReasonSuffix', { reason: med.reason })}` : ''}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => setProfile(p => ({ ...p, medications: p.medications.filter((_, idx) => idx !== i) }))}>
                      <Text style={s.medRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <NoteInput
              label={t('healthProfile.otherConditionsLabel')}
              value={profile.conditionNotes || ''}
              onChange={v => setProfile(p => ({ ...p, conditionNotes: v }))}
              placeholder={t('healthProfile.otherConditionsPlaceholder')}
            />
          </View>
        );

      case 2:
        return (
          <View>
            <StepLabel title={t('healthProfile.dietType')} sub={t('healthProfile.dietTypeStepSub')} />
            <ChipsWithCustom
              predefined={DIET_TYPES}
              custom={[]}
              field="dietType"
              toggle={(f: string, v: string) => setProfile(p => ({ ...p, dietType: p.dietType?.toLowerCase() === v.toLowerCase() ? '' : v }))}
              isSelected={(_f: string, v: string) => (profile.dietType || '').toLowerCase() === v.toLowerCase()}
              labelKeys={DIET_TYPE_LABELS}
            />
            <StepLabel title={t('healthProfile.exerciseLevel')} sub={t('healthProfile.exerciseLevelStepSub')} />
            <ChipsWithCustom
              predefined={EXERCISE_LEVELS}
              custom={[]}
              field="exerciseLevel"
              toggle={(f: string, v: string) => setProfile(p => ({ ...p, exerciseLevel: p.exerciseLevel?.toLowerCase() === v.toLowerCase() ? '' : v }))}
              isSelected={(_f: string, v: string) => (profile.exerciseLevel || '').toLowerCase() === v.toLowerCase()}
              labelKeys={EXERCISE_LEVEL_LABELS}
            />
            {/* Metrics from documents */}
            {(profile.age || profile.weightKg || profile.heightCm || profile.gender) ? (
              <View style={s.metricsCard}>
                <Text style={s.medsCardTitle}>{t('healthProfile.metricsFromDocuments')}</Text>
                <View style={s.metricsRow}>
                  {profile.age      ? <MetricChip label={t('healthProfile.age')}    value={t('healthProfile.valueWithUnit', { value: profile.age, unit: t('healthProfile.unitYears') })}   onClear={() => setProfile(p => ({ ...p, age: undefined }))} /> : null}
                  {profile.weightKg ? <MetricChip label={t('healthProfile.weight')} value={t('healthProfile.valueWithUnit', { value: profile.weightKg, unit: t('healthProfile.unitKg') })} onClear={() => setProfile(p => ({ ...p, weightKg: undefined }))} /> : null}
                  {profile.heightCm ? <MetricChip label={t('healthProfile.height')} value={t('healthProfile.valueWithUnit', { value: profile.heightCm, unit: t('healthProfile.unitCm') })} onClear={() => setProfile(p => ({ ...p, heightCm: undefined }))} /> : null}
                  {profile.gender   ? <MetricChip label={t('healthProfile.gender')} value={profile.gender}          onClear={() => setProfile(p => ({ ...p, gender: undefined }))} /> : null}
                </View>
              </View>
            ) : null}
          </View>
        );

      case 3:
        return (
          <View>
            <StepLabel title={t('healthProfile.healthGoals')} sub={t('healthProfile.healthGoalsStepSub')} />
            <ChipsWithCustom
              predefined={HEALTH_GOALS}
              custom={getCustomItems(profile.healthGoals, HEALTH_GOALS)}
              field="healthGoals"
              toggle={toggle}
              isSelected={isSelected}
              labelKeys={HEALTH_GOAL_LABELS}
            />
            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>{t('healthProfile.summaryTitle')}</Text>
              <SummaryRow label={t('healthProfile.allergies')}    value={profile.allergies.map(a => chipLabel(a, ALLERGY_LABELS, t)).join(', ') || t('healthProfile.noneValue')} />
              <SummaryRow label={t('healthProfile.intolerances')} value={profile.intolerances.map(a => chipLabel(a, INTOLERANCE_LABELS, t)).join(', ') || t('healthProfile.noneValue')} />
              <SummaryRow label={t('healthProfile.summaryConditionsLabel')} value={profile.conditions.map(c => chipLabel(c, CONDITION_LABELS, t)).join(', ') || t('healthProfile.noneValue')} />
              <SummaryRow label={t('healthProfile.medications')}  value={profile.medications.map(m => m.name).join(', ') || t('healthProfile.noneValue')} />
              <SummaryRow label={t('healthProfile.summaryDietLabel')} value={profile.dietType ? chipLabel(profile.dietType, DIET_TYPE_LABELS, t) : t('healthProfile.notSpecified')} />
              <SummaryRow label={t('healthProfile.summaryGoalsLabel')} value={profile.healthGoals.map(g => chipLabel(g, HEALTH_GOAL_LABELS, t)).join(', ') || t('healthProfile.noneValue')} last />
            </View>
          </View>
        );
    }
  };

  const progress = (step + 1) / STEPS.length;

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.headerTitle}>{t('healthProfile.headerTitle')}</Text>
            <Text style={s.headerSub}>{t(`healthProfile.${STEP_KEYS[step]}`)} · {t('healthProfile.stepProgress', { step: step + 1, total: STEPS.length })}</Text>
          </View>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {saving ? <ActivityIndicator color={Colors.navy} /> : <Text style={s.skipLink}>{t('healthProfile.saveAndClose')}</Text>}
          </TouchableOpacity>
        </View>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
        </View>
      </View>

      <KeyboardAwareScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, isTablet && s.scrollCenterWrap]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraHeight={rh(140)}
        extraScrollHeight={rh(20)}
        enableAutomaticScroll
      >
        <View style={isTablet ? s.tabletContent : s.fullWidthContent}>
        {appConfig.documentUploadEnabled && <DocumentUploadPrompt onPress={() => setShowDocUpload(true)} />}

        {renderStep()}
        </View>
      </KeyboardAwareScrollView>

      {/* Bottom nav */}
      <View style={[s.dockedNav, isTablet && s.dockedNavTablet]}>
        {step > 0 && (
          <TouchableOpacity style={s.backBtn} onPress={() => setStep(s => s - 1)}>
            <Text style={s.backBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.nextBtn, step === 0 && { flex: 1 }]}
          onPress={step < STEPS.length - 1 ? () => setStep(s => s + 1) : handleSave}
          disabled={saving}
          activeOpacity={0.88}
        >
          {saving
            ? <ActivityIndicator color="#FFF" />
            : <Text style={s.nextBtnText}>{step < STEPS.length - 1 ? t('common.next') : t('healthProfile.saveProfileButton')}</Text>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StepLabel({ title, sub }: { title: string; sub: string }) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={s.stepLabel}>
      <Text style={s.stepLabelTitle}>{title}</Text>
      <Text style={s.stepLabelSub}>{sub}</Text>
    </View>
  );
}

function ChipsWithCustom({ predefined, custom, field, toggle, isSelected, labelKeys }: {
  predefined: string[];
  custom: string[];
  field: keyof HealthProfile;
  toggle: (f: keyof HealthProfile, v: string) => void;
  isSelected: (f: keyof HealthProfile, v: string) => boolean;
  labelKeys?: Record<string, string>;
}) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const { t } = useTranslation();
  return (
    <View style={s.chipGroup}>
      {predefined.map((opt) => {
        const sel = isSelected(field, opt);
        return (
          <TouchableOpacity
            key={opt}
            style={[s.chip, sel && s.chipSel]}
            onPress={() => toggle(field, opt)}
            activeOpacity={0.75}
          >
            <Text style={[s.chipText, sel && s.chipTextSel]}>{labelKeys ? chipLabel(opt, labelKeys, t) : opt}</Text>
          </TouchableOpacity>
        );
      })}
      {custom.map((item) => (
        <TouchableOpacity
          key={`custom-${item}`}
          style={[s.chip, s.chipSel, s.chipCustom]}
          onPress={() => toggle(field, item)}
          activeOpacity={0.75}
        >
          <Text style={[s.chipText, s.chipTextSel]}>{item}</Text>
          <Text style={s.chipCustomRemove}> ✕</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MetricChip({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <TouchableOpacity style={s.metricChip} onPress={onClear} activeOpacity={0.75}>
      <Text style={s.metricChipValue}>{value}</Text>
      <Text style={s.metricChipLabel}>{label} ✕</Text>
    </TouchableOpacity>
  );
}

function NoteInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={s.noteWrap}>
      <Text style={s.noteLabel}>{label}</Text>
      <TextInput
        style={s.noteInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline
        maxLength={500}
      />
    </View>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={[s.summaryRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// Shared "upload a document" prompt — shown both on the view-mode report and
// during onboarding. Spells out what "medical documents" actually means (a
// blood test, prescription, GP letter) and what happens after upload, since
// "upload documents to auto-fill" alone doesn't tell people what to expect.
function DocumentUploadPrompt({ onPress }: { onPress: () => void }) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={s.uploadCard} onPress={onPress} activeOpacity={0.85}>
      <View style={s.uploadCardTop}>
        <View style={s.uploadCardIcon}>
          <Text style={s.uploadCardIconText}>📄</Text>
        </View>
        <View style={s.uploadCardBody}>
          <Text style={s.uploadCardTitle}>{t('healthProfile.uploadPromptTitle')}</Text>
          <Text style={s.uploadCardSub}>
            {t('healthProfile.uploadPromptSub')}
          </Text>
        </View>
        <Text style={s.uploadCardArrow}>›</Text>
      </View>
      <View style={s.uploadCardChips}>
        <View style={s.uploadCardChip}><Text style={s.uploadCardChipText}>🩸 {t('healthProfile.chipBloodTest')}</Text></View>
        <View style={s.uploadCardChip}><Text style={s.uploadCardChipText}>💊 {t('healthProfile.chipPrescription')}</Text></View>
        <View style={s.uploadCardChip}><Text style={s.uploadCardChipText}>✉️ {t('healthProfile.chipGpLetter')}</Text></View>
      </View>
    </TouchableOpacity>
  );
}

// ── View-mode report components ──────────────────────────────

function VitalStat({ label, value, unit, unitColor, last, onEdit }: {
  label: string; value: string; unit: string; unitColor?: string; last?: boolean; onEdit?: () => void;
}) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  const content = (
    <>
      <Text style={s.vitalValue}>{value}</Text>
      <Text style={[s.vitalUnit, unitColor ? { color: unitColor, fontWeight: '700' } : null]}>{unit}</Text>
      <Text style={s.vitalLabel}>{label}{onEdit ? ' ✎' : ''}</Text>
    </>
  );
  if (onEdit) {
    return (
      <TouchableOpacity style={[s.vitalStat, !last && s.vitalStatBorder]} onPress={onEdit} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={[s.vitalStat, !last && s.vitalStatBorder]}>{content}</View>;
}

// Small centred form for correcting one saved value — mirrors the review-screen
// edit modal on the document upload flow, shape driven by `editing.fields`.
function EditModal({ editing, values, onChangeValue, flag, onChangeFlag, saving, onCancel, onSave }: {
  editing: EditState | null;
  values: Record<string, string>;
  onChangeValue: (key: string, value: string) => void;
  flag?: HealthTestResult['flag'];
  onChangeFlag: (flag: HealthTestResult['flag'] | undefined) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const FLAG_OPTIONS: { key: HealthTestResult['flag'] | undefined; label: string }[] = [
    { key: undefined, label: t('healthProfile.flagOptionNone') },
    { key: 'normal', label: t('healthProfile.flagOptionNormal') },
    { key: 'low', label: t('healthProfile.flagOptionLow') },
    { key: 'high', label: t('healthProfile.flagOptionHigh') },
    { key: 'abnormal', label: t('healthProfile.flagOptionAbnormal') },
  ];
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);

  return (
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={s.editOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.editCard}>
          <Text style={s.editCardTitle}>{editing?.title}</Text>

          {editing && editing.fields.map(f => (
            <View key={f.key} style={s.editFieldWrap}>
              <Text style={s.editFieldLabel}>{f.label}</Text>
              <TextInput
                style={s.editFieldInput}
                value={values[f.key] ?? ''}
                onChangeText={v => onChangeValue(f.key, v)}
                keyboardType={f.keyboardType || 'default'}
                placeholderTextColor={Colors.textMuted}
                autoFocus={f === editing.fields[0]}
              />
            </View>
          ))}

          {editing?.showFlag && (
            <View style={s.editFieldWrap}>
              <Text style={s.editFieldLabel}>{t('healthProfile.statusLabel')}</Text>
              <View style={s.flagOptionsRow}>
                {FLAG_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.label}
                    style={[s.flagOption, flag === opt.key && s.flagOptionSel]}
                    onPress={() => onChangeFlag(opt.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.flagOptionText, flag === opt.key && s.flagOptionTextSel]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={s.editActionsRow}>
            <TouchableOpacity style={s.editCancelBtn} onPress={onCancel} activeOpacity={0.8} disabled={saving}>
              <Text style={s.editCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.editSaveBtn} onPress={onSave} activeOpacity={0.85} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.editSaveText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ReportSection({ icon, title, count, accent, children }: {
  icon: string; title: string; count?: number; accent: string; children: React.ReactNode;
}) {
  const { rw, rh, rf, rr } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);
  return (
    <View style={[s.reportSection, { borderLeftColor: accent }]}>
      <View style={s.reportSectionHeader}>
        <View style={[s.reportSectionIcon, { backgroundColor: accent + '18' }]}>
          <Text style={s.reportSectionIconText}>{icon}</Text>
        </View>
        <Text style={s.reportSectionTitle}>{title}</Text>
        {count != null && count > 0 ? (
          <View style={[s.reportCountBadge, { backgroundColor: accent + '15' }]}>
            <Text style={[s.reportCountText, { color: accent }]}>{count}</Text>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function createStyles(
  rw: (n: number) => number,
  rh: (n: number) => number,
  rf: (n: number) => number,
  rr: (n: number) => number,
) {
  return StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg },

  header:         { paddingHorizontal: rw(16), paddingTop: rh(16), paddingBottom: rh(16), borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: rh(14) },
  headerTitle:    { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary },
  headerSub:      { fontSize: rf(13), color: Colors.textSecondary, marginTop: rh(2) },
  skipLink:       { fontSize: rf(14), color: Colors.textMuted, paddingTop: rh(4) },

  progressTrack:  { height: rh(4), backgroundColor: Colors.border, borderRadius: rr(2) },
  progressFill:   { height: rh(4), backgroundColor: Colors.navy, borderRadius: rr(2) },

  scroll:         { flex: 1 },
  scrollContent:  { paddingHorizontal: rw(16), paddingTop: rh(8), paddingBottom: rh(20) },

  uploadCard:       { backgroundColor: Colors.navyLight, borderRadius: rr(16), padding: rw(14), borderWidth: 1, borderColor: Colors.navy + '30', marginBottom: rh(16) },
  uploadCardTop:    { flexDirection: 'row', alignItems: 'flex-start', gap: rw(12) },
  uploadCardIcon:   { width: rw(44), height: rw(44), borderRadius: rr(12), backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.navy + '20' },
  uploadCardIconText: { fontSize: rf(21) },
  uploadCardBody:   { flex: 1 },
  uploadCardTitle:  { fontSize: rf(14.5), fontWeight: '800', color: Colors.navy },
  uploadCardSub:    { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(3), lineHeight: rf(17) },
  uploadCardArrow:  { fontSize: rf(20), color: Colors.navy, opacity: 0.5, marginTop: rh(2) },
  uploadCardChips:  { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8), marginTop: rh(12) },
  uploadCardChip:   { backgroundColor: Colors.surface, borderRadius: rr(999), paddingHorizontal: rw(10), paddingVertical: rh(5), borderWidth: 1, borderColor: Colors.border },
  uploadCardChipText: { fontSize: rf(11), fontWeight: '600', color: Colors.textSecondary },

  stepLabel:      { marginTop: rh(20), marginBottom: rh(12) },
  stepLabelTitle: { fontSize: rf(16), fontWeight: '700', color: Colors.textPrimary },
  stepLabelSub:   { fontSize: rf(13), color: Colors.textSecondary, marginTop: rh(2) },

  chipGroup:      { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8) },
  chip:           { borderRadius: rr(20), paddingHorizontal: rw(14), paddingVertical: rh(8), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  chipSel:        { backgroundColor: Colors.navyLight, borderColor: Colors.navy },
  chipCustom:     { borderStyle: 'dashed' },
  chipText:       { fontSize: rf(13), color: Colors.textSecondary },
  chipTextSel:    { color: Colors.navy, fontWeight: '600' },
  chipCustomRemove: { fontSize: rf(11), color: Colors.navy, opacity: 0.6 },

  // Medications card
  medsCard:       { marginTop: rh(16), backgroundColor: Colors.surfaceAlt, borderRadius: rr(12), padding: rw(14), borderWidth: 1, borderColor: Colors.border },
  medsCardTitle:  { fontSize: rf(12), fontWeight: '700', color: Colors.textMuted, marginBottom: rh(10), letterSpacing: 0.5 },
  medRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: rh(8), borderBottomWidth: 1, borderBottomColor: Colors.border },
  medName:        { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
  medDetail:      { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(2) },
  medRemove:      { fontSize: rf(14), color: Colors.danger, paddingLeft: rw(12) },

  // Metrics card
  metricsCard:    { marginTop: rh(16), backgroundColor: Colors.surfaceAlt, borderRadius: rr(12), padding: rw(14), borderWidth: 1, borderColor: Colors.border },
  metricsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: rw(10) },
  metricChip:     { backgroundColor: Colors.navyLight, borderRadius: rr(10), paddingHorizontal: rw(14), paddingVertical: rh(10), alignItems: 'center', borderWidth: 1, borderColor: Colors.navy + '20' },
  metricChipValue: { fontSize: rf(15), fontWeight: '700', color: Colors.navy },
  metricChipLabel: { fontSize: rf(11), color: Colors.textSecondary, marginTop: rh(2) },

  noteWrap:       { marginTop: rh(16) },
  noteLabel:      { fontSize: rf(13), color: Colors.textSecondary, marginBottom: rh(8) },
  noteInput:      { backgroundColor: Colors.surfaceAlt, borderRadius: rr(12), padding: rw(14), color: Colors.textPrimary, fontSize: rf(14), borderWidth: 1, borderColor: Colors.border, minHeight: rh(72), textAlignVertical: 'top' },

  summaryCard:    { backgroundColor: Colors.surfaceAlt, borderRadius: rr(16), padding: rw(16), borderWidth: 1, borderColor: Colors.border, marginTop: rh(24) },
  summaryTitle:   { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(12) },
  summaryRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: rh(9), borderBottomWidth: 1, borderBottomColor: Colors.border },
  summaryLabel:   { fontSize: rf(13), color: Colors.textSecondary },
  summaryValue:   { fontSize: rf(13), color: Colors.textPrimary, flex: 1, textAlign: 'right', marginLeft: rw(16) },

  bottomNav:      { position: 'absolute', bottom: rh(24), left: rw(16), right: rw(16), flexDirection: 'row', gap: rw(10) },
  dockedNav:      { flexDirection: 'row', gap: rw(10), paddingHorizontal: rw(16), paddingTop: rh(12), paddingBottom: rh(24), borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg },
  backBtn:        { backgroundColor: Colors.surfaceAlt, borderRadius: rr(14), paddingVertical: rh(16), paddingHorizontal: rw(20), borderWidth: 1, borderColor: Colors.border },
  backBtnText:    { color: Colors.textPrimary, fontWeight: '600', fontSize: rf(15) },
  nextBtn:        { flex: 2, backgroundColor: Colors.navy, borderRadius: rr(14), paddingVertical: rh(16), alignItems: 'center' },
  nextBtnText:    { color: '#FFF', fontWeight: '700', fontSize: rf(16) },

  reportFooter:     { fontSize: rf(11), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(16), marginTop: rh(8), fontStyle: 'italic', paddingHorizontal: rw(8) },

  // Vitals strip
  vitalsCard:       { backgroundColor: Colors.surfaceAlt, borderRadius: rr(14), padding: rw(14), borderWidth: 1, borderColor: Colors.border, marginBottom: rh(16) },
  reportSectionLabel: { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 1, marginBottom: rh(10) },
  vitalsRow:        { flexDirection: 'row' },
  vitalStat:        { flex: 1, alignItems: 'center', paddingHorizontal: rw(4) },
  vitalStatBorder:  { borderRightWidth: 1, borderRightColor: Colors.border },
  vitalValue:       { fontSize: rf(16), fontWeight: '800', color: Colors.textPrimary },
  vitalUnit:        { fontSize: rf(10), color: Colors.textSecondary, marginTop: rh(1) },
  vitalLabel:       { fontSize: rf(10), color: Colors.textMuted, marginTop: rh(4), letterSpacing: 0.3 },

  // Report sections
  reportSection:      { backgroundColor: Colors.surface, borderRadius: rr(14), padding: rw(14), borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3, marginBottom: rh(14), ...Shadow.card },
  reportSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: rw(8), marginBottom: rh(12) },
  reportSectionIcon:  { width: rw(26), height: rw(26), borderRadius: rr(8), alignItems: 'center', justifyContent: 'center' },
  reportSectionIconText: { fontSize: rf(13) },
  reportSectionTitle: { flex: 1, fontSize: rf(13), fontWeight: '700', color: Colors.textPrimary },
  reportCountBadge:   { borderRadius: rr(10), paddingHorizontal: rw(8), paddingVertical: rh(2) },
  reportCountText:    { fontSize: rf(11), fontWeight: '700' },

  viewChips:        { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8) },
  viewNoteText:     { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(20), marginTop: rh(8), fontStyle: 'italic' },
  viewChip:         { borderRadius: rr(20), paddingHorizontal: rw(14), paddingVertical: rh(7), borderWidth: 1 },
  viewChipText:     { fontSize: rf(13), fontWeight: '600' },
  viewChipDanger:   { backgroundColor: Colors.dangerBg, borderColor: Colors.dangerBorder },
  viewChipAmber:    { backgroundColor: Colors.cautionBg, borderColor: Colors.cautionBorder },
  viewChipNavy:     { backgroundColor: Colors.navyLight, borderColor: Colors.navy + '30' },
  viewChipGreen:    { backgroundColor: Colors.safeBg, borderColor: Colors.safeBorder },

  // Medications / test results — table-style rows inside a ReportSection
  viewMedRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: rw(10), paddingVertical: rh(10), borderBottomWidth: 1, borderBottomColor: Colors.border },
  viewMedDot:       { width: rw(6), height: rw(6), borderRadius: rw(3), backgroundColor: Colors.info, marginTop: rh(6) },
  viewMedName:      { fontSize: rf(14), fontWeight: '600', color: Colors.textPrimary },
  viewMedDetail:    { fontSize: rf(12), color: Colors.textSecondary, marginTop: rh(2) },

  testTableHead:      { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: rh(8), marginBottom: rh(4), borderBottomWidth: 1, borderBottomColor: Colors.borderStrong },
  testTableHeadText:  { fontSize: rf(10), fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8 },
  testRow:            { flexDirection: 'row', alignItems: 'center', gap: rw(10), paddingVertical: rh(10), borderBottomWidth: 1, borderBottomColor: Colors.border },
  testNameCol:        { flex: 1, minWidth: 0 },
  testValueCol:       { alignItems: 'flex-end', gap: rh(4), maxWidth: '42%', flexShrink: 0 },
  testValue:          { fontSize: rf(14), fontWeight: '800', textAlign: 'right' },
  testFlagPill:       { borderRadius: rr(6), paddingHorizontal: rw(6), paddingVertical: rh(2), borderWidth: 1 },
  testFlagText:       { fontSize: rf(9), fontWeight: '800', letterSpacing: 0.4 },

  editHint:     { fontSize: rf(11.5), color: Colors.textMuted, marginBottom: rh(14), textAlign: 'center' },
  rowEditBtn:     { flexShrink: 0, paddingLeft: rw(4) },
  rowEditBtnText: { fontSize: rf(15), color: Colors.navy },

  // Edit modal
  editOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: rw(24) },
  editCard:       { width: '100%', maxWidth: rw(360), backgroundColor: Colors.surface, borderRadius: rr(18), padding: rw(20) },
  editCardTitle:  { fontSize: rf(16), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(16) },
  editFieldWrap:  { marginBottom: rh(14) },
  editFieldLabel: { fontSize: rf(12), fontWeight: '600', color: Colors.textSecondary, marginBottom: rh(6) },
  editFieldInput: { backgroundColor: Colors.surfaceAlt, borderRadius: rr(10), paddingHorizontal: rw(12), paddingVertical: rh(10), fontSize: rf(14), color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },

  flagOptionsRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8) },
  flagOption:        { borderRadius: rr(20), paddingHorizontal: rw(12), paddingVertical: rh(7), backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  flagOptionSel:     { backgroundColor: Colors.navyLight, borderColor: Colors.navy },
  flagOptionText:    { fontSize: rf(12), color: Colors.textSecondary },
  flagOptionTextSel: { color: Colors.navy, fontWeight: '700' },

  editActionsRow: { flexDirection: 'row', gap: rw(10), marginTop: rh(6) },
  editCancelBtn:  { flex: 1, borderRadius: rr(12), paddingVertical: rh(13), alignItems: 'center', backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  editCancelText: { fontSize: rf(14), fontWeight: '700', color: Colors.textPrimary },
  editSaveBtn:    { flex: 1, borderRadius: rr(12), paddingVertical: rh(13), alignItems: 'center', backgroundColor: Colors.navy },
  editSaveText:   { fontSize: rf(14), fontWeight: '700', color: '#FFFFFF' },

  // Tablet content width cap — keeps the wizard/report column centered and
  // readable instead of stretching edge-to-edge on wide screens; nav bars
  // are centered to the same width so actions line up under the content.
  scrollCenterWrap: { alignItems: 'center' },
  tabletContent:    { width: '100%', maxWidth: TABLET_CONTENT_MAX_WIDTH },
  fullWidthContent: { width: '100%' },
  bottomNavTablet:  { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center' },
  dockedNavTablet:  { maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' },
  });
}
