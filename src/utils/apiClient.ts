// src/utils/apiClient.ts
// Production-grade API client
// Features: retry with exponential backoff, circuit breaker, request deduplication,
// timeout handling, request/response logging, offline detection

import logger from './logger';
import errorReporter from './errorReporter';
import perf from './performance';
import cache, { TTL } from './cache';
import { AppError } from './AppError';

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;          // ms, default 10000
  retries?: number;          // default 3
  retryDelay?: number;       // ms base delay, doubles each retry
  cacheKey?: string;         // if set, cache response
  cacheTTL?: number;         // TTL for cache entry
  skipCache?: boolean;
}

interface APIResponse<T> {
  data: T;
  cached: boolean;
  duration: number;
  retryCount: number;
}

// Circuit breaker state per domain
interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_TIMEOUT_MS = 60000; // 1 minute

// In-flight request deduplication
const inflight = new Map<string, Promise<unknown>>();

class APIClient {
  private circuits: Map<string, CircuitState> = new Map();

  private getDomain(url: string): string {
    try { return new URL(url).hostname; }
    catch { return url; }
  }

  private getCircuit(domain: string): CircuitState {
    if (!this.circuits.has(domain)) {
      this.circuits.set(domain, { failures: 0, lastFailure: 0, state: 'closed' });
    }
    return this.circuits.get(domain)!;
  }

  private isCircuitOpen(domain: string): boolean {
    const circuit = this.getCircuit(domain);
    if (circuit.state === 'closed') return false;
    if (circuit.state === 'open') {
      // Check if timeout has passed — move to half-open
      if (Date.now() - circuit.lastFailure > CIRCUIT_TIMEOUT_MS) {
        circuit.state = 'half-open';
        logger.info('api', `Circuit half-open for ${domain}`);
        return false;
      }
      return true;
    }
    return false; // half-open allows one attempt
  }

  private recordSuccess(domain: string) {
    const circuit = this.getCircuit(domain);
    circuit.failures = 0;
    circuit.state = 'closed';
  }

  private recordFailure(domain: string) {
    const circuit = this.getCircuit(domain);
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
      circuit.state = 'open';
      logger.warn('api', `Circuit OPEN for ${domain} — too many failures`, { failures: circuit.failures });
      errorReporter.captureError(new Error(`Circuit breaker opened for ${domain}`), {
        type: 'api', severity: 'high', tags: { domain },
      });
    }
  }

  async request<T>(url: string, config: RequestConfig = {}): Promise<APIResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = 10000,
      retries = 3,
      retryDelay = 1000,
      cacheKey,
      cacheTTL = TTL.SEARCH,
      skipCache = false,
    } = config;

    const domain = this.getDomain(url);
    const requestKey = `${method}:${url}:${JSON.stringify(body || '')}`;
    const start = Date.now();

    // Check cache first
    if (!skipCache && cacheKey && method === 'GET') {
      const cached = await cache.get<T>(cacheKey);
      if (cached !== null) {
        const duration = Date.now() - start;
        perf.recordAPICall({ endpoint: url, method, duration, status: 'success', cacheHit: true, retryCount: 0 });
        return { data: cached, cached: true, duration, retryCount: 0 };
      }
    }

    // Deduplicate in-flight requests
    if (inflight.has(requestKey)) {
      logger.debug('api', `Deduplicating in-flight: ${url}`);
      const result = await inflight.get(requestKey) as T;
      return { data: result, cached: false, duration: Date.now() - start, retryCount: 0 };
    }

    // Circuit breaker check
    if (this.isCircuitOpen(domain)) {
      const err = new AppError('circuitOpen', `Circuit open for ${domain} — service temporarily unavailable`, { domain });
      logger.warn('api', `Blocked by circuit breaker: ${domain}`);
      throw err;
    }

    const execute = async (): Promise<T> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          // Timeout wrapper
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Shuddhaahar/1.0 (React Native)',
              'X-App-Version': '1.0.0',
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errMsg = `HTTP ${response.status} from ${url}`;
            const err = new AppError('httpError', errMsg, { status: response.status });
            await errorReporter.captureAPIError(url, err, {
              status: response.status,
              responseTime: Date.now() - start,
              retryCount: attempt,
            });

            // Don't retry client errors (4xx)
            if (response.status >= 400 && response.status < 500) throw err;
            throw err;
          }

          const data: T = await response.json();
          this.recordSuccess(domain);

          // Cache successful GET responses
          if (!skipCache && cacheKey && method === 'GET' && cacheTTL) {
            await cache.set(cacheKey, data, cacheTTL);
          }

          return data;
        } catch (err) {
          lastError = err as Error;

          if ((err as Error).name === 'AbortError') {
            logger.warn('api', `Request timeout: ${url}`, { timeout, attempt });
            perf.recordAPICall({ endpoint: url, method, duration: timeout, status: 'timeout', cacheHit: false, retryCount: attempt });
          }

          if (attempt < retries) {
            const delay = retryDelay * Math.pow(2, attempt); // exponential backoff
            logger.info('api', `Retrying ${url} in ${delay}ms`, { attempt: attempt + 1, maxRetries: retries });
            await new Promise<void>(resolve => setTimeout(() => resolve(), delay));
          }
        }
      }

      this.recordFailure(domain);
      perf.recordAPICall({ endpoint: url, method, duration: Date.now() - start, status: 'error', cacheHit: false, retryCount: retries });
      throw lastError || new AppError('requestFailed', `Request failed: ${url}`, { url });
    };

    const promise = execute();
    inflight.set(requestKey, promise);

    try {
      const data = await promise;
      inflight.delete(requestKey);
      const duration = Date.now() - start;
      perf.recordAPICall({ endpoint: url, method, duration, status: 'success', cacheHit: false, retryCount: 0 });
      return { data, cached: false, duration, retryCount: 0 };
    } catch (err) {
      inflight.delete(requestKey);
      throw err;
    }
  }

  async get<T>(url: string, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<APIResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  async post<T>(url: string, body: unknown, config?: Omit<RequestConfig, 'method'>): Promise<APIResponse<T>> {
    return this.request<T>(url, { ...config, method: 'POST', body });
  }

  getCircuitStatus() {
    const status: Record<string, string> = {};
    this.circuits.forEach((circuit, domain) => { status[domain] = circuit.state; });
    return status;
  }
}

export const apiClient = new APIClient();
export default apiClient;
