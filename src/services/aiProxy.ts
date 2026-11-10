// src/services/aiProxy.ts
// Every Claude call goes through the ai-proxy Lambda (terraform/ai_proxy.tf),
// which holds the Anthropic API key server-side — the key is never shipped
// in the app bundle. Callers build the same Messages API body as before;
// the proxy returns Anthropic's response unchanged.

import Config from '../config/environment';
import { getAuthToken } from './authService';
import { AppError } from '../utils/AppError';

export function isAIConfigured(): boolean {
  return !!Config.aiProxyUrl;
}

export async function postClaudeMessages(body: object, signal?: AbortSignal): Promise<Response> {
  const token = await getAuthToken();
  if (!token) throw new AppError('apiError', 'Sign in required for AI features');

  return fetch(Config.aiProxyUrl, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(body),
  });
}
