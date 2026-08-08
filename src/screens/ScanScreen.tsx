import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevices, useCodeScanner } from 'react-native-vision-camera';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { RootStackParamList } from '../../App';
import { useScanLine, usePulse, useScalePress } from '../utils/animations';
import { useResponsive } from '../utils/responsive';
import { Colors } from '../theme/medical';
import { useSubscription } from '../hooks/useSubscription';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Scan'>;

export default function ScanScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { width, height, isTablet, isLandscape, rw, rh, rf, rr } = useResponsive();
  // On tablets, 72% of the full width would make an enormous scan frame —
  // cap it relative to the smaller of width/height instead.
  const FRAME_SIZE = isTablet ? Math.min(width, height) * 0.5 : width * 0.72;

  const styles = useMemo(() => {
    const CORNER = rw(24);
    const BORDER = rw(3);

    return StyleSheet.create({
      container: { flex: 1, backgroundColor: '#000' },
      center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) },
      statusText: { color: '#888', fontSize: rf(16) },
      errorIcon: { fontSize: rf(48), marginBottom: rh(16) },
      errorTitle: { color: '#FFF', fontSize: rf(20), fontWeight: '700', marginBottom: rh(8) },
      errorSub: { color: '#888', textAlign: 'center', lineHeight: rf(22), marginBottom: rh(24) },
      settingsBtn: { backgroundColor: Colors.navy, borderRadius: rr(14), paddingHorizontal: rw(28), paddingVertical: rh(14), marginBottom: rh(12) },
      settingsBtnText: { color: '#FFF', fontWeight: '700', fontSize: rf(15) },
      backBtn: { backgroundColor: 'transparent', borderRadius: rr(14), paddingHorizontal: rw(28), paddingVertical: rh(14), borderWidth: 1, borderColor: '#555' },
      backBtnText: { color: '#888', fontWeight: '600', fontSize: rf(15) },
      overlay: { ...StyleSheet.absoluteFillObject },
      darkArea: { backgroundColor: 'rgba(0,0,0,0.62)' },
      middleRow: { flexDirection: 'row', height: FRAME_SIZE },
      frame: { width: FRAME_SIZE, height: FRAME_SIZE, position: 'relative' },
      corner: {
        position: 'absolute',
        width: CORNER,
        height: CORNER,
        borderColor: Colors.safe,
      },
      topLeft: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
      topRight: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
      bottomLeft: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
      bottomRight: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },
      scanLine: {
        position: 'absolute',
        top: '50%',
        left: rw(8),
        right: rw(8),
        height: rh(2),
        backgroundColor: Colors.safe,
        opacity: 0.8,
      },
      topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: rw(20),
        paddingVertical: rh(12),
      },
      topTitle: { color: '#FFF', fontSize: rf(17), fontWeight: '600' },
      iconBtn: {
        width: rw(42),
        height: rw(42),
        borderRadius: rw(21),
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
      },
      iconBtnActive: { backgroundColor: 'rgba(0,132,61,0.5)' },
      iconBtnText: { fontSize: rf(16) },
      bottomHint: {
        position: 'absolute',
        bottom: rh(60),
        left: 0,
        right: 0,
        alignItems: 'center',
      },
      hintText: { color: '#FFF', fontSize: rf(15), fontWeight: '600', marginBottom: rh(4) },
      hintSub: { color: 'rgba(255,255,255,0.5)', fontSize: rf(12) },
    });
  }, [rw, rh, rf, rr, isTablet, isLandscape, FRAME_SIZE]);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [scanned, setScanned] = useState(false);
  // Synchronous guard against onCodeScanned firing more than once per scan.
  // `scanned` state alone isn't enough: the native scanner keeps calling this
  // callback for at least one more frame after setScanned(true), because
  // `isActive={!scanned}` on <Camera> only actually pauses the camera once
  // React re-renders — a ref is checked/set immediately, no render needed.
  const scanLockRef = useRef(false);
  const [torch, setTorch] = useState<'off' | 'on'>('off');
  const { checkScan, PaywallModal } = useSubscription();

  const devices = useCameraDevices();
  const device = devices.find((d) => d.position === 'back');

  // If useCameraDevices() never reports a back camera (no camera on the
  // device/simulator, or a transient library hiccup) the screen would
  // otherwise sit on "Loading camera..." forever with no way out. Give it
  // a few seconds, then fall back to an error state with a retry option.
  // `retryTick` lets "Try Again" rearm the timer for another attempt.
  const [cameraTimedOut, setCameraTimedOut] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (device) {
      setCameraTimedOut(false);
      return;
    }
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

  useEffect(() => {
    checkAndRequestPermission();
  }, [checkAndRequestPermission]);

  // Re-check permission when user returns from Settings
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndRequestPermission();
    });
    return () => sub.remove();
  }, [checkAndRequestPermission]);

  const codeScanner = useCodeScanner({
    codeTypes: ['ean-13', 'ean-8', 'upc-a', 'upc-e', 'code-128', 'code-39', 'qr'],
    onCodeScanned: (codes) => {
      if (scanLockRef.current || codes.length === 0) return;
      const code = codes[0].value;
      if (!code) return;

      // A QR code was never going to be a valid product barcode — the
      // string still reaches here (since 'qr' is a requested codeType, for
      // scanning e.g. printed URLs elsewhere), so filter it out before it
      // can be sent to the Product screen as if it were a barcode.
      if (codes[0].type === 'qr') return;

      // Set synchronously first — codes.length check above only protects
      // against multiple codes in one frame, not the next frame arriving
      // before setScanned(true) has actually propagated through React.
      scanLockRef.current = true;
      setScanned(true); // pauses the camera (isActive={!scanned}) once rendered

      checkScan()
        .then(({ allowed, remaining }) => {
          if (!allowed) {
            scanLockRef.current = false;
            setScanned(false); // paywall shown — resume camera
            return;
          }
          Vibration.vibrate(80);
          navigation.replace('Product', {
            barcode: code,
            fromScan: true,
            scansRemaining: remaining < Infinity ? remaining : undefined,
          });
        })
        .catch((err) => {
          // A storage/network hiccup here must not leave the camera frozen
          // with no way out — release the lock so the user can try again.
          console.error('checkScan failed:', err);
          scanLockRef.current = false;
          setScanned(false);
        });
    },
  });

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.statusText}>{t('scan.requestingPermission')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorIcon}>📷</Text>
          <Text style={styles.errorTitle}>{t('scan.cameraAccessRequired')}</Text>
          <Text style={styles.errorSub}>
            {permissionDenied
              ? t('scan.permissionDeniedMessage')
              : t('scan.permissionNeededMessage')}
          </Text>
          {permissionDenied ? (
            <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsBtnText}>{t('scan.openSettings')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.settingsBtn} onPress={checkAndRequestPermission}>
              <Text style={styles.settingsBtnText}>{t('scan.allowCamera')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
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
            <Text style={styles.errorSub}>
              {t('scan.cameraUnavailableMessage')}
            </Text>
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setRetryTick((n) => n + 1)}>
              <Text style={styles.settingsBtnText}>{t('common.tryAgain')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>{t('scan.goBack')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.statusText}>{t('scan.loadingCamera')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!scanned}
        codeScanner={codeScanner}
        torch={torch}
      />

      {/* Dark overlay with cutout */}
      <View style={styles.overlay}>
        {/* Top dark */}
        <View style={[styles.darkArea, { height: (height - FRAME_SIZE) / 2 - 40 }]} />

        {/* Middle row */}
        <View style={styles.middleRow}>
          <View style={[styles.darkArea, { width: (width - FRAME_SIZE) / 2 }]} />
          {/* Scan Frame */}
          <View style={styles.frame}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            {/* Scan line */}
            <View style={styles.scanLine} />
          </View>
          <View style={[styles.darkArea, { width: (width - FRAME_SIZE) / 2 }]} />
        </View>

        {/* Bottom dark */}
        <View style={[styles.darkArea, { flex: 1 }]} />
      </View>

      {/* Top bar */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.iconBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>{t('scan.title')}</Text>
        <TouchableOpacity
          style={[styles.iconBtn, torch === 'on' && styles.iconBtnActive]}
          onPress={() => setTorch((t) => (t === 'off' ? 'on' : 'off'))}
        >
          <Text style={styles.iconBtnText}>🔦</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Bottom hint */}
      <SafeAreaView style={styles.bottomHint} edges={['bottom']} pointerEvents="none">
        <Text style={styles.hintText}>{t('scan.hint')}</Text>
        <Text style={styles.hintSub}>{t('scan.hintSub')}</Text>
      </SafeAreaView>

      {PaywallModal}
    </View>
  );
}
