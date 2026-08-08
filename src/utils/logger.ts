import Config from '../config/environment';
// src/utils/logger.ts
// Production-grade structured logger
// Levels: DEBUG < INFO < WARN < ERROR < FATAL
// In dev: logs to console with colour. In prod: ships to remote endpoint.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSecureItem, removeSecureItem } from './secureStorage';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;       // 'api' | 'auth' | 'scan' | 'diary' | 'performance' | 'ui'
  message: string;
  data?: Record<string, unknown>;
  userId?: string;
  sessionId: string;
  appVersion: string;
  duration?: number;      // ms, for performance logs
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const APP_VERSION = '1.0.0';
const SESSION_ID = Math.random().toString(36).slice(2, 10);
const LOG_KEY = 'shuddhaahar_logs';
const MAX_STORED_LOGS = 500;
const REMOTE_LOG_ENDPOINT = Config.logEndpoint; // your log server

// Log level priority
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, fatal: 4,
};

// Only ship logs at this level or above to remote in production
const REMOTE_MIN_LEVEL: LogLevel = __DEV__ ? 'error' : 'warn';
const CONSOLE_MIN_LEVEL: LogLevel = __DEV__ ? 'debug' : 'warn';

// Console colours
const COLOURS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info:  '\x1b[32m', // green
  warn:  '\x1b[33m', // yellow
  error: '\x1b[31m', // red
  fatal: '\x1b[35m', // magenta
};
const RESET = '\x1b[0m';

let currentUserId: string | undefined;

class Logger {
  private queue: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  setUserId(id: string) {
    currentUserId = id;
    // Encrypted (Keychain), not AsyncStorage — this is the one place a raw
    // userId is worth persisting at all (e.g. future cold-start crash
    // correlation); the bulk log array below deliberately does NOT persist
    // it, encrypted or not — see storeLocally.
    setSecureItem('current_user_id', id);
  }
  clearUserId() {
    currentUserId = undefined;
    removeSecureItem('current_user_id');
  }

  private createEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
    duration?: number,
  ): LogEntry {
    return {
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      userId: currentUserId,
      sessionId: SESSION_ID,
      appVersion: APP_VERSION,
      duration,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
    };
  }

  private log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
    error?: Error,
    duration?: number,
  ) {
    const entry = this.createEntry(level, category, message, data, error, duration);

    // Console output
    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[CONSOLE_MIN_LEVEL]) {
      const colour = COLOURS[level];
      const prefix = `${colour}[${level.toUpperCase()}]${RESET} [${category}]`;
      const durationStr = duration ? ` (${duration}ms)` : '';
      console.log(`${prefix} ${message}${durationStr}`, data || '');
      if (error?.stack) console.log(error.stack);
    }

    // Queue for remote shipping
    if (LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[REMOTE_MIN_LEVEL]) {
      this.queue.push(entry);
      this.scheduleFlush();
    }

    // Store locally for crash report access
    this.storeLocally(entry);
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flush(); this.flushTimer = null; }, 5000);
  }

  private async storeLocally(entry: LogEntry) {
    try {
      // userId deliberately dropped before this hits plaintext AsyncStorage —
      // Keychain isn't a fit for a growing hundreds-of-entries array (it's
      // built for a handful of small secrets, not bulk data rewritten on
      // every log call), so the correct fix here is to just not persist the
      // identifying field locally at all. The in-memory `queue` used by
      // flush() to ship logs remotely over HTTPS still carries the real
      // userId — only the on-disk copy is stripped.
      const { userId, ...rest } = entry;
      const raw = await AsyncStorage.getItem(LOG_KEY);
      const logs: LogEntry[] = raw ? JSON.parse(raw) : [];
      logs.push(rest as LogEntry);
      // Keep only last N logs
      if (logs.length > MAX_STORED_LOGS) logs.splice(0, logs.length - MAX_STORED_LOGS);
      await AsyncStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch { /* storage full or unavailable */ }
  }

  async flush() {
    if (!this.queue.length) return;
    const batch = [...this.queue];
    this.queue = [];
    try {
      await fetch(REMOTE_LOG_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: batch, session: SESSION_ID }),
      });
    } catch {
      // Re-queue on failure (network down etc.)
      this.queue.unshift(...batch);
    }
  }

  async getStoredLogs(): Promise<LogEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async clearStoredLogs() {
    await AsyncStorage.removeItem(LOG_KEY);
  }

  // Public API
  debug(category: string, message: string, data?: Record<string, unknown>) {
    this.log('debug', category, message, data);
  }
  info(category: string, message: string, data?: Record<string, unknown>) {
    this.log('info', category, message, data);
  }
  warn(category: string, message: string, data?: Record<string, unknown>, error?: Error) {
    this.log('warn', category, message, data, error);
  }
  error(category: string, message: string, error?: Error, data?: Record<string, unknown>) {
    this.log('error', category, message, data, error);
  }
  fatal(category: string, message: string, error?: Error, data?: Record<string, unknown>) {
    this.log('fatal', category, message, data, error);
    this.flush(); // Flush immediately on fatal
  }
  perf(category: string, message: string, durationMs: number, data?: Record<string, unknown>) {
    this.log('info', category, message, data, undefined, durationMs);
  }

  // Measure async operation duration
  async measure<T>(category: string, label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.perf(category, label, Date.now() - start);
      return result;
    } catch (err) {
      this.error(category, `${label} FAILED`, err as Error, { duration: Date.now() - start });
      throw err;
    }
  }
}

export const logger = new Logger();
export default logger;
