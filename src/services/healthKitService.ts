// src/services/healthKitService.ts
// Reads real health data from Apple HealthKit (iOS) and Health Connect (Android)

import { Platform } from 'react-native';
import { AppError } from '../utils/AppError';

export interface HealthData {
  stepsToday: number;
  activeCaloriesToday: number;
  restingHeartRate?: number;
  sleepHours?: number;
  lastSynced: string;
}

// Lazy-load native packages — wrapped in try/catch so a missing
// or unlinked package never crashes the JS bundle
let AppleHealthKit: any = null;
let HealthConnect: any = null;

try {
  if (Platform.OS === 'ios') {
    AppleHealthKit = require('react-native-health').default;
  }
} catch { /* not linked */ }

try {
  if (Platform.OS === 'android') {
    HealthConnect = require('react-native-health-connect');
  }
} catch { /* not linked */ }

// ── Permission request ────────────────────────────────────────

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'ios' && AppleHealthKit) {
      return new Promise((resolve) => {
        AppleHealthKit.initHealthKit({
          permissions: {
            read: ['Steps', 'ActiveEnergyBurned', 'HeartRate', 'SleepAnalysis'],
            write: [],
          },
        }, (err: any) => {
          if (err) { console.warn('HealthKit init error:', err); resolve(false); }
          else resolve(true);
        });
      });
    }

    if (Platform.OS === 'android' && HealthConnect) {
      const { initialize, requestPermission, getSdkStatus, SdkAvailabilityStatus } = HealthConnect;
      // Check Health Connect is actually installed on this device before doing anything
      const status = await initialize();
      if (!status) return false;
      // On some devices getSdkStatus tells us if the app is installed
      if (SdkAvailabilityStatus && getSdkStatus) {
        const sdkStatus = await getSdkStatus();
        if (sdkStatus !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      }
      const granted = await requestPermission([
        { accessType: 'read', recordType: 'Steps' },
        { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        { accessType: 'read', recordType: 'HeartRate' },
        { accessType: 'read', recordType: 'SleepSession' },
      ]);
      return granted.length > 0;
    }
  } catch (err) {
    console.warn('Health permission error:', err);
  }
  return false;
}

// ── Main read ─────────────────────────────────────────────────

export async function readHealthData(): Promise<HealthData | null> {
  try {
    if (Platform.OS === 'ios' && AppleHealthKit) {
      return await readiOS();
    }
    if (Platform.OS === 'android' && HealthConnect) {
      return await readAndroid();
    }
  } catch (err) {
    console.warn('Health read error:', err);
  }
  return null;
}

// ── iOS ───────────────────────────────────────────────────────

async function readiOS(): Promise<HealthData> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startISO = startOfDay.toISOString();
  const nowISO   = new Date().toISOString();

  const steps = await new Promise<number>((resolve) => {
    AppleHealthKit.getStepCount({ date: startISO }, (_: any, res: any) => {
      resolve(res?.value || 0);
    });
  });

  const calories = await new Promise<number>((resolve) => {
    AppleHealthKit.getActiveEnergyBurned(
      { startDate: startISO, endDate: nowISO },
      (_: any, res: any) => {
        const total = Array.isArray(res)
          ? res.reduce((sum: number, r: any) => sum + (r.value || 0), 0)
          : 0;
        resolve(Math.round(total));
      }
    );
  });

  // Last resting heart rate sample
  const heartRate = await new Promise<number | undefined>((resolve) => {
    AppleHealthKit.getHeartRateSamples(
      { startDate: startISO, endDate: nowISO, ascending: false, limit: 10 },
      (_: any, res: any) => {
        if (!Array.isArray(res) || res.length === 0) { resolve(undefined); return; }
        // Average of today's samples
        const avg = Math.round(res.reduce((s: number, r: any) => s + r.value, 0) / res.length);
        resolve(avg);
      }
    );
  });

  // Last night's sleep
  const sleepHours = await new Promise<number | undefined>((resolve) => {
    const yesterday = new Date(startOfDay);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0); // from 6 PM yesterday
    AppleHealthKit.getSleepSamples(
      { startDate: yesterday.toISOString(), endDate: nowISO, limit: 50 },
      (_: any, res: any) => {
        if (!Array.isArray(res) || res.length === 0) { resolve(undefined); return; }
        // Sum only "asleep" samples
        const asleepMs = res
          .filter((r: any) => r.value === 'ASLEEP' || r.value === 'CORE' || r.value === 'DEEP' || r.value === 'REM')
          .reduce((sum: number, r: any) => {
            return sum + (new Date(r.endDate).getTime() - new Date(r.startDate).getTime());
          }, 0);
        const hours = +(asleepMs / 3600000).toFixed(1);
        resolve(hours > 0 ? hours : undefined);
      }
    );
  });

  return { stepsToday: steps, activeCaloriesToday: calories, restingHeartRate: heartRate, sleepHours, lastSynced: nowISO };
}

