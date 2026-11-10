// src/screens/CouponCameraScreen.tsx
// Coupon Exchange — a guided camera for photographing a coupon's barcode,
// mirroring ScanScreen's permission/device/camera-timeout handling almost
// exactly (same react-native-vision-camera setup already used for product
// scanning). The key difference from a plain camera shutter: this only lets
// you capture once the live code scanner actually decodes a barcode/QR code
// in frame. A blurry, badly-angled, or too-far-away shot simply won't decode
// — so "wait for a detection" is a strictly better filter than trying to
// assess sharpness after the fact, and it's the same reason no retailer
// coupon a claimant receives this way should ever fail to scan at the till.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Vibration, Linking, AppState, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevices, useCameraFormat, useCodeScanner } from 'react-native-vision-camera';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../utils/responsive';
import { Colors } from '../theme/medical';
import logger from '../utils/logger';

export interface CapturedCouponPhoto { uri: string; type: string }

// Post-detection delay before the shutter fires — long enough for the
// "barcode detected" flash to actually be visible and for handshake to
// settle a touch, short enough that it still feels instant.
const CAPTURE_DELAY_MS = 120;

export default function CouponCameraScreen({ onCaptured, onCancel }: {
  onCaptured: (photo: CapturedCouponPhoto) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const { width, isTablet, rw, rh, rf, rr } = useResponsive();
  const FRAME_W = isTablet ? Math.min(width, 600) * 0.7 : width * 0.82;
  const FRAME_H = FRAME_W * 0.55; // wide rectangle — barcodes are wide/short, not square like a QR frame

  const styles = React.useMemo(() => {
    const CORNER = rw(22);
    const BORDER = rw(3);
    return StyleSheet.create({
      container: { flex: 1, backgroundColor: '#000' },
      center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
      statusText: { color: '#888', fontSize: rf(16) },
      errorIcon: { fontSize: rf(48), marginBottom: rh(16) },
      errorTitle: { color: '#FFF', fontSize: rf(20), fontWeight: '700', marginBottom: rh(8) },
      errorSub: { color: '#888', textAlign: 'center', lineHeight: rf(22), marginBottom: rh(24) },
      actionBtn: { backgroundColor: Colors.navy, borderRadius: rr(14), paddingHorizontal: rw(28), paddingVertical: rh(14), marginBottom: rh(12) },
      actionBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(15) },
      backBtn: { backgroundColor: 'transparent', borderRadius: rr(14), paddingHorizontal: rw(28), paddingVertical: rh(14), borderWidth: 1, borderColor: '#555' },
      backBtnText: { color: '#888', fontWeight: '600', fontSize: rf(15) },
      overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
      frame: { width: FRAME_W, height: FRAME_H, borderRadius: rr(12) },
      corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: Colors.safe },
      topLeft: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
      topRight: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
      bottomLeft: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
      bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },
      topBar: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: rw(20), paddingVertical: rh(12),
      },
      topTitle: { color: '#FFF', fontSize: rf(16), fontWeight: '600' },
      iconBtn: { width: rw(42), height: rw(42), borderRadius: rw(21), backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
      iconBtnText: { fontSize: rf(16), color: '#FFF' },
      bottomHint: { position: 'absolute', bottom: rh(60), left: 0, right: 0, alignItems: 'center', paddingHorizontal: rw(32) },
      hintText: { color: '#FFF', fontSize: rf(15), fontWeight: '600', marginBottom: rh(4), textAlign: 'center' },
      hintTextDetected: { color: Colors.safe },
      hintSub: { color: 'rgba(255,255,255,0.6)', fontSize: rf(12), textAlign: 'center' },
      reviewBar: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', gap: rw(12), padding: rw(20), backgroundColor: 'rgba(0,0,0,0.5)',
      },
      retakeBtn: { flex: 1, borderWidth: 1, borderColor: '#FFF', borderRadius: rr(14), paddingVertical: rh(14), alignItems: 'center' },
      retakeBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(15) },
      useBtn: { flex: 1, backgroundColor: Colors.safe, borderRadius: rr(14), paddingVertical: rh(14), alignItems: 'center' },
      useBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(15) },
    });
  }, [rw, rh, rf, rr, isTablet, FRAME_W, FRAME_H]);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [detected, setDetected] = useState(false);
  const [captured, setCaptured] = useState<CapturedCouponPhoto | null>(null);
  const [imageReady, setImageReady] = useState(false);
  // Synchronous guard, same reasoning as ScanScreen's scanLockRef — the
  // native scanner can still call onCodeScanned once more for the next
  // frame before React has re-rendered with isActive={false}.
  const scanLockRef = useRef(false);
  const camera = useRef<Camera>(null);

  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === 'back');
  // Without this, takePhoto() defaults to the device's maximum sensor
  // resolution (often 12MP+) — a coupon barcode photo doesn't need that, and
  // decoding/displaying a huge bitmap right after capture is exactly what
  // was making the review screen sit blank/janky for a couple of seconds.
  // videoResolution is listed first (higher priority) so live code-scanning
  // accuracy isn't traded away for a smaller photo — 1080p is already far
  // more than a barcode needs to decode reliably, it just stops the format
  // picker from also reaching for a needlessly huge *photo* by default.
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1920, height: 1080 } },
    { photoResolution: { width: 1280, height: 960 } },
  ]);

  const [cameraTimedOut, setCameraTimedOut] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (device) { setCameraTimedOut(false); return; }
    setCameraTimedOut(false);
    const timer = setTimeout(() => setCameraTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, [device, retryTick]);

  const checkAndRequestPermission = useCallback(async () => {
    const current = await Camera.getCameraPermissionStatus();
    if (current === 'granted') {
      setHasPermission(true);
      setPermissionDenied(false);
    } else if (current === 'not-determined') {
      const result = await Camera.requestCameraPermission();
      setHasPermission(result === 'granted');
      setPermissionDenied(result !== 'granted');
    } else {
      setHasPermission(false);
      setPermissionDenied(true);
    }
  }, []);

  useEffect(() => { checkAndRequestPermission(); }, [checkAndRequestPermission]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndRequestPermission();
    });
    return () => sub.remove();
  }, [checkAndRequestPermission]);

  const retake = () => {
    setCaptured(null);
    setDetected(false);
    setImageReady(false);
    scanLockRef.current = false;
  };

  // Same code types ScanScreen already scans for (proven to work on this
  // vision-camera version) — covers every barcode format UK till coupons
  // realistically use, plus QR for digital/app-issued coupons.
  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr'],
    onCodeScanned: (codes) => {
      if (scanLockRef.current || codes.length === 0 || !codes[0].value) return;
      scanLockRef.current = true;
      setDetected(true);
      Vibration.vibrate(80);

      setTimeout(async () => {
        try {
          const photo = await camera.current?.takePhoto({ flash: 'off', enableShutterSound: true });
          if (photo) {
            setCaptured({ uri: `file://${photo.path}`, type: 'image/jpeg' });
          } else {
            scanLockRef.current = false;
            setDetected(false);
          }
        } catch (err) {
          logger.warn('coupon', 'CouponCameraScreen takePhoto failed', {}, err as Error);
          scanLockRef.current = false;
          setDetected(false);
        }
      }, CAPTURE_DELAY_MS);
    },
  });

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text style={styles.statusText}>{t('scan.requestingPermission')}</Text></View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorIcon}>📷</Text>
          <Text style={styles.errorTitle}>{t('scan.cameraAccessRequired')}</Text>
          <Text style={styles.errorSub}>{permissionDenied ? t('scan.permissionDeniedMessage') : t('scan.permissionNeededMessage')}</Text>
          {permissionDenied ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.actionBtnText}>{t('scan.openSettings')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={checkAndRequestPermission}>
              <Text style={styles.actionBtnText}>{t('scan.allowCamera')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
            <Text style={styles.backBtnText}>{t('scan.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    if (cameraTimedOut) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.center}>
            <Text style={styles.errorIcon}>📷</Text>
            <Text style={styles.errorTitle}>{t('scan.cameraUnavailable')}</Text>
            <Text style={styles.errorSub}>{t('scan.cameraUnavailableMessage')}</Text>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setRetryTick((n) => n + 1)}>
              <Text style={styles.actionBtnText}>{t('common.tryAgain')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
              <Text style={styles.backBtnText}>{t('scan.goBack')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}><Text style={styles.statusText}>{t('scan.loadingCamera')}</Text></View>
      </SafeAreaView>
    );
  }

  // Review step — shown once a barcode has been detected and the shutter
  // has fired. Still lets the user bail out and try again if the frame
  // looks wrong for any reason the scanner itself couldn't catch.
  if (captured) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: captured.uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoadEnd={() => setImageReady(true)}
        />
        {/* The captured photo can take a moment to decode right after the
            shutter fires — without this, the review screen sat blank with
            no feedback, which read as the Retake/Use buttons being
            unresponsive when they were actually working fine underneath. */}
        {!imageReady && (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator color="#FFF" size="large" />
          </View>
        )}
        <View style={styles.reviewBar}>
          <TouchableOpacity style={styles.retakeBtn} onPress={retake}>
            <Text style={styles.retakeBtnText}>↺ {t('coupon.cameraRetake')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.useBtn} disabled={!imageReady} onPress={() => onCaptured(captured)}>
            <Text style={styles.useBtnText}>✓ {t('coupon.cameraUsePhoto')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={!captured}
        codeScanner={codeScanner}
        photo={true}
      />

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame}>
          <View style={[styles.corner, styles.topLeft, detected && { borderColor: Colors.safe }]} />
          <View style={[styles.corner, styles.topRight, detected && { borderColor: Colors.safe }]} />
          <View style={[styles.corner, styles.bottomLeft, detected && { borderColor: Colors.safe }]} />
          <View style={[styles.corner, styles.bottomRight, detected && { borderColor: Colors.safe }]} />
        </View>
      </View>

      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity style={styles.iconBtn} onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.iconBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('coupon.cameraTitle')}</Text>
        <View style={styles.iconBtn} />
      </SafeAreaView>

      <SafeAreaView style={styles.bottomHint} edges={['bottom']} pointerEvents="none">
        <Text style={[styles.hintText, detected && styles.hintTextDetected]}>
          {detected ? `✓ ${t('coupon.cameraDetected')}` : t('coupon.cameraHint')}
        </Text>
        {!detected && <Text style={styles.hintSub}>{t('coupon.cameraHintSub')}</Text>}
      </SafeAreaView>
    </View>
  );
}
