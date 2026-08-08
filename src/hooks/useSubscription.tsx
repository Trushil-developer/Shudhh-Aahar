// src/hooks/useSubscription.tsx
// Hook wrapping membership + the daily free-scan throttle.
// Scanning is the only thing that's metered (3 free/day) — Personal Score,
// lowest-price reveal and wishlist all just check `hasFreeAccess`, which is
// true whenever isMember or today's scan quota isn't exhausted yet.
// Usage: const { hasFreeAccess, checkScan, openPaywall, PaywallModal } = useSubscription()

import React, { useState, useCallback } from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import logger from '../utils/logger';

interface UseSubscriptionReturn {
  isMember: boolean;
  dailyScansRemaining: number;
  // True when Personal Score / lowest-price reveal / wishlist should be
  // unlocked right now — members always, free accounts as long as they
  // haven't used up today's 3 free scans.
  hasFreeAccess: boolean;
  // Consumes one of today's 3 free scans. Returns the remaining count AFTER
  // this use, and shows the paywall automatically once exhausted.
  checkScan: () => Promise<{ allowed: boolean; remaining: number }>;
  // Manually opens the paywall — for a locked feature tap when hasFreeAccess
  // is already false (no scan to consume, just show the upsell).
  openPaywall: (featureLabel?: string) => void;
  PaywallModal: React.ReactElement;
}

export function useSubscription(): UseSubscriptionReturn {
  const { t } = useTranslation();
  const { isMember, dailyScansRemaining, consumeScan } = useAuth();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState<string | undefined>();

  const openPaywall = useCallback((featureLabel?: string) => {
    logger.info('subscription', `Paywall triggered: ${featureLabel || 'unknown'}`);
    setPaywallFeature(featureLabel);
    setShowPaywall(true);
  }, []);

  const checkScan = useCallback(async (): Promise<{ allowed: boolean; remaining: number }> => {
    if (isMember) return { allowed: true, remaining: Infinity };

    const remaining = await consumeScan();
    if (remaining <= 0) {
      openPaywall(t('features.scanning'));
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining };
  }, [isMember, consumeScan, openPaywall, t]);

  const PaywallModal = (
    <Modal
      visible={showPaywall}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      {/* A bare Modal presents in its own native window on iOS — the app-root
          SafeAreaProvider can't measure insets for it, so SubscriptionScreen's
          SafeAreaView would silently get zero insets without this. */}
      <SafeAreaProvider>
        <SubscriptionScreen
          onClose={() => setShowPaywall(false)}
          highlightFeature={paywallFeature}
        />
      </SafeAreaProvider>
    </Modal>
  );

  return {
    isMember,
    dailyScansRemaining,
    hasFreeAccess: isMember || dailyScansRemaining > 0,
    checkScan,
    openPaywall,
    PaywallModal,
  };
}
