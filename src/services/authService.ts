// src/services/authService.ts
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
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

function toUserProfile(user: { id: string; email: string; name: string | null; photo: string | null }): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name || '',
    picture: user.photo || undefined,
  };
}

// Google Sign In — shows the native account picker, no browser involved.
export async function signInWithGoogle(): Promise<UserProfile> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    throw new AppError('googleSignInCancelled', 'Google sign-in was cancelled');
  }
  return toUserProfile(response.data.user);
}

// Sign Out
export async function signOut(): Promise<void> {
  await GoogleSignin.signOut();
}

// Get current logged-in user, refreshing the session silently if possible
export async function getCurrentUser(): Promise<UserProfile | null> {
  try {
    const hasPrevious = await GoogleSignin.hasPreviousSignIn();
    if (!hasPrevious) return null;
    const response = await GoogleSignin.signInSilently();
    if (!isSuccessResponse(response)) return null;
    return toUserProfile(response.data.user);
  } catch {
    return null;
  }
}

// Get a fresh Google ID token for API calls — passed as the AppSync
// `Authorization` header, verified server-side by the Lambda authorizer.
export async function getAuthToken(): Promise<string | null> {
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
  return GoogleSignin.hasPreviousSignIn();
}
