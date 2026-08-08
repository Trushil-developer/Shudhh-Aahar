// src/utils/performance.ts
// Production-grade performance monitoring
// Tracks: screen render time, API latency, cache efficiency, memory, FPS

import logger from './logger';
import errorReporter from './errorReporter';

interface Metric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'fps' | 'count' | 'percent';
  timestamp: string;
  tags?: Record<string, string>;
}

interface APIMetric {
  endpoint: string;
  method: string;
  duration: number;
  status: 'success' | 'error' | 'timeout' | 'cached';
  statusCode?: number;
  cacheHit: boolean;
  retryCount: number;
  timestamp: string;
}

interface ScreenMetric {
  screen: string;
  renderTime: number;   // time from mount to interactive
  dataLoadTime: number; // time to fetch all data
  timestamp: string;
}

// Performance thresholds (ms) — alerts when exceeded
const THRESHOLDS = {
  apiCall: 3000,        // 3s max for any API call
  screenRender: 500,    // 500ms max to interactive
  cacheRead: 50,        // 50ms max for cache read
  aiAnalysis: 8000,     // 8s max for Claude AI
  barcodeDetection: 200,// 200ms max to detect barcode
};

class PerformanceMonitor {
  private metrics: Metric[] = [];
  private apiMetrics: APIMetric[] = [];
  private screenMetrics: ScreenMetric[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private activeTimers: Map<string, number> = new Map();

  // Start a named timer
  startTimer(name: string): void {
    this.activeTimers.set(name, Date.now());
  }

  // End timer and record
  endTimer(name: string, tags?: Record<string, string>): number {
    const start = this.activeTimers.get(name);
    if (!start) return 0;
    const duration = Date.now() - start;
    this.activeTimers.delete(name);
    this.recordMetric(name, duration, 'ms', tags);
    return duration;
  }

  recordMetric(name: string, value: number, unit: Metric['unit'], tags?: Record<string, string>) {
    const metric: Metric = { name, value, unit, timestamp: new Date().toISOString(), tags };
    this.metrics.push(metric);

    // Alert on threshold breach
    const threshold = THRESHOLDS[name as keyof typeof THRESHOLDS];
    if (threshold && value > threshold) {
      logger.warn('performance', `⚡ Threshold exceeded: ${name}`, {
        value, threshold, exceeded_by: value - threshold,
      });
      errorReporter.addBreadcrumb('state', `Performance threshold: ${name} took ${value}ms`, { threshold, value });
    } else {
      logger.perf('performance', name, value, tags);
    }
  }

  recordAPICall(metric: Omit<APIMetric, 'timestamp'>) {
    const full: APIMetric = { ...metric, timestamp: new Date().toISOString() };
    this.apiMetrics.push(full);

    if (metric.cacheHit) this.cacheHits++;
    else this.cacheMisses++;

    const logLevel = metric.status === 'error' ? 'warn' :
                     metric.duration > THRESHOLDS.apiCall ? 'warn' : 'debug';

    logger[logLevel]('api', `${metric.method} ${metric.endpoint}`, {
      duration: metric.duration,
      status: metric.status,
      cached: metric.cacheHit,
      retries: metric.retryCount,
    });
  }

  recordScreenLoad(screen: string, renderTime: number, dataLoadTime: number) {
    this.screenMetrics.push({ screen, renderTime, dataLoadTime, timestamp: new Date().toISOString() });
    logger.perf('ui', `Screen loaded: ${screen}`, renderTime, { dataLoadTime });
    if (renderTime > THRESHOLDS.screenRender) {
      logger.warn('ui', `Slow screen render: ${screen}`, { renderTime, threshold: THRESHOLDS.screenRender });
    }
  }

  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses;
    return total === 0 ? 0 : Math.round((this.cacheHits / total) * 100);
  }

  getAverageAPILatency(): number {
    if (!this.apiMetrics.length) return 0;
    const non_cached = this.apiMetrics.filter(m => !m.cacheHit);
    if (!non_cached.length) return 0;
    return Math.round(non_cached.reduce((s, m) => s + m.duration, 0) / non_cached.length);
  }

  getSummary() {
    return {
      totalAPICalls: this.apiMetrics.length,
      cacheHitRate: `${this.getCacheHitRate()}%`,
      averageAPILatency: `${this.getAverageAPILatency()}ms`,
      screenLoads: this.screenMetrics.length,
      errorCount: this.apiMetrics.filter(m => m.status === 'error').length,
      slowCalls: this.apiMetrics.filter(m => m.duration > THRESHOLDS.apiCall).length,
    };
  }

  // Wrap an async function with automatic performance tracking
  async track<T>(name: string, fn: () => Promise<T>, tags?: Record<string, string>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.recordMetric(name, Date.now() - start, 'ms', { ...tags, status: 'success' });
      return result;
    } catch (err) {
      this.recordMetric(name, Date.now() - start, 'ms', { ...tags, status: 'error' });
      throw err;
    }
  }
}

export const perf = new PerformanceMonitor();
export default perf;
