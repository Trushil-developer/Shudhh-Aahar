import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, StatusBar,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { saveHealthProfile, HealthProfile, HealthTestResult } from '../services/userDataService';
import {
  extractHealthDataFromDocuments,
  UploadedDocument,
  ExtractedHealthData,
  MAX_DOCUMENTS,
} from '../services/documentHealthService';
import { Colors } from '../theme/medical';
import { useResponsive, TABLET_CONTENT_MAX_WIDTH } from '../utils/responsive';
import { translateError } from '../utils/AppError';
import { FeatureGate } from '../components/FeatureGate';

type Step = 'upload' | 'processing' | 'review' | 'saving' | 'done' | 'error';

interface Props {
  existingProfile: HealthProfile;
  onComplete: (updatedProfile: HealthProfile) => void;
  onSkip: () => void;
}

// ── Inline edit modal — lets the user correct an extracted value before
// saving, rather than only being able to remove it ─────────────────────
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

// 10MB — a reasonable ceiling for a scanned prescription/report/blood test;
// reject anything larger before reading it into memory as base64.
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// .doc/.docx are a binary ZIP format — documentHealthService sends anything
// that isn't classified 'pdf'/'image' through atob() as if it were
// base64-encoded plain text, which corrupts Word documents into garbage
// sent to the extraction AI. Real DOCX text extraction is out of scope, so
// detect and reject these by extension/MIME type instead of silently
// sending corrupted content.
function isWordDocument(file: { name?: string | null; type?: string | null }): boolean {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  return name.endsWith('.doc') || name.endsWith('.docx')
    || mime.includes('msword') || mime.includes('wordprocessingml');
}

