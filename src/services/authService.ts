// src/services/authService.ts
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Config from '../config/environment';
import { AppError } from '../utils/AppError';

GoogleSignin.configure({
  webClientId: Config.googleWebClientId,
  iosClientId: Config.googleIosClientId,
  offlineAccess: false,
});

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

// Which provider signed the current session in — persisted so a silent
// restore on app launch (getCurrentUser) and every later getAuthToken() call
// know which flow to use. Absent (undefined) means either never signed in,
// or signed in with Google before this key existed — both cases fall back
// to the Google path below, same as always.
const AUTH_PROVIDER_KEY = 'shuddhaahar_auth_provider';
// Apple's native identityToken is only valid ~10 minutes with no silent
// refresh API, unlike Google's (refreshed on demand via GoogleSignin.getTokens()).
// So instead this stores the long-lived session token apple-auth.js mints
// once at sign-in — see that Lambda's header comment for the full rationale.
const APPLE_SESSION_KEY = 'shuddhaahar_apple_session';

interface AppleSession {
  sessionToken: string;
  profile: UserProfile;
}

function toUserProfile(user: { id: string; email: string; name: string | null; photo: string | null }): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    picture: user.photo || undefined,
  };
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Neither atob nor Buffer is guaranteed present in this RN runtime (no
// polyfill for either is installed), so this decodes base64url by hand —
// used only for a local, advisory expiry check so a dead session token
// doesn't get sent to the backend where it would just be rejected. Real
// verification always happens server-side.
function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of normalized) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return decodeURIComponent(
    output.split('').map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  );
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    return JSON.parse(base64UrlDecode(token.split('.')[1]));
  } catch {
    return null;
  }
}

async function getAppleSession(): Promise<AppleSession | null> {
  const raw = await AsyncStorage.getItem(APPLE_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppleSession;
  } catch {
    return null;
  }
}

// Google Sign In — shows the native account picker, no browser involved.
export async function signInWithGoogle(): Promise<UserProfile> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    throw new AppError('googleSignInCancelled', 'Google sign-in was cancelled');
  }
  await AsyncStorage.setItem(AUTH_PROVIDER_KEY, 'google');
  return toUserProfile(response.data.user);
}

// Sign in with Apple — native prompt, then exchange the resulting
// identityToken for a durable session token via apple-auth.js (see that
// Lambda's header comment for why: Apple's own token expires in ~10 minutes
// with no silent-refresh API, so it can't be reused the way Google's can).
export async function signInWithApple(): Promise<UserProfile> {
  if (!appleAuth.isSupported) {
    throw new AppError('appleSignInUnsupported', 'Sign in with Apple is not supported on this device');
  }

  let request;
  try {
    request = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
    });
  } catch (err: any) {
    if (err?.code === '1001') throw new AppError('appleSignInCancelled', 'Apple sign-in was cancelled');
    throw err;
  }

  if (!request.identityToken) {
    throw new AppError('appleSignInFailed', 'Apple sign-in did not return an identity token');
  }

  // No getCredentialStateForUser() check here: apple-auth.js already verifies
  // the identityToken's signature, issuer, audience and expiry against
  // Apple's JWKS, so a second native round trip adds a failure point
  // without adding any trust.

  if (!Config.appleAuthUrl) {
    throw new AppError('appleSignInFailed', 'Apple sign-in is not configured for this build');
  }

  // Only present on the very first authorization ever — apple-auth.js
  // persists whatever it's given here via createUserRecord downstream,
  // since Apple will never send it again after this.
  const name = [request.fullName?.givenName, request.fullName?.familyName].filter(Boolean).join(' ').trim();

  const res = await fetch(Config.appleAuthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identityToken: request.identityToken,
      email: request.email || undefined,
      name: name || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new AppError('appleSignInFailed', data.error || 'Apple sign-in failed');
  }

  const profile: UserProfile = { id: data.sub, email: data.email || '', name: data.name || '' };
  await AsyncStorage.setItem(AUTH_PROVIDER_KEY, 'apple');
  await AsyncStorage.setItem(APPLE_SESSION_KEY, JSON.stringify({ sessionToken: data.token, profile } as AppleSession));
  return profile;
}

// Sign Out
export async function signOut(): Promise<void> {
  const provider = await AsyncStorage.getItem(AUTH_PROVIDER_KEY);
  await AsyncStorage.removeItem(AUTH_PROVIDER_KEY);
  if (provider === 'apple') {
    await AsyncStorage.removeItem(APPLE_SESSION_KEY);
    return;
  }
  await GoogleSignin.signOut();
}

// Get current logged-in user, refreshing the session silently if possible
export async function getCurrentUser(): Promise<UserProfile | null> {
  const provider = await AsyncStorage.getItem(AUTH_PROVIDER_KEY);

  if (provider === 'apple') {
    const session = await getAppleSession();
    if (!session) return null;
    // No silent-refresh path exists for Apple — a session past its (long)
    // expiry just signs the user out locally, same as a revoked Google
    // session falling through to null below.
    const payload = decodeJwtPayload(session.sessionToken);
    if (!payload?.exp || payload.exp * 1000 < Date.now()) return null;
    return session.profile;
  }

  try {
    const hasPrevious = await GoogleSignin.hasPreviousSignIn();
    if (!hasPrevious) return null;
    const response = await GoogleSignin.signInSilently();
    if (response.type !== 'success') return null;
    return toUserProfile(response.data.user);
  } catch {
    return null;
  }
}

// Get a fresh auth token for API calls — passed as the AppSync/iap-verify
// `Authorization` header. Google's is a short-lived ID token refreshed on
// demand; Apple's is the long-lived session token from sign-in (see
// signInWithApple above) — both are verified the same way server-side (see
// google-auth-authorizer.js and iap-verify.js's requireCallerId).
export async function getAuthToken(): Promise<string | null> {
  const provider = await AsyncStorage.getItem(AUTH_PROVIDER_KEY);

  if (provider === 'apple') {
    const session = await getAppleSession();
    return session?.sessionToken || null;
  }

  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens.idToken || null;
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_REQUIRED) return null;
    return null;
  }
}

// Check if user is logged in
export async function isAuthenticated(): Promise<boolean> {
  const provider = await AsyncStorage.getItem(AUTH_PROVIDER_KEY);
  if (provider === 'apple') {
    return !!(await getAppleSession());
  }
  return GoogleSignin.hasPreviousSignIn();
}
