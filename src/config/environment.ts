// src/config/environment.ts
// Environment configuration system
// Supports: development, staging, production
// Environment is set at build time via SHUDDHAAHAR_ENV variable
// Never commit real API keys — use .env files (git-ignored)

import DeviceInfo from 'react-native-device-info';

// Single source of truth for the running app's version — DeviceInfo reads
// this synchronously from the native bundle (Info.plist / build.gradle), so
// it can never drift from what's actually installed the way a hardcoded
// string literal could.
const NATIVE_APP_VERSION = DeviceInfo.getVersion();

export type Environment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  env: Environment;
  appName: string;
  bundleId: string;          // iOS
  applicationId: string;     // Android
  appVersion: string;
  buildNumber: string;

  // API endpoints
  apiBaseUrl: string;
  cmsApiUrl: string;
  tcApiUrl: string;
  logEndpoint: string;
  errorEndpoint: string;

  // AWS backend
  awsRegion: string;
  appsyncEndpoint: string;
  googleWebClientId: string;   // used as GoogleSignin's webClientId + the Lambda authorizer's expected audience
  googleIosClientId: string;   // required by GoogleSignin on iOS to build the native sign-in flow
  dynamoTableName: string;

  // Anthropic / Claude
  anthropicApiKey: string;

  // Trolley price API
  trolleyApiKey: string;

  // In-app-purchase membership — receipt verification backend
  // (product IDs themselves live in subscriptionService.ts's PLANS, since
  // they're plan data, not per-environment config)
  iapVerifyUrl: string;

  // Remote app-config — admin-controlled min version / kill switches / daily
  // scan limit (see src/services/appConfigService.ts). Public, unauthenticated
  // GET, not secret.
  appConfigUrl: string;

  // Feature flags
  features: FeatureFlags;

  // Debug settings
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enablePerformanceMonitoring: boolean;
  enableCrashReporting: boolean;
  mockAPIs: boolean;          // use mock data instead of real APIs
}

export interface FeatureFlags {
  photoScan: boolean;
  healthKitSync: boolean;
  priceComparison: boolean;
  aiAnalysis: boolean;
  documentUpload: boolean;
  subscriptions: boolean;
  adminPanel: boolean;        // only true in dev/staging
}

// ─── Development ──────────────────────────────────────────────
const DEV_CONFIG: EnvironmentConfig = {
  env: 'development',
  appName: 'Shuddh Aahar DEV',
  bundleId: 'com.shuddhaahar.dev',
  applicationId: 'com.shuddhaahar.dev',
  appVersion: NATIVE_APP_VERSION,
  buildNumber: '1',

  apiBaseUrl:    'https://api-dev.shuddhaahar.shop/v1',
  cmsApiUrl:     'https://api-dev.shuddhaahar.shop/v1/cms/pages',
  tcApiUrl:      'https://api-dev.shuddhaahar.shop/v1/tc/current',
  logEndpoint:   'https://logs-dev.shuddhaahar.shop/v1/ingest',
  errorEndpoint: 'https://errors-dev.shuddhaahar.shop/v1/report',

  awsRegion:          'eu-west-2',
  appsyncEndpoint:    process.env.DEV_APPSYNC_ENDPOINT      || '',
  googleWebClientId:  process.env.DEV_GOOGLE_WEB_CLIENT_ID  || '',
  googleIosClientId:  process.env.DEV_GOOGLE_IOS_CLIENT_ID  || '',
  dynamoTableName:    'shuddhaahar-dev-users',

  anthropicApiKey:    process.env.DEV_ANTHROPIC_API_KEY     || '',
  trolleyApiKey:      process.env.DEV_TROLLEY_API_KEY       || '',

  iapVerifyUrl:       process.env.DEV_IAP_VERIFY_URL        || '',

  appConfigUrl:       process.env.DEV_APP_CONFIG_URL        || '',

  features: {
    photoScan:        true,
    healthKitSync:    true,
    priceComparison:  true,
    aiAnalysis:       true,
    documentUpload:   true,
    subscriptions:    true,
    adminPanel:       true,  // dev only
  },

  enableLogging:              true,
  logLevel:                   'debug',
  enablePerformanceMonitoring: true,
  enableCrashReporting:       false,  // don't pollute error dashboard with dev crashes
  mockAPIs:                   false,  // set true to use mock data
};