export default function DocumentUploadScreen({ existingProfile, onComplete, onSkip }: Props) {
  const { t } = useTranslation();
  const { user, updateHealthProfile } = useAuth();
  const [step, setStep]           = useState<Step>('upload');
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);
  const [extracted, setExtracted] = useState<ExtractedHealthData | null>(null);
  const [mergedProfile, setMergedProfile] = useState<HealthProfile>({ ...existingProfile });
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [extractionError, setExtractionError] = useState('');

  const [editing, setEditing] = useState<EditState | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editFlag, setEditFlag] = useState<HealthTestResult['flag'] | undefined>(undefined);

  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const extractionAbortRef = useRef<AbortController | null>(null);

  const { rw, rh, rf, rr, isTablet } = useResponsive();
  const s = useMemo(() => createStyles(rw, rh, rf, rr), [rw, rh, rf, rr]);

  // Cap upload/review content + the sticky action button to a comfortable
  // width on tablet instead of stretching them edge-to-edge.
  const tabletCap = isTablet
    ? { width: '100%' as const, maxWidth: TABLET_CONTENT_MAX_WIDTH, alignSelf: 'center' as const }
    : undefined;
  const tabletScrollContent = isTablet
    ? [s.scrollContent, tabletCap]
    : s.scrollContent;

  const remainingSlots = MAX_DOCUMENTS - uploadedDocs.length;

  const addDocs = (docs: UploadedDocument[]) => {
    if (remainingSlots <= 0) {
      Alert.alert(t('documentUpload.limitReachedTitle'), t('documentUpload.limitReachedMessage', { count: MAX_DOCUMENTS }));
      return;
    }
    const toAdd = docs.slice(0, remainingSlots);
    if (docs.length > toAdd.length) {
      Alert.alert(t('documentUpload.limitReachedTitle'), t('documentUpload.partialAddMessage', { added: toAdd.length, total: docs.length, max: MAX_DOCUMENTS }));
    }
    setUploadedDocs(prev => [...prev, ...toAdd]);
  };

  const pickDocument = async () => {
    if (remainingSlots <= 0) {
      Alert.alert(t('documentUpload.limitReachedTitle'), t('documentUpload.limitReachedMessage', { count: MAX_DOCUMENTS }));
      return;
    }
    try {
      const results = await DocumentPicker.pick({
        type: [DocumentPicker.types.pdf, DocumentPicker.types.plainText, DocumentPicker.types.doc, DocumentPicker.types.docx],
        allowMultiSelection: true,
      });
      const docs: UploadedDocument[] = [];
      const rejectedWord: string[] = [];
      const rejectedSize: string[] = [];
      for (const file of results) {
        if (isWordDocument(file)) { rejectedWord.push(file.name || t('documentUpload.defaultFileName')); continue; }
        if (typeof file.size === 'number' && file.size > MAX_FILE_SIZE_BYTES) { rejectedSize.push(file.name || t('documentUpload.defaultFileName')); continue; }
        const base64 = await RNFS.readFile(file.uri, 'base64');
        docs.push({ name: file.name || t('documentUpload.defaultDocumentName'), type: file.type?.includes('pdf') ? 'pdf' : 'text', base64, mediaType: file.type || 'application/pdf' });
      }
      if (rejectedWord.length > 0) {
        Alert.alert(t('documentUpload.wordNotSupportedTitle'), t('documentUpload.wordNotSupportedMessage'));
      }
      if (rejectedSize.length > 0) {
        Alert.alert(t('documentUpload.fileTooLargeTitle'), t('documentUpload.fileTooLargeMessage', { files: rejectedSize.join(', '), count: rejectedSize.length }));
      }
      addDocs(docs);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) Alert.alert(t('common.error'), t('documentUpload.fileReadError'));
    }
  };

  const pickImage = async () => {
    if (remainingSlots <= 0) {
      Alert.alert(t('documentUpload.limitReachedTitle'), t('documentUpload.limitReachedMessage', { count: MAX_DOCUMENTS }));
      return;
    }
    const result = await launchImageLibrary({ mediaType: 'photo', includeBase64: true, quality: 0.4, maxWidth: 1200, maxHeight: 1600, selectionLimit: remainingSlots });
    if (result.assets) {
      const docs: UploadedDocument[] = result.assets.filter(a => a.base64).map(a => ({
        name: a.fileName || t('documentUpload.defaultPhotoName'), type: 'image', base64: a.base64!, mediaType: a.type || 'image/jpeg',
      }));
      addDocs(docs);
    }
  };

  // Pasted text is sent through the exact same pipeline as an uploaded .txt
  // file — documentHealthService's extractBatch already treats any
  // non-pdf/image UploadedDocument as raw base64-encoded text (see the
  // `atob(doc.base64)` branch), so no service/backend changes are needed.
  const addPastedText = () => {
    const trimmed = pasteText.trim();
    if (!trimmed) {
      Alert.alert(t('documentUpload.pasteTextEmptyTitle'), t('documentUpload.pasteTextEmptyMessage'));
      return;
    }
    addDocs([{ name: t('documentUpload.pastedReportName'), type: 'text', base64: btoa(trimmed), mediaType: 'text/plain' }]);
    setPasteText('');
    setShowPasteModal(false);
  };

  // Wrapped in try/catch — extractHealthDataFromDocuments can throw (network
  // failure, API error, abort race, etc.) and previously nothing caught it,
  // leaving the screen stuck on the "processing" spinner forever since no
  // state transition ever ran after a throw. Any failure now surfaces a
  // translated message and moves to a dedicated 'error' step.
  const runExtraction = async () => {
    if (!uploadedDocs.length) { Alert.alert(t('documentUpload.noFilesTitle'), t('documentUpload.noFilesMessage')); return; }
    setStep('processing');
    setProgress({ done: 0, total: uploadedDocs.length });
    const controller = new AbortController();
    extractionAbortRef.current = controller;
    try {
      const result = await extractHealthDataFromDocuments(uploadedDocs, (done, total) => setProgress({ done, total }), controller.signal);
      extractionAbortRef.current = null;
      if (!result) {
        // User cancelled — just go back, nothing to show or save.
        setStep('upload');
        return;
      }
      setExtracted(result);
      const merged: HealthProfile = {
        ...existingProfile,
        allergies:           mergeArrays(existingProfile.allergies, result.allergies),
        intolerances:        mergeArrays(existingProfile.intolerances, result.intolerances),
        conditions:          mergeArrays(existingProfile.conditions, result.conditions),
        medications:         mergeMedications(existingProfile.medications, result.medications),
        dietaryRestrictions: mergeArrays(existingProfile.dietaryRestrictions, result.dietaryRestrictions),
        healthGoals:         mergeArrays(existingProfile.healthGoals, result.healthGoals),
        testResults:         mergeTestResults(existingProfile.testResults, result.testResults),
        dietType:            existingProfile.dietType || result.dietType || '',
        age:                 existingProfile.age || result.age,
        gender:              existingProfile.gender || result.gender,
        weightKg:            existingProfile.weightKg || result.weightKg,
        heightCm:            existingProfile.heightCm || result.heightCm,
      };
      setMergedProfile(merged);
      setStep('review');
    } catch (err) {
      extractionAbortRef.current = null;
      setExtractionError(translateError(err, t));
      setStep('error');
    }
  };

  const cancelExtraction = () => {
    extractionAbortRef.current?.abort();
  };

  const handleSave = async () => {
    if (!user) return;
    setStep('saving');
    const ok = await saveHealthProfile(user.id, mergedProfile);
    if (ok) {
      updateHealthProfile(mergedProfile);
      setStep('done');
      setTimeout(() => onComplete(mergedProfile), 2000);
    } else {
      Alert.alert(t('common.error'), t('documentUpload.saveError'));
      setStep('review');
    }
  };

  // ── Edit handlers — open a small form pre-filled with the extracted
  // value, so the user can fix a misread instead of only removing it ──
  const openChipEdit = (field: ChipField, value: string, singular: string) => {
    setEditValues({ value });
    setEditFlag(undefined);
    setEditing({ kind: 'chip', title: t('documentUpload.editItemTitle', { item: singular }), chipField: field, originalValue: value, fields: [{ key: 'value', label: singular }] });
  };

  const openMedicationEdit = (index: number) => {
    const med = mergedProfile.medications[index];
    if (!med) return;
    setEditValues({ name: med.name || '', dosage: med.dosage || '', frequency: med.frequency || '', reason: med.reason || '' });
    setEditFlag(undefined);
    setEditing({
      kind: 'medication', title: t('documentUpload.editMedicationTitle'), medIndex: index,
      fields: [
        { key: 'name', label: t('documentUpload.fieldName') },
        { key: 'dosage', label: t('documentUpload.fieldDosage') },
        { key: 'frequency', label: t('documentUpload.fieldFrequency') },
        { key: 'reason', label: t('documentUpload.fieldReason') },
      ],
    });
  };

  const openTestResultEdit = (name: string) => {
    const testResult = mergedProfile.testResults.find(x => x.name === name);
    if (!testResult) return;
    setEditValues({ name: testResult.name, value: testResult.value, range: testResult.range || '' });
    setEditFlag(testResult.flag);
    setEditing({
      kind: 'testResult', title: t('documentUpload.editTestResultTitle'), originalTestName: name, showFlag: true,
      fields: [
        { key: 'name', label: t('documentUpload.fieldTestName') },
        { key: 'value', label: t('documentUpload.fieldResult') },
        { key: 'range', label: t('documentUpload.fieldReferenceRange') },
      ],
    });
  };

  const openMetricEdit = (field: MetricField, label: string) => {
    const current = mergedProfile[field];
    setEditValues({ value: current != null ? String(current) : '' });
    setEditFlag(undefined);
    setEditing({
      kind: 'metric', title: t('documentUpload.editItemTitle', { item: label }), metricField: field,
      fields: [{ key: 'value', label, keyboardType: field === 'gender' ? 'default' : 'numeric' }],
    });
  };

  const handleEditSave = () => {
    if (!editing) return;

    if (editing.kind === 'chip' && editing.chipField && editing.originalValue != null) {
      const chipField = editing.chipField;
      const originalValue = editing.originalValue;
      const newValue = (editValues.value || '').trim();
      setMergedProfile(p => {
        const list = (p[chipField] as string[]) || [];
        const updated = newValue
          ? list.map(v => (v.toLowerCase() === originalValue.toLowerCase() ? newValue : v))
          : list.filter(v => v.toLowerCase() !== originalValue.toLowerCase());
        return { ...p, [chipField]: updated };
      });
    } else if (editing.kind === 'medication' && editing.medIndex != null) {
      const medIndex = editing.medIndex;
      setMergedProfile(p => ({
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
      setMergedProfile(p => ({
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
        setMergedProfile(p => ({ ...p, gender: raw || undefined }));
        setEditing(null);
        return;
      }
      if (!raw) {
        setMergedProfile(p => ({ ...p, [metricField]: undefined }));
        setEditing(null);
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
          t('documentUpload.invalidValueTitle'),
          bounds ? t('documentUpload.invalidValueRangeMessage', { min: bounds[0], max: bounds[1] }) : t('documentUpload.invalidValueMessage'),
        );
        return;
      }
      setMergedProfile(p => ({ ...p, [metricField]: num }));
    }

    setEditing(null);
  };

  // ── Processing state ───────────────────────────────────────
  if (step === 'processing') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <FeatureGate feature="documentUpload" fullScreen>
      <SafeAreaView style={[s.container, s.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <ActivityIndicator size="large" color={Colors.navy} style={s.processingSpinner} />
        <Text style={s.processingTitle}>{t('documentUpload.processingTitle')}</Text>
        <Text style={s.processingSub}>
          {progress.total > 0
            ? t('documentUpload.processingProgress', { count: progress.total, done: progress.done })
            : t('documentUpload.processingStarting')}
        </Text>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.progressPct}>{pct}%</Text>
        <TouchableOpacity style={s.processingCancelBtn} onPress={cancelExtraction} activeOpacity={0.75}>
          <Text style={s.processingCancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
      </FeatureGate>
    );
  }

  // ── Error state — extraction threw; let the user see why and retry ──
  if (step === 'error') {
    return (
      <FeatureGate feature="documentUpload" fullScreen>
      <SafeAreaView style={[s.container, s.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <Text style={s.doneEmoji}>⚠️</Text>
        <Text style={s.processingTitle}>{t('documentUpload.extractionErrorTitle')}</Text>
        <Text style={s.processingSub}>{extractionError}</Text>
        <TouchableOpacity style={[s.primaryBtn, { marginTop: rh(24) }]} onPress={() => setStep('upload')} activeOpacity={0.88}>
          <Text style={s.primaryBtnText}>{t('common.tryAgain')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
      </FeatureGate>
    );
  }

  // ── Saving state ───────────────────────────────────────────
  if (step === 'saving') {
    return (
      <FeatureGate feature="documentUpload" fullScreen>
      <SafeAreaView style={[s.container, s.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <ActivityIndicator size="large" color={Colors.navy} />
        <Text style={s.savingTitle}>{t('documentUpload.savingTitle')}</Text>
      </SafeAreaView>
      </FeatureGate>
    );
  }

  // ── Done state ─────────────────────────────────────────────
  if (step === 'done') {
    const addedAllergies   = mergedProfile.allergies?.length   ?? 0;
    const addedConditions  = mergedProfile.conditions?.length  ?? 0;
    const addedMedications = mergedProfile.medications?.length ?? 0;

    const summaryBadges: { label: string; count: number }[] = [];
    if (addedAllergies   > 0) summaryBadges.push({ label: t('documentUpload.summaryAllergies', { count: addedAllergies }),     count: addedAllergies });
    if (addedConditions  > 0) summaryBadges.push({ label: t('documentUpload.summaryConditions', { count: addedConditions }),   count: addedConditions });
    if (addedMedications > 0) summaryBadges.push({ label: t('documentUpload.summaryMedications', { count: addedMedications }), count: addedMedications });

    return (
      <FeatureGate feature="documentUpload" fullScreen>
      <SafeAreaView style={[s.container, s.centered]}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
        <Text style={s.doneEmoji}>✅</Text>
        <Text style={s.doneTitle}>{t('documentUpload.doneTitle')}</Text>
        {summaryBadges.length > 0 && (
          <View style={s.doneBadgesRow}>
            {summaryBadges.map((badge, i) => (
              <View key={i} style={s.doneBadge}>
                <Text style={s.doneBadgeText}>{badge.label}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={s.doneSub}>{t('documentUpload.doneSub')}</Text>
      </SafeAreaView>
      </FeatureGate>
    );
  }

  // ── Review state — NHS App results-list style ────────────────
  if (step === 'review' && extracted) {
    const confidenceColor =
      extracted.confidence === 'high'   ? Colors.safe    :
      extracted.confidence === 'medium' ? Colors.caution :
                                          Colors.danger;
    const confidenceBg =
      extracted.confidence === 'high'   ? Colors.safeBg    :
      extracted.confidence === 'medium' ? Colors.cautionBg :
                                          Colors.dangerBg;
    const confidenceBorder =
      extracted.confidence === 'high'   ? Colors.safeBorder    :
      extracted.confidence === 'medium' ? Colors.cautionBorder :
                                          Colors.dangerBorder;

    // The page should only show what THIS upload actually found — not
    // everything already saved in the profile from before. `mergedProfile`
    // is existing + new (that's what gets saved), so for display we take
    // the raw per-upload `extracted` list and keep only entries still
    // present in mergedProfile (i.e. not yet removed via ✕ below).
    const foundIn = (extractedList: string[], mergedList: string[]) =>
      extractedList.filter(a => mergedList.some(m => m.toLowerCase() === a.toLowerCase()));

    const reportSections: { label: string; singular: string; field: ChipField; caution?: boolean; items: string[]; onRemove: (item: string) => void }[] = [
      { label: t('documentUpload.allergies'),         singular: t('documentUpload.allergySingular'),         field: 'allergies' as ChipField,    caution: true, items: foundIn(extracted.allergies, mergedProfile.allergies),       onRemove: (item: string) => setMergedProfile(p => ({ ...p, allergies:    p.allergies.filter(a => a !== item) })) },
      { label: t('documentUpload.intolerances'),      singular: t('documentUpload.intoleranceSingular'),     field: 'intolerances' as ChipField,                items: foundIn(extracted.intolerances, mergedProfile.intolerances), onRemove: (item: string) => setMergedProfile(p => ({ ...p, intolerances: p.intolerances.filter(a => a !== item) })) },
      { label: t('documentUpload.medicalConditions'), singular: t('documentUpload.medicalConditionSingular'), field: 'conditions' as ChipField,   caution: true, items: foundIn(extracted.conditions, mergedProfile.conditions),     onRemove: (item: string) => setMergedProfile(p => ({ ...p, conditions:   p.conditions.filter(a => a !== item) })) },
      { label: t('documentUpload.healthGoals'),       singular: t('documentUpload.healthGoalSingular'),      field: 'healthGoals' as ChipField,                 items: foundIn(extracted.healthGoals, mergedProfile.healthGoals),   onRemove: (item: string) => setMergedProfile(p => ({ ...p, healthGoals:  p.healthGoals.filter(a => a !== item) })) },
    ].filter(sec => sec.items.length > 0);

    const metricRows: { label: string; field: MetricField; value: string; onRemove: () => void }[] = [
      (extracted.age      && mergedProfile.age)      ? { label: t('documentUpload.age'),    field: 'age' as MetricField,      value: t('documentUpload.valueWithUnit', { value: mergedProfile.age, unit: t('documentUpload.unitYears') }),      onRemove: () => setMergedProfile(p => ({ ...p, age: undefined })) }      : null,
      (extracted.weightKg && mergedProfile.weightKg) ? { label: t('documentUpload.weight'), field: 'weightKg' as MetricField, value: t('documentUpload.valueWithUnit', { value: mergedProfile.weightKg, unit: t('documentUpload.unitKg') }), onRemove: () => setMergedProfile(p => ({ ...p, weightKg: undefined })) } : null,
      (extracted.heightCm && mergedProfile.heightCm) ? { label: t('documentUpload.height'), field: 'heightCm' as MetricField, value: t('documentUpload.valueWithUnit', { value: mergedProfile.heightCm, unit: t('documentUpload.unitCm') }), onRemove: () => setMergedProfile(p => ({ ...p, heightCm: undefined })) } : null,
      (extracted.gender   && mergedProfile.gender)   ? { label: t('documentUpload.gender'), field: 'gender' as MetricField,   value: mergedProfile.gender,           onRemove: () => setMergedProfile(p => ({ ...p, gender: undefined })) }   : null,
    ].filter((r): r is { label: string; field: MetricField; value: string; onRemove: () => void } => r !== null);

    const foundMedications = mergedProfile.medications
      .map((med, i) => ({ med, i }))
      .filter(({ med }) => extracted.medications.some(e => e.name.toLowerCase() === med.name.toLowerCase()));

    const foundTestResults = mergedProfile.testResults
      .filter(test => extracted.testResults.some(e => e.name.toLowerCase() === test.name.toLowerCase()));

    const hasMeds = foundMedications.length > 0;
    const hasMetrics = metricRows.length > 0;
    const hasTestResults = foundTestResults.length > 0;
    const isEmpty = reportSections.length === 0 && !hasMeds && !hasMetrics && !hasTestResults;

    const removeTestResult = (name: string) =>
      setMergedProfile(p => ({ ...p, testResults: p.testResults.filter(test => test.name !== name) }));

    // Matches the NHS App pattern: value text + a small pill both take the
    // flag colour; nothing is coloured when there's no flag (e.g. no range known).
    const flagStyle = (flag?: string) => {
      if (flag === 'high' || flag === 'abnormal') return { color: Colors.danger, bg: Colors.dangerBg, border: Colors.dangerBorder, label: flag === 'abnormal' ? t('documentUpload.flagAbnormalBadge') : t('documentUpload.flagOutOfRangeBadge') };
      if (flag === 'low') return { color: Colors.caution, bg: Colors.cautionBg, border: Colors.cautionBorder, label: t('documentUpload.flagBelowRangeBadge') };
      if (flag === 'normal') return { color: Colors.safe, bg: Colors.safeBg, border: Colors.safeBorder, label: t('documentUpload.flagInRangeBadge') };
      return null;
    };

    return (
      <FeatureGate feature="documentUpload" fullScreen>
      <SafeAreaView style={s.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

        <View style={s.reviewHeader}>
          <TouchableOpacity onPress={() => setStep('upload')} style={s.backBtn} activeOpacity={0.7}>
            <Text style={s.backBtnText}>← {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={s.reviewHeaderTitle}>{t('documentUpload.reviewHeaderTitle')}</Text>
          <View style={s.backBtnPlaceholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tabletScrollContent}>

          <Text style={s.pageTitle}>{t('documentUpload.pageTitle')}</Text>
          <View style={s.pageMetaRow}>
            {extracted.sourceDocuments.length > 0 && (
              <Text style={s.pageMetaText} numberOfLines={1}>{extracted.sourceDocuments.join(', ')}</Text>
            )}
            <View style={[s.confidenceBadge, { backgroundColor: confidenceBg, borderColor: confidenceBorder }]}>
              <Text style={[s.confidenceBadgeText, { color: confidenceColor }]}>{t(`documentUpload.confidence_${extracted.confidence}`)}</Text>
            </View>
          </View>

          {!isEmpty && extracted.confidence !== 'high' && (
            <View style={[s.reviewBanner, { backgroundColor: confidenceBg, borderColor: confidenceBorder }]}>
              <Text style={s.reviewBannerIcon}>🔍</Text>
              <Text style={[s.reviewBannerText, { color: confidenceColor }]}>
                {extracted.confidence === 'low'
                  ? t('documentUpload.reviewBannerLow')
                  : t('documentUpload.reviewBannerDefault')}
              </Text>
            </View>
          )}

          {isEmpty ? (
            <View style={s.reportEmpty}>
              <Text style={s.reportEmptyIcon}>📄</Text>
              <Text style={s.reportEmptyText}>
                {t('documentUpload.reportEmptyText', {
                  documents: extracted.sourceDocuments.length > 0 ? extracted.sourceDocuments.join(', ') : t('documentUpload.theseDocuments'),
                })}
              </Text>
              <Text style={s.reportEmptyHint}>
                {t('documentUpload.reportEmptyHint')}
              </Text>
            </View>
          ) : (
            <>
              {hasTestResults && (
                <NHSListSection title={t('documentUpload.testResults')} styles={s}>
                  {foundTestResults.map((test, i) => {
                    const fs = flagStyle(test.flag);
                    return (
                      <NHSRow
                        key={test.name}
                        styles={s}
                        last={i === foundTestResults.length - 1}
                        title={test.name}
                        value={test.value}
                        valueColor={fs?.color}
                        subtitle={test.range}
                        badgeText={fs?.label}
                        badgeColor={fs?.color}
                        badgeBg={fs?.bg}
                        badgeBorder={fs?.border}
                        onRemove={() => removeTestResult(test.name)}
                        onEdit={() => openTestResultEdit(test.name)}
                      />
                    );
                  })}
                </NHSListSection>
              )}

              {reportSections.map(sec => (
                <NHSListSection key={sec.label} title={sec.label} caution={sec.caution} styles={s}>
                  {sec.items.map((item, i) => (
                    <NHSRow
                      key={item}
                      styles={s}
                      last={i === sec.items.length - 1}
                      title={item}
                      onRemove={() => sec.onRemove(item)}
                      onEdit={() => openChipEdit(sec.field, item, sec.singular)}
                    />
                  ))}
                </NHSListSection>
              ))}

              {hasMeds && (
                <NHSListSection title={t('documentUpload.medications')} styles={s}>
                  {foundMedications.map(({ med, i }, idx) => (
                    <NHSRow
                      key={i}
                      styles={s}
                      last={idx === foundMedications.length - 1}
                      title={med.name}
                      value={med.dosage}
                      subtitle={med.frequency ? `${med.frequency}${med.reason ? ` · ${t('documentUpload.medicationReasonSuffix', { reason: med.reason })}` : ''}` : undefined}
                      onRemove={() => setMergedProfile(p => ({ ...p, medications: p.medications.filter((_, mi) => mi !== i) }))}
                      onEdit={() => openMedicationEdit(i)}
                    />
                  ))}
                </NHSListSection>
              )}

              {hasMetrics && (
                <NHSListSection title={t('documentUpload.bodyMetrics')} styles={s}>
                  {metricRows.map((m, i) => (
                    <NHSRow
                      key={m.label}
                      styles={s}
                      last={i === metricRows.length - 1}
                      title={m.label}
                      value={m.value}
                      onRemove={m.onRemove}
                      onEdit={() => openMetricEdit(m.field, m.label)}
                    />
                  ))}
                </NHSListSection>
              )}

              <Text style={s.savedHint}>{t('documentUpload.savedHint')}</Text>
            </>
          )}

        </ScrollView>

        <View style={s.footer}>
          <View style={tabletCap}>
            {isEmpty ? (
              <TouchableOpacity style={s.primaryBtn} onPress={() => setStep('upload')} activeOpacity={0.88}>
                <Text style={s.primaryBtnText}>{t('documentUpload.uploadDifferentButton')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.primaryBtn} onPress={handleSave} activeOpacity={0.88}>
                <Text style={s.primaryBtnText}>{t('documentUpload.saveToProfileButton')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <EditModal
          styles={s}
          editing={editing}
          values={editValues}
          onChangeValue={(key, v) => setEditValues(prev => ({ ...prev, [key]: v }))}
          flag={editFlag}
          onChangeFlag={setEditFlag}
          onCancel={() => setEditing(null)}
          onSave={handleEditSave}
        />
      </SafeAreaView>
      </FeatureGate>
    );
  }

  // ── Upload state ───────────────────────────────────────────
  return (
    <FeatureGate feature="documentUpload" fullScreen>
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />

      <View style={s.uploadHeader}>
        <View style={{ flex: 1 }}>
          <Text style={s.uploadHeaderTitle}>📋 {t('documentUpload.uploadHeaderTitle')}</Text>
          <Text style={s.uploadHeaderSub}>{t('documentUpload.uploadHeaderSub')}</Text>
        </View>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.skipLink}>{t('common.skip')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={tabletScrollContent}>

        <Text style={s.limitText}>{t('documentUpload.limitText', { count: uploadedDocs.length, max: MAX_DOCUMENTS })}</Text>

        <TouchableOpacity style={[s.uploadButton, remainingSlots <= 0 && s.uploadButtonDisabled]} onPress={pickDocument} activeOpacity={0.75}>
          <Text style={s.uploadButtonIcon}>📂</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.uploadButtonLabel}>{t('documentUpload.browseFilesLabel')}</Text>
            <Text style={s.uploadButtonSub}>{t('documentUpload.browseFilesSub')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[s.uploadButton, s.uploadButtonSpaced, remainingSlots <= 0 && s.uploadButtonDisabled]} onPress={pickImage} activeOpacity={0.75}>
          <Text style={s.uploadButtonIcon}>📸</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.uploadButtonLabel}>{t('documentUpload.photoLabel')}</Text>
            <Text style={s.uploadButtonSub}>{t('documentUpload.photoSub')}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.uploadButton, s.uploadButtonSpaced, remainingSlots <= 0 && s.uploadButtonDisabled]}
          onPress={() => setShowPasteModal(true)}
          activeOpacity={0.75}
          disabled={remainingSlots <= 0}
        >
          <Text style={s.uploadButtonIcon}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.uploadButtonLabel}>{t('documentUpload.pasteTextLabel')}</Text>
            <Text style={s.uploadButtonSub}>{t('documentUpload.pasteTextSub')}</Text>
          </View>
        </TouchableOpacity>

        {uploadedDocs.length > 0 && (
          <View style={s.fileListCard}>
            <Text style={s.fileListCardTitle}>{t('documentUpload.addedCount', { count: uploadedDocs.length, max: MAX_DOCUMENTS })}</Text>
            {uploadedDocs.map((doc, i) => (
              <View key={i} style={[s.fileRow, i < uploadedDocs.length - 1 && s.fileRowBorder]}>
                <Text style={s.fileRowIcon}>
                  {doc.type === 'image' ? '🖼️' : doc.type === 'pdf' ? '📄' : '📝'}
                </Text>
                <Text style={s.fileRowName} numberOfLines={1}>{doc.name}</Text>
                <TouchableOpacity
                  onPress={() => setUploadedDocs(prev => prev.filter((_, idx) => idx !== i))}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.fileRowRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={s.privacyNote}>
          <Text style={s.privacyNoteIcon}>🔒</Text>
          <Text style={s.privacyNoteText}>
            {t('documentUpload.privacyNote')}
          </Text>
        </View>

      </ScrollView>

      {uploadedDocs.length > 0 && (
        <View style={s.footer}>
          <View style={tabletCap}>
            <TouchableOpacity style={s.primaryBtn} onPress={runExtraction} activeOpacity={0.88}>
              <Text style={s.primaryBtnText}>
                {t('documentUpload.analyseButton', { count: uploadedDocs.length })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Modal visible={showPasteModal} transparent animationType="fade" onRequestClose={() => setShowPasteModal(false)}>
        <KeyboardAvoidingView style={s.editOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.editCard}>
            <Text style={s.editCardTitle}>{t('documentUpload.pasteTextModalTitle')}</Text>
            <View style={s.editFieldWrap}>
              <TextInput
                style={s.pasteTextInput}
                value={pasteText}
                onChangeText={setPasteText}
                placeholder={t('documentUpload.pasteTextPlaceholder')}
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlignVertical="top"
                autoFocus
              />
            </View>
            <View style={s.editActionsRow}>
              <TouchableOpacity style={s.editCancelBtn} onPress={() => { setShowPasteModal(false); setPasteText(''); }} activeOpacity={0.8}>
                <Text style={s.editCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.editSaveBtn} onPress={addPastedText} activeOpacity={0.85}>
                <Text style={s.editSaveText}>{t('documentUpload.pasteTextAddButton')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
    </FeatureGate>
  );
}

// ── Sub-components ───────────────────────────────────────────

// NHS App results-list style: a bold category title above a flat, rounded
// list card — rows inside are divided by hairlines, no per-row card/border.
function NHSListSection({ title, caution, children, styles }: { title: string; caution?: boolean; children: React.ReactNode; styles: DocUploadStyles }) {
  return (
    <View style={styles.nhsSection}>
      <Text style={styles.nhsSectionTitle}>{caution ? '⚠️ ' : ''}{title}</Text>
      <View style={styles.nhsListCard}>{children}</View>
    </View>
  );
}

// One row: bold title + optional value (coloured when out of range) on the
// top line, an optional subtitle + status pill on the second line — same
// shape as the NHS App's "Latest results" rows. ✕ replaces their chevron
// since our list is editable (nothing's saved yet at this point).
function NHSRow({ title, value, valueColor, subtitle, badgeText, badgeColor, badgeBg, badgeBorder, onRemove, onEdit, last, styles }: {
  title: string;
  value?: string;
  valueColor?: string;
  subtitle?: string;
  badgeText?: string | null;
  badgeColor?: string;
  badgeBg?: string;
  badgeBorder?: string;
  onRemove: () => void;
  onEdit?: () => void;
  last?: boolean;
  styles: DocUploadStyles;
}) {
  return (
    <View style={[styles.nhsRow, !last && styles.nhsRowBorder]}>
      <View style={{ flex: 1 }}>
        <View style={styles.nhsRowTop}>
          <Text style={styles.nhsRowTitle} numberOfLines={1}>{title}</Text>
          {value ? <Text style={[styles.nhsRowValue, valueColor && { color: valueColor }]} numberOfLines={1}>{value}</Text> : null}
        </View>
        {(subtitle || badgeText) && (
          <View style={styles.nhsRowBottom}>
            <Text style={styles.nhsRowSubtitle} numberOfLines={1}>{subtitle || ''}</Text>
            {badgeText ? (
              <View style={[styles.nhsBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
                <Text style={[styles.nhsBadgeText, { color: badgeColor }]}>{badgeText}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
      {onEdit && (
        <TouchableOpacity onPress={onEdit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.nhsRowEdit}>
          <Text style={styles.nhsRowEditText}>✎</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.nhsRowRemove}>
        <Text style={styles.nhsRowRemoveText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// Small centred form for correcting one extracted item before saving —
// shape of fields shown depends on `editing.kind` (chip / medication / test
// result / metric), driven by the `fields` spec so one component covers all.
function EditModal({ editing, values, onChangeValue, flag, onChangeFlag, onCancel, onSave, styles }: {
  editing: EditState | null;
  values: Record<string, string>;
  onChangeValue: (key: string, value: string) => void;
  flag?: HealthTestResult['flag'];
  onChangeFlag: (flag: HealthTestResult['flag'] | undefined) => void;
  onCancel: () => void;
  onSave: () => void;
  styles: DocUploadStyles;
}) {
  const { t } = useTranslation();
  const FLAG_OPTIONS: { key: HealthTestResult['flag'] | undefined; label: string }[] = [
    { key: undefined, label: t('documentUpload.flagOptionNone') },
    { key: 'normal', label: t('documentUpload.flagOptionNormal') },
    { key: 'low', label: t('documentUpload.flagOptionLow') },
    { key: 'high', label: t('documentUpload.flagOptionHigh') },
    { key: 'abnormal', label: t('documentUpload.flagOptionAbnormal') },
  ];

  return (
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.editOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.editCard}>
          <Text style={styles.editCardTitle}>{editing?.title}</Text>

          {editing?.fields.map(f => (
            <View key={f.key} style={styles.editFieldWrap}>
              <Text style={styles.editFieldLabel}>{f.label}</Text>
              <TextInput
                style={styles.editFieldInput}
                value={values[f.key] ?? ''}
                onChangeText={v => onChangeValue(f.key, v)}
                keyboardType={f.keyboardType || 'default'}
                placeholderTextColor={Colors.textMuted}
                autoFocus={f === editing.fields[0]}
              />
            </View>
          ))}

          {editing?.showFlag && (
            <View style={styles.editFieldWrap}>
              <Text style={styles.editFieldLabel}>{t('documentUpload.statusLabel')}</Text>
              <View style={styles.flagOptionsRow}>
                {FLAG_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.flagOption, flag === opt.key && styles.flagOptionSel]}
                    onPress={() => onChangeFlag(opt.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.flagOptionText, flag === opt.key && styles.flagOptionTextSel]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.editActionsRow}>
            <TouchableOpacity style={styles.editCancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.editCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editSaveBtn} onPress={onSave} activeOpacity={0.85}>
              <Text style={styles.editSaveText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function mergeArrays(existing: string[] = [], newItems: string[] = []): string[] {
  const combined = [...existing];
  for (const item of newItems) {
    if (!combined.some(e => e.toLowerCase() === item.toLowerCase())) combined.push(item);
  }
  return combined;
}

function mergeMedications(existing: any[] = [], newMeds: any[] = []): any[] {
  const combined = [...existing];
  for (const med of newMeds) {
    if (!combined.some(e => e.name.toLowerCase() === med.name.toLowerCase())) combined.push(med);
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

// A re-tested value supersedes the old one rather than accumulating duplicates —
// what matters for product-relevance checks later is the latest known reading.
function mergeTestResults(existing: HealthTestResult[] = [], newResults: { name: string; value: string; range?: string; flag?: string }[] = []): HealthTestResult[] {
  const now = new Date().toISOString();
  const combined = existing.filter(e => !newResults.some(n => normalizeTestName(n.name) === normalizeTestName(e.name)));
  for (const t of newResults) {
    combined.push({ name: t.name, value: t.value, range: t.range, flag: t.flag as HealthTestResult['flag'], recordedAt: now });
  }
  return combined;
}

// ── Styles ────────────────────────────────────────────────────

type DocUploadStyles = ReturnType<typeof createStyles>;

function createStyles(rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rr: (n: number) => number) {
  return StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  centered:    { justifyContent: 'center', alignItems: 'center', paddingHorizontal: rw(32) },

  scrollContent: { paddingHorizontal: rw(20), paddingTop: rh(20), paddingBottom: rh(130) },

  // Upload header
  uploadHeader:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: rw(20), paddingTop: rh(16), paddingBottom: rh(16), borderBottomWidth: 1, borderBottomColor: Colors.border },
  uploadHeaderTitle: { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(3) },
  uploadHeaderSub:   { fontSize: rf(13), color: Colors.textSecondary, lineHeight: rf(18) },
  skipLink:          { fontSize: rf(14), color: Colors.textMuted, paddingTop: rh(4) },

  // Upload buttons — full-width stacked
  uploadButton: {
    flexDirection:   'row',
    alignItems:      'center',
    height:          rh(80),
    backgroundColor: Colors.surfaceAlt,
    borderRadius:    rr(14),
    borderWidth:     1.5,
    borderColor:     Colors.navy,
    borderStyle:     'dashed',
    paddingHorizontal: rw(20),
    gap:             rw(16),
    marginBottom:    rh(0),
  },
  uploadButtonSpaced: { marginTop: rh(12) },
  uploadButtonDisabled: { opacity: 0.4 },
  uploadButtonIcon:   { fontSize: rf(26) },
  uploadButtonLabel:  { fontSize: rf(15), fontWeight: '700', color: Colors.navy, marginBottom: rh(3) },
  uploadButtonSub:    { fontSize: rf(12), color: Colors.textSecondary },
  limitText:          { fontSize: rf(12), color: Colors.textMuted, marginBottom: rh(10) },

  // File list card
  fileListCard:      { backgroundColor: Colors.surfaceAlt, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, paddingHorizontal: rw(14), paddingTop: rh(12), paddingBottom: rh(4), marginTop: rh(20) },
  fileListCardTitle: { fontSize: rf(13), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  fileRow:           { flexDirection: 'row', alignItems: 'center', gap: rw(10), paddingVertical: rh(10) },
  fileRowBorder:     { borderBottomWidth: 1, borderBottomColor: Colors.border },
  fileRowIcon:       { fontSize: rf(18) },
  fileRowName:       { flex: 1, fontSize: rf(13), color: Colors.textPrimary },
  fileRowRemove:     { fontSize: rf(14), color: Colors.danger, paddingLeft: rw(8) },

  // Privacy note
  privacyNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: rw(8), marginTop: rh(24), paddingHorizontal: rw(4) },
  privacyNoteIcon: { fontSize: rf(13), marginTop: rh(1) },
  privacyNoteText: { flex: 1, fontSize: rf(12), color: Colors.textMuted, lineHeight: rf(18) },

  // Footer sticky button
  footer:         { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: rw(20), paddingVertical: rh(16), backgroundColor: Colors.bg, borderTopWidth: 1, borderTopColor: Colors.border },
  primaryBtn:     { backgroundColor: Colors.navy, borderRadius: rr(14), paddingVertical: rh(16), alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: rf(16) },

  // Processing state
  processingSpinner:   { marginBottom: rh(24) },
  processingTitle:     { fontSize: rf(20), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: rh(8) },
  processingSub:       { fontSize: rf(14), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(22), marginBottom: rh(20) },
  progressTrack:       { width: '100%', height: rh(8), backgroundColor: Colors.surfaceAlt, borderRadius: rr(4), overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  progressFill:        { height: '100%', backgroundColor: Colors.navy, borderRadius: rr(4) },
  progressPct:         { fontSize: rf(12), color: Colors.textMuted, marginTop: rh(8), fontWeight: '600' },
  processingCancelBtn:  { marginTop: rh(32), paddingHorizontal: rw(24), paddingVertical: rh(12), borderRadius: rr(12), borderWidth: 1, borderColor: Colors.border },
  processingCancelText: { fontSize: rf(14), fontWeight: '700', color: Colors.textSecondary },

  // Saving state
  savingTitle: { fontSize: rf(16), fontWeight: '600', color: Colors.textPrimary, textAlign: 'center', marginTop: rh(16) },

  // Done state
  doneEmoji:     { fontSize: rf(72), textAlign: 'center', marginBottom: rh(20) },
  doneTitle:     { fontSize: rf(26), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: rh(20) },
  doneBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8), justifyContent: 'center', marginBottom: rh(20) },
  doneBadge:     { backgroundColor: Colors.navyLight, borderRadius: rr(999), paddingHorizontal: rw(14), paddingVertical: rh(6), borderWidth: 1, borderColor: Colors.navy + '30' },
  doneBadgeText: { fontSize: rf(13), fontWeight: '600', color: Colors.navy },
  doneSub:       { fontSize: rf(15), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(22), paddingHorizontal: rw(16) },

  // Review header
  reviewHeader:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: rw(20), paddingTop: rh(16), paddingBottom: rh(14), borderBottomWidth: 1, borderBottomColor: Colors.border },
  reviewHeaderTitle:   { fontSize: rf(17), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', flex: 1 },
  backBtn:             { paddingRight: rw(8) },
  backBtnText:         { fontSize: rf(14), color: Colors.navy, fontWeight: '600' },
  backBtnPlaceholder:  { width: rw(48) },

  // Page header — plain title + meta row (source docs, confidence), NHS-App style
  pageTitle:    { fontSize: rf(22), fontWeight: '800', color: Colors.textPrimary, lineHeight: rf(28), marginBottom: rh(12) },
  pageMetaRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rh(20), gap: rw(8) },
  pageMetaText: { flex: 1, fontSize: rf(12), color: Colors.textMuted },
  confidenceBadge:     { flexShrink: 0, borderRadius: rr(999), paddingHorizontal: rw(10), paddingVertical: rh(4), borderWidth: 1 },
  confidenceBadgeText: { fontSize: rf(10), fontWeight: '800', letterSpacing: 0.5 },

  reviewBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: rw(8), borderRadius: rr(12), borderWidth: 1, padding: rw(12), marginBottom: rh(18) },
  reviewBannerIcon: { fontSize: rf(15), marginTop: rh(1) },
  reviewBannerText: { flex: 1, fontSize: rf(12.5), fontWeight: '600', lineHeight: rf(18) },

  reportEmpty:     { padding: rw(20), alignItems: 'center' },
  reportEmptyIcon: { fontSize: rf(32), marginBottom: rh(12) },
  reportEmptyText: { fontSize: rf(14), color: Colors.textPrimary, textAlign: 'center', lineHeight: rf(21), marginBottom: rh(10) },
  reportEmptyHint: { fontSize: rf(12), color: Colors.textSecondary, textAlign: 'center', lineHeight: rf(18) },

  // NHS App "Latest results" style: bold category title above a flat rounded
  // list card, rows divided by hairlines (not individually bordered cards).
  nhsSection:      { marginBottom: rh(22) },
  nhsSectionTitle: { fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  nhsListCard:     { backgroundColor: Colors.surface, borderRadius: rr(14), borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },

  nhsRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: rw(16), paddingVertical: rh(13), gap: rw(10) },
  nhsRowBorder:  { borderBottomWidth: 1, borderBottomColor: Colors.border },
  nhsRowTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rw(10) },
  nhsRowTitle:   { flex: 1, fontSize: rf(15), fontWeight: '700', color: Colors.textPrimary },
  nhsRowValue:   { flexShrink: 0, maxWidth: '45%', fontSize: rf(16), fontWeight: '800', color: Colors.textPrimary, textAlign: 'right' },
  nhsRowBottom:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: rh(4), gap: rw(8) },
  nhsRowSubtitle:{ flex: 1, fontSize: rf(12), color: Colors.textMuted },
  nhsBadge:      { flexShrink: 0, borderRadius: rr(6), paddingHorizontal: rw(8), paddingVertical: rh(3), borderWidth: 1 },
  nhsBadgeText:  { fontSize: rf(10), fontWeight: '700', letterSpacing: 0.3 },
  nhsRowEdit:       { flexShrink: 0, paddingLeft: rw(4) },
  nhsRowEditText:   { fontSize: rf(15), color: Colors.navy },
  nhsRowRemove:     { flexShrink: 0, paddingLeft: rw(4) },
  nhsRowRemoveText: { fontSize: rf(14), color: Colors.danger },

  savedHint: { fontSize: rf(12), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(18), marginTop: rh(4) },

  // Edit modal
  editOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: rw(24) },
  editCard:       { width: '100%', maxWidth: rw(360), backgroundColor: Colors.surface, borderRadius: rr(18), padding: rw(20) },
  editCardTitle:  { fontSize: rf(16), fontWeight: '800', color: Colors.textPrimary, marginBottom: rh(16) },
  editFieldWrap:  { marginBottom: rh(14) },
  editFieldLabel: { fontSize: rf(12), fontWeight: '600', color: Colors.textSecondary, marginBottom: rh(6) },
  editFieldInput: { backgroundColor: Colors.surfaceAlt, borderRadius: rr(10), paddingHorizontal: rw(12), paddingVertical: rh(10), fontSize: rf(14), color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border },
  pasteTextInput: { backgroundColor: Colors.surfaceAlt, borderRadius: rr(10), paddingHorizontal: rw(12), paddingVertical: rh(10), fontSize: rf(14), color: Colors.textPrimary, borderWidth: 1, borderColor: Colors.border, height: rh(220) },

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
  });
}
