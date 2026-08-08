import Config from '../config/environment';
// src/utils/errorReporter.ts
// Production-grade error reporting
// Captures: JS crashes, API failures, silent errors, user actions breadcrumbs
// Ships to your error dashboard (replace endpoint with Sentry DSN or custom server)

import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';
import logger from './logger';

export interface ErrorReport {
  id: string;
  timestamp: string;
  type: 'crash' | 'api' | 'validation' | 'auth' | 'silent' | 'network';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  stack?: string;
  context: ErrorContext;
  breadcrumbs: Breadcrumb[];
  tags: Record<string, string>;
}

export interface ErrorContext {
  userId?: string;
  screen?: string;
  action?: string;
  barcode?: string;
  apiEndpoint?: string;
  httpStatus?: number;
  responseTime?: number;
  retryCount?: number;
  appVersion: string;
  platform: string;
}

export interface Breadcrumb {
  timestamp: string;
  type: 'navigation' | 'user' | 'api' | 'state' | 'error';
  message: string;
  data?: Record<string, unknown>;
}

const REPORT_KEY = 'shuddhaahar_error_reports';
const BREADCRUMB_KEY = 'shuddhaahar_breadcrumbs';
const MAX_BREADCRUMBS = 50;
const MAX_REPORTS = 100;
const ERROR_ENDPOINT = Config.errorEndpoint;

class ErrorReporter {
  private breadcrumbs: Breadcrumb[] = [];
  private currentScreen = 'unknown';
  private currentUserId: string | undefined;

  setScreen(screen: string) {
    this.currentScreen = screen;
    this.addBreadcrumb('navigation', `Navigated to ${screen}`);
  }

  setUser(userId: string) {
    this.currentUserId = userId;
    logger.setUserId(userId);
  }

  addBreadcrumb(type: Breadcrumb['type'], message: string, data?: Record<string, unknown>) {
    const crumb: Breadcrumb = { timestamp: new Date().toISOString(), type, message, data };
    this.breadcrumbs.push(crumb);
    if (this.breadcrumbs.length > MAX_BREADCRUMBS) {
      this.breadcrumbs.shift();
    }
  }

  async captureError(
    error: Error | string,
    options: {
      type?: ErrorReport['type'];
      severity?: ErrorReport['severity'];
      context?: Partial<ErrorContext>;
      tags?: Record<string, string>;
    } = {},
  ): Promise<void> {
    const err = typeof error === 'string' ? new Error(error) : error;

    const report: ErrorReport = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      type: options.type || 'silent',
      severity: options.severity || 'medium',
      message: err.message,
      stack: err.stack,
      context: {
        userId: this.currentUserId,
        screen: this.currentScreen,
        appVersion: DeviceInfo.getVersion(),
        platform: 'react-native',
        ...options.context,
      },
      breadcrumbs: [...this.breadcrumbs],
      tags: { env: __DEV__ ? 'development' : 'production', ...options.tags },
    };

    logger.error('error_reporter', `[${report.severity.toUpperCase()}] ${report.message}`, err, {
      reportId: report.id,
      type: report.type,
      screen: report.context.screen,
    });

    // Store locally
    await this.storeReport(report);

    // Ship immediately for critical/high severity
    if (report.severity === 'critical' || report.severity === 'high') {
      await this.shipReport(report);
    }
  }

  async captureAPIError(
    endpoint: string,
    error: Error,
    options: { status?: number; responseTime?: number; retryCount?: number } = {},
  ) {
    this.addBreadcrumb('api', `API Error: ${endpoint}`, {
      status: options.status,
      responseTime: options.responseTime,
    });
    await this.captureError(error, {
      type: 'api',
      severity: options.status === 401 || options.status === 403 ? 'high' : 'medium',
      context: {
        apiEndpoint: endpoint,
        httpStatus: options.status,
        responseTime: options.responseTime,
        retryCount: options.retryCount,
      },
      tags: { endpoint, status: String(options.status || 'unknown') },
    });
  }

  async captureNetworkError(endpoint: string, error: Error) {
    await this.captureError(error, {
      type: 'network',
      severity: 'low',
      context: { apiEndpoint: endpoint },
      tags: { endpoint },
    });
  }

  private async storeReport(report: ErrorReport) {
    try {
      // context.userId dropped before this hits plaintext AsyncStorage — same
      // reasoning as logger.ts's storeLocally: Keychain isn't a fit for a
      // growing hundreds-of-entries array, so the identifying field is
      // simply not persisted locally at all. shipReport() below (used for
      // critical/high severity) still sends the real userId over HTTPS —
      // only the on-disk copy is stripped.
      const { userId, ...restContext } = report.context;
      const reportToStore: ErrorReport = { ...report, context: restContext };
      const raw = await AsyncStorage.getItem(REPORT_KEY);
      const reports: ErrorReport[] = raw ? JSON.parse(raw) : [];
      reports.push(reportToStore);
      if (reports.length > MAX_REPORTS) reports.splice(0, reports.length - MAX_REPORTS);
      await AsyncStorage.setItem(REPORT_KEY, JSON.stringify(reports));
    } catch { /* storage failure — skip */ }
  }

  private async shipReport(report: ErrorReport) {
    try {
      await fetch(ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
    } catch { /* network unavailable */ }
  }

  async getStoredReports(): Promise<ErrorReport[]> {
    try {
      const raw = await AsyncStorage.getItem(REPORT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async shipPendingReports() {
    const reports = await this.getStoredReports();
    const unshipped = reports.filter(r => !r.tags.shipped);
    if (!unshipped.length) return;

    try {
      await fetch(ERROR_ENDPOINT + '/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: unshipped }),
      });
      // Mark as shipped
      const updated = reports.map(r => ({ ...r, tags: { ...r.tags, shipped: 'true' } }));
      await AsyncStorage.setItem(REPORT_KEY, JSON.stringify(updated));
    } catch { /* retry next time */ }
  }
}

export const errorReporter = new ErrorReporter();
export default errorReporter;

// Global JS error handler — catches uncaught exceptions
export function setupGlobalErrorHandler() {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler(async (error: Error, isFatal?: boolean) => {
    await errorReporter.captureError(error, {
      type: 'crash',
      severity: isFatal ? 'critical' : 'high',
      tags: { fatal: String(isFatal) },
    });
    originalHandler(error, isFatal);
  });
}

// Promise rejection handler
export function setupPromiseRejectionHandler() {
  // React Native catches unhandled promise rejections
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('Unhandled promise rejection')) {
      errorReporter.captureError(new Error(args.join(' ')), {
        type: 'crash', severity: 'high', tags: { type: 'unhandled_promise' },
      });
    }
    originalConsoleError(...args);
  };
}
