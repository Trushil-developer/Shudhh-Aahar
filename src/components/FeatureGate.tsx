// src/components/FeatureGate.tsx
// Wraps a feature's UI with a remote kill switch (see AppConfigContext).
// Usage: <FeatureGate feature="photoScan">{children}</FeatureGate>
import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppConfig } from '../context/AppConfigContext';
import { AppConfig } from '../services/appConfigService';
import { Colors } from '../theme/medical';
import { useResponsive } from '../utils/responsive';

export type FeatureName =
  | 'priceComparison'
  | 'aiAnalysis'
  | 'photoScan'
  | 'documentUpload'
  | 'foodDiary'
  | 'wishlist'
  | 'alternatives';

// Maps the short feature name used by callers to the actual AppConfig flag.
const FEATURE_FLAG_KEYS: Record<FeatureName, keyof AppConfig> = {
  priceComparison: 'priceComparisonEnabled',
  aiAnalysis: 'aiAnalysisEnabled',
  photoScan: 'photoScanEnabled',
  documentUpload: 'documentUploadEnabled',
  foodDiary: 'foodDiaryEnabled',
  wishlist: 'wishlistEnabled',
  alternatives: 'alternativesEnabled',
};

interface FeatureGateProps {
  feature: FeatureName;
  children: React.ReactNode;
  // Set when this gate wraps an entire screen's own top-level return (as
  // opposed to a section/card nested inside a screen that's already inside
  // a SafeAreaView further up, e.g. ProductScreen's inline gates). Without
  // this, the disabled-state fallback below rendered as a bare View with no
  // safe-area insets — fine nested inside a card, but wrong when it's
  // standing in for a whole screen, where it needs to avoid the
  // notch/status bar/home indicator itself.
  fullScreen?: boolean;
}

export function FeatureGate({ feature, children, fullScreen }: FeatureGateProps) {
  const { config } = useAppConfig();
  const { rw, rf, rh } = useResponsive();

  const enabled = config[FEATURE_FLAG_KEYS[feature]] as boolean;
  if (enabled) return <>{children}</>;

  const Container = fullScreen ? SafeAreaView : View;

  return (
    <Container style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) }}>
      <Text style={{ fontSize: rf(48), marginBottom: rh(16) }}>🚧</Text>
      <Text style={{ fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8), textAlign: 'center' }}>
        Temporarily Unavailable
      </Text>
      <Text style={{ fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(20) }}>
        This feature has been temporarily disabled. Please check back later.
      </Text>
    </Container>
  );
}

export default FeatureGate;