// ── Android ───────────────────────────────────────────────────

async function readAndroid(): Promise<HealthData> {
  const { initialize, readRecords } = HealthConnect;
  const ready = await initialize();
  if (!ready) throw new AppError('healthConnectUnavailable', 'Health Connect not available');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startISO = startOfDay.toISOString();
  const nowISO   = new Date().toISOString();
  const timeRange = { operator: 'between' as const, startTime: startISO, endTime: nowISO };

  const [stepsRes, calsRes, hrRes, sleepRes] = await Promise.all([
    readRecords('Steps',                { timeRangeFilter: timeRange }).catch(() => ({ records: [] })),
    readRecords('ActiveCaloriesBurned', { timeRangeFilter: timeRange }).catch(() => ({ records: [] })),
    readRecords('HeartRate',            { timeRangeFilter: timeRange }).catch(() => ({ records: [] })),
    readRecords('SleepSession', {
      timeRangeFilter: {
        operator: 'between' as const,
        startTime: (() => { const y = new Date(startOfDay); y.setDate(y.getDate() - 1); y.setHours(18,0,0,0); return y.toISOString(); })(),
        endTime: nowISO,
      },
    }).catch(() => ({ records: [] })),
  ]);

  const steps    = stepsRes.records.reduce((s: number, r: any) => s + (r.count || 0), 0);
  const calories = Math.round(calsRes.records.reduce((s: number, r: any) => s + (r.energy?.inKilocalories || 0), 0));

  // Average heart rate from today's samples
  const allHrSamples: number[] = hrRes.records.flatMap((r: any) =>
    (r.samples || []).map((s: any) => s.beatsPerMinute)
  );
  const heartRate = allHrSamples.length > 0
    ? Math.round(allHrSamples.reduce((a, b) => a + b, 0) / allHrSamples.length)
    : undefined;

  // Total asleep duration from sleep sessions
  const sleepMs = sleepRes.records.reduce((sum: number, r: any) => {
    return sum + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime());
  }, 0);
  const sleepHours = sleepMs > 0 ? +(sleepMs / 3600000).toFixed(1) : undefined;

  return { stepsToday: steps, activeCaloriesToday: calories, restingHeartRate: heartRate, sleepHours, lastSynced: nowISO };
}

// ── Helpers ───────────────────────────────────────────────────

export function getActivityLabel(steps: number): string {
  if (steps === 0)    return 'No steps recorded yet';
  if (steps < 3000)   return 'Low activity today';
  if (steps < 7000)   return 'Lightly active today';
  if (steps < 10000)  return 'Moderately active today';
  return 'Very active today';
}

export function calculateAdjustedCalories(baseTarget: number, health: HealthData | null): number {
  if (!health) return baseTarget;
  return baseTarget + Math.round(health.activeCaloriesToday * 0.5);
}