// ─── Staging ──────────────────────────────────────────────────
const STAGING_CONFIG: EnvironmentConfig = {
  ...DEV_CONFIG,
  env: 'staging',
  appName: 'Shuddh Aahar Staging',
  bundleId: 'com.shuddhaahar.staging',
  applicationId: 'com.shuddhaahar.staging',

  apiBaseUrl:    'https://api-staging.shuddhaahar.shop/v1',
  cmsApiUrl:     'https://api-staging.shuddhaahar.shop/v1/cms/pages',
  tcApiUrl:      'https://api-staging.shuddhaahar.shop/v1/tc/current',
  logEndpoint:   'https://logs-staging.shuddhaahar.shop/v1/ingest',
  errorEndpoint: 'https://errors-staging.shuddhaahar.shop/v1/report',

  appsyncEndpoint:   process.env.STAGING_APPSYNC_ENDPOINT     || '',
  googleWebClientId: process.env.STAGING_GOOGLE_WEB_CLIENT_ID || '',
  googleIosClientId: process.env.STAGING_GOOGLE_IOS_CLIENT_ID || '',
  dynamoTableName:   'shuddhaahar-staging-users',

  anthropicApiKey:   process.env.STAGING_ANTHROPIC_API_KEY    || '',
  trolleyApiKey:     process.env.STAGING_TROLLEY_API_KEY      || '',

  iapVerifyUrl:      process.env.STAGING_IAP_VERIFY_URL       || '',

  appConfigUrl:      process.env.STAGING_APP_CONFIG_URL       || '',

  features: {
    ...DEV_CONFIG.features,
    adminPanel: true,   // staging: keep admin visible for QA
  },

  logLevel:             'info',
  enableCrashReporting: true,   // catch staging bugs
  mockAPIs:             false,
};

// ─── Production ───────────────────────────────────────────────
const PROD_CONFIG: EnvironmentConfig = {
  ...STAGING_CONFIG,
  env: 'production',
  appName: 'Shuddh Aahar',
  bundleId: 'com.shuddhaahar',
  applicationId: 'com.shuddhaahar',

  apiBaseUrl:    'https://api.shuddhaahar.shop/v1',
  cmsApiUrl:     'https://api.shuddhaahar.shop/v1/cms/pages',
  tcApiUrl:      'https://api.shuddhaahar.shop/v1/tc/current',
  logEndpoint:   'https://logs.shuddhaahar.shop/v1/ingest',
  errorEndpoint: 'https://errors.shuddhaahar.shop/v1/report',

  appsyncEndpoint:   process.env.PROD_APPSYNC_ENDPOINT     || '',
  googleWebClientId: process.env.PROD_GOOGLE_WEB_CLIENT_ID || '',
  googleIosClientId: process.env.PROD_GOOGLE_IOS_CLIENT_ID || '',
  dynamoTableName:   'shuddhaahar-prod-users',

  anthropicApiKey:   process.env.PROD_ANTHROPIC_API_KEY    || '',
  trolleyApiKey:     process.env.PROD_TROLLEY_API_KEY      || '',

  // Real, deployed endpoint (terraform output iap_verify_url) — not secret,
  // so it's safe to bake in as the default rather than requiring CI injection.
  iapVerifyUrl:      process.env.PROD_IAP_VERIFY_URL || 'https://7u4wesz7mb.execute-api.eu-west-2.amazonaws.com/',

  // Real, deployed endpoint — public GET, not secret, so it's safe to bake
  // in as the default rather than requiring CI injection.
  appConfigUrl:      process.env.PROD_APP_CONFIG_URL || 'https://fszsrlwn0l.execute-api.eu-west-2.amazonaws.com/',

  features: {
    photoScan:        true,
    healthKitSync:    true,
    priceComparison:  true,
    aiAnalysis:       true,
    documentUpload:   true,
    subscriptions:    true,
    adminPanel:       false,  // NEVER in production app
  },

  enableLogging:               true,
  logLevel:                    'warn',  // only warnings and errors in prod
  enablePerformanceMonitoring: true,
  enableCrashReporting:        true,
  mockAPIs:                    false,
};

// ─── Active config resolver ────────────────────────────────────
// SHUDDHAAHAR_ENV is set by build scripts
// Defaults to 'development' if not set

function resolveEnv(): Environment {
  const env = process.env.SHUDDHAAHAR_ENV as Environment;
  if (env === 'production' || env === 'staging' || env === 'development') return env;
  return 'development';
}

const CONFIGS: Record<Environment, EnvironmentConfig> = {
  development: DEV_CONFIG,
  staging:     STAGING_CONFIG,
  production:  PROD_CONFIG,
};

export const Config: EnvironmentConfig = CONFIGS[resolveEnv()];
export const ENV = Config.env;
export const isDev     = ENV === 'development';
export const isStaging = ENV === 'staging';
export const isProd    = ENV === 'production';

export default Config;
