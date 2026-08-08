// src/components/FeatureGate.tsx
// Wraps a feature's UI with a remote kill switch (see AppConfigContext).
// Usage: <FeatureGate feature="photoScan">{children}</FeatureGate>
import React from 'react';
import { View, Text } from 'react-native';
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
  | 'wishlist';

// Maps the short feature name used by callers to the actual AppConfig flag.
const FEATURE_FLAG_KEYS: Record<FeatureName, keyof AppConfig> = {
  priceComparison: 'priceComparisonEnabled',
  aiAnalysis: 'aiAnalysisEnabled',
  photoScan: 'photoScanEnabled',
  documentUpload: 'documentUploadEnabled',
  foodDiary: 'foodDiaryEnabled',
  wishlist: 'wishlistEnabled',
};

interface FeatureGateProps {
  feature: FeatureName;
  children: React.ReactNode;
}

export function FeatureGate({ feature, children }: FeatureGateProps) {
  const { config } = useAppConfig();
  const { rw, rf, rh } = useResponsive();

  const enabled = config[FEATURE_FLAG_KEYS[feature]] as boolean;
  if (enabled) return <>{children}</>;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: rw(32) }}>
      <Text style={{ fontSize: rf(48), marginBottom: rh(16) }}>🚧</Text>
      <Text style={{ fontSize: rf(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: rh(8), textAlign: 'center' }}>
        Temporarily Unavailable
      </Text>
      <Text style={{ fontSize: rf(13), color: Colors.textMuted, textAlign: 'center', lineHeight: rf(20) }}>
        This feature has been temporarily disabled. Please check back later.
      </Text>
    </View>
  );
}

export default FeatureGate;
