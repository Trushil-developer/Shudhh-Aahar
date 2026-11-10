// src/screens/UploadCouponScreen.tsx
// Coupon Exchange — share a coupon. Expiry and the optional validity-start
// date are real calendar dates (@react-native-community/datetimepicker) —
// some real coupons are only usable between two printed dates (e.g. "valid
// 1 Oct - 15 Oct"), not simply "N days from today", so a relative day-count
// wasn't enough.
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, Alert, Platform, Switch, Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { launchImageLibrary } from 'react-native-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Colors, Shadow, RETAILER_ICONS, DEFAULT_RETAILER_ICON } from '../theme/medical';
import { useResponsive } from '../utils/responsive';
import { RETAILERS, Retailer, createCoupon, uploadCouponImage } from '../services/couponService';
import CouponCameraScreen, { CapturedCouponPhoto } from './CouponCameraScreen';
import logger from '../utils/logger';

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// A tappable date field. Android's native picker is a self-dismissing dialog
// (one onChange with the final value, then gone); iOS's has no such built-in
// dismiss, so it stays open — with a Done button — until the user taps it.
function DateField({ label, value, minimumDate, onChange }: { label: string; value: Date; minimumDate?: Date; onChange: (d: Date) => void }) {
  const { rw, rh, rStyles } = useResponsive();
  const s = fieldStyles(rw, rh, rStyles);
  const [open, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && date) onChange(date);
  };

  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={s.fieldText}>📅 {formatDate(value)}</Text>
      </TouchableOpacity>
      {open && (
        <>
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={minimumDate}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={s.doneBtn} onPress={() => setOpen(false)}>
              <Text style={s.doneBtnText}>Done</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const fieldStyles = (rw: (n: number) => number, rh: (n: number) => number, rStyles: any) => StyleSheet.create({
  label: { fontSize: rStyles.text.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  field: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: rStyles.radius.md, paddingHorizontal: rw(14), paddingVertical: rh(12),
    backgroundColor: Colors.bg,
  },
  fieldText: { fontSize: rStyles.text.base, color: Colors.textPrimary, fontWeight: '600' },
  doneBtn: { alignSelf: 'flex-end', paddingVertical: rh(8), paddingHorizontal: rw(16) },
  doneBtnText: { color: Colors.navy, fontWeight: '700', fontSize: rStyles.text.base },
});

const DEFAULT_EXPIRY_DAYS = 7;

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  const { rw, rh, rStyles } = useResponsive();
  return (
    <View style={[sectionStyles(rw, rh, rStyles).card, Shadow.card]}>
      <Text style={sectionStyles(rw, rh, rStyles).heading}>{icon} {title}</Text>
      {children}
    </View>
  );
}

const sectionStyles = (rw: (n: number) => number, rh: (n: number) => number, rStyles: any) => StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: rStyles.radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: rStyles.space.lg, marginBottom: rStyles.space.md,
  },
  heading: { fontSize: rStyles.text.base, fontWeight: '800', color: Colors.textPrimary, marginBottom: rStyles.space.md },
});

export default function UploadCouponScreen({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useTranslation();
  const { rw, rh, rf, rStyles } = useResponsive();
  const s = styles(rw, rh, rf, rStyles);

  const [retailer, setRetailer] = useState<Retailer>(RETAILERS[0]);
  const [title, setTitle] = useState('');
  const [codeText, setCodeText] = useState('');
  const [hasValidFrom, setHasValidFrom] = useState(false);
  const [validFrom, setValidFrom] = useState(new Date());
  const [expiryAt, setExpiryAt] = useState(new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000));
  const [photo, setPhoto] = useState<CapturedCouponPhoto | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const pickPhoto = () => {
    Alert.alert(t('coupon.uploadPhotoButton'), undefined, [
      // The guided scanner (CouponCameraScreen) only lets a shot through once
      // it actually decodes a barcode/QR in frame — see that screen's header
      // comment for why that's a better filter than checking blur after the
      // fact. Photo Library stays as a plain picker since a shot chosen from
      // an existing photo/screenshot has no live frame to scan.
      { text: t('coupon.photoSourceCamera'), onPress: () => setShowCamera(true) },
      {
        text: t('coupon.photoSourceLibrary'),
        onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.8 }, (res) => {
          const asset = res.assets?.[0];
          if (asset?.uri && asset.type) setPhoto({ uri: asset.uri, type: asset.type });
        }),
      },
      { text: t('coupon.claimConfirmCancel'), style: 'cancel' },
    ]);
  };

  const submit = async () => {
    if (!photo?.uri || !photo.type) {
      Alert.alert(t('coupon.title'), t('coupon.uploadMissingPhoto'));
      return;
    }
    if (hasValidFrom && validFrom.getTime() >= expiryAt.getTime()) {
      Alert.alert(t('coupon.title'), t('coupon.uploadValidFromAfterExpiry'));
      return;
    }
    setSubmitting(true);
    try {
      setUploadingImage(true);
      const imageKey = await uploadCouponImage(photo.uri, photo.type);
      setUploadingImage(false);

      await createCoupon({
        retailer,
        title: title.trim() || undefined,
        codeText: codeText.trim() || undefined,
        validFrom: hasValidFrom ? validFrom.toISOString() : undefined,
        expiryAt: expiryAt.toISOString(),
        imageKey,
      });

      Alert.alert(t('coupon.title'), t('coupon.uploadSuccess'));
      setTitle('');
      setCodeText('');
      setPhoto(null);
      onUploaded();
    } catch (err: any) {
      logger.warn('coupon', 'createCoupon failed', {}, err as Error);
      Alert.alert(t('coupon.title'), err?.message || t('coupon.uploadError'));
    } finally {
      setSubmitting(false);
      setUploadingImage(false);
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={s.container}>
      <Section icon="🏬" title={t('coupon.uploadRetailerLabel')}>
        <View style={s.chipRow}>
          {RETAILERS.map((r) => (
            <TouchableOpacity key={r} style={[s.chip, retailer === r && s.chipActive]} onPress={() => setRetailer(r)} activeOpacity={0.8}>
              <Text style={s.chipIcon}>{RETAILER_ICONS[r] || DEFAULT_RETAILER_ICON}</Text>
              <Text style={[s.chipText, retailer === r && s.chipTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section icon="📝" title={t('coupon.detailsSectionTitle')}>
        <Text style={s.fieldLabel}>{t('coupon.uploadTitleLabel')}</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={t('coupon.uploadTitlePlaceholder')} placeholderTextColor={Colors.textMuted} />
        <Text style={[s.fieldLabel, { marginTop: rh(14) }]}>{t('coupon.uploadCodeLabel')}</Text>
        <TextInput style={s.input} value={codeText} onChangeText={setCodeText} placeholder={t('coupon.uploadCodePlaceholder')} placeholderTextColor={Colors.textMuted} />
      </Section>

      <Section icon="📅" title={t('coupon.validitySectionTitle')}>
        <View style={s.toggleRow}>
          <Text style={[s.fieldLabel, { flex: 1, marginBottom: 0 }]}>{t('coupon.uploadValidFromToggle')}</Text>
          <Switch value={hasValidFrom} onValueChange={setHasValidFrom} trackColor={{ true: Colors.navy }} />
        </View>
        {hasValidFrom && (
          <View style={{ marginTop: rh(14) }}>
            <DateField label={t('coupon.uploadValidFromLabel')} value={validFrom} minimumDate={new Date()} onChange={setValidFrom} />
          </View>
        )}
        <View style={{ marginTop: rh(14) }}>
          <DateField
            label={t('coupon.uploadExpiryLabel')}
            value={expiryAt}
            minimumDate={hasValidFrom ? validFrom : new Date()}
            onChange={setExpiryAt}
          />
        </View>
      </Section>

      <Section icon="📷" title={t('coupon.uploadPhotoLabel')}>
        <Text style={s.photoHint}>{t('coupon.uploadPhotoHint')}</Text>
        {photo?.uri ? (
          <View style={s.previewWrap}>
            <Image source={{ uri: photo.uri }} style={s.preview} />
            <TouchableOpacity style={s.removePhotoBtn} onPress={() => setPhoto(null)}>
              <Text style={s.removePhotoBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.dropzone} onPress={pickPhoto} activeOpacity={0.7}>
            <Text style={s.dropzoneIcon}>📷</Text>
            <Text style={s.dropzoneText}>{t('coupon.uploadPhotoButton')}</Text>
          </TouchableOpacity>
        )}
        {!!photo && (
          <TouchableOpacity style={s.retakeBtn} onPress={pickPhoto}>
            <Text style={s.retakeBtnText}>{t('coupon.uploadPhotoRetake')}</Text>
          </TouchableOpacity>
        )}
      </Section>

      <View style={s.pointsCard}>
        <Text style={s.pointsCardIcon}>🪙</Text>
        <Text style={s.pointsCardText}>{t('coupon.uploadPointsHint')}</Text>
      </View>

      <TouchableOpacity style={s.submitBtn} disabled={submitting} onPress={submit} activeOpacity={0.85}>
        {submitting
          ? <ActivityIndicator color={Colors.textWhite} />
          : <Text style={s.submitBtnText}>{t('coupon.uploadSubmit')}</Text>}
      </TouchableOpacity>
      {uploadingImage && <Text style={s.uploadingText}>{t('coupon.uploadingImage')}</Text>}
    </ScrollView>

    {/* animationType="none" — the camera itself already has real native
        start-up/teardown latency (initialising the hardware session);
        adding a ~300ms slide transition on top of that on every open/cancel
        only made it feel slower for no benefit. */}
    <Modal visible={showCamera} animationType="none" presentationStyle="fullScreen">
      {/* Modal presents in its own native window — SafeAreaProvider must be
          nested here too, or CouponCameraScreen's SafeAreaViews silently get
          zero insets (same gotcha fixed in MyCouponsScreen's image viewer). */}
      <SafeAreaProvider>
        <CouponCameraScreen
          onCaptured={(p) => { setPhoto(p); setShowCamera(false); }}
          onCancel={() => setShowCamera(false)}
        />
      </SafeAreaProvider>
    </Modal>
    </>
  );
}

const styles = (rw: (n: number) => number, rh: (n: number) => number, rf: (n: number) => number, rStyles: any) => StyleSheet.create({
  container: { padding: rStyles.space.lg, paddingBottom: rh(40) },
  fieldLabel: { fontSize: rStyles.text.sm, fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8) },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: rw(8) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: rw(6),
    paddingVertical: rh(8), paddingHorizontal: rw(14), borderRadius: rStyles.radius.pill, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg,
  },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipIcon: { fontSize: rStyles.text.sm },
  chipText: { fontSize: rStyles.text.sm, color: Colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: Colors.textWhite },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: rStyles.radius.md, paddingHorizontal: rw(14), paddingVertical: rh(10),
    fontSize: rStyles.text.base, color: Colors.textPrimary, backgroundColor: Colors.bg,
  },
  photoHint: { fontSize: rStyles.text.xs, color: Colors.textMuted, lineHeight: rf(16), marginBottom: rh(12) },
  dropzone: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.borderStrong, borderRadius: rStyles.radius.md,
    paddingVertical: rh(28), alignItems: 'center', backgroundColor: Colors.bg,
  },
  dropzoneIcon: { fontSize: rf(28), marginBottom: rh(6) },
  dropzoneText: { color: Colors.navy, fontWeight: '700', fontSize: rStyles.text.base },
  previewWrap: { position: 'relative' },
  preview: { width: '100%', height: rh(180), borderRadius: rStyles.radius.md, resizeMode: 'cover' },
  removePhotoBtn: {
    position: 'absolute', top: rh(8), right: rw(8), width: rw(28), height: rw(28), borderRadius: rw(14),
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  removePhotoBtnText: { color: Colors.textWhite, fontWeight: '700', fontSize: rStyles.text.sm },
  retakeBtn: { alignSelf: 'center', marginTop: rh(10) },
  retakeBtnText: { color: Colors.navy, fontWeight: '700', fontSize: rStyles.text.sm },
  pointsCard: {
    flexDirection: 'row', alignItems: 'center', gap: rw(10), backgroundColor: Colors.infoBg, borderWidth: 1, borderColor: Colors.infoBorder,
    borderRadius: rStyles.radius.md, padding: rStyles.space.md, marginBottom: rStyles.space.lg,
  },
  pointsCardIcon: { fontSize: rf(20) },
  pointsCardText: { flex: 1, fontSize: rStyles.text.xs, color: Colors.textSecondary, lineHeight: rf(17) },
  submitBtn: { backgroundColor: Colors.navy, borderRadius: rStyles.radius.pill, paddingVertical: rh(15), alignItems: 'center' },
  submitBtnText: { color: Colors.textWhite, fontWeight: '800', fontSize: rStyles.text.md },
  uploadingText: { textAlign: 'center', color: Colors.textMuted, fontSize: rStyles.text.xs, marginTop: rh(8) },
});
