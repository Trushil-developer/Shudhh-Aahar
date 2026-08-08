// src/utils/secureStorage.ts
// Thin wrapper around react-native-keychain for the one class of data that
// genuinely belongs there: small, identifying values (the current session's
// userId) — not bulk data. Keychain/Keystore are built for a handful of
// small secrets, not a rotating array of hundreds of log entries; see the
// comment in logger.ts/errorReporter.ts for how the bulk-storage side of
// this fix was actually handled (stop persisting the identifying field at
// all, rather than moving the whole array here).

import * as Keychain from 'react-native-keychain';

// Keychain's generic-password API is a username/password pair scoped by
// `service` — used here as a plain key→value slot, one per `key`.
const SERVICE_PREFIX = 'shuddhaahar_secure_';

export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await Keychain.setGenericPassword('shuddhaahar', value, { service: SERVICE_PREFIX + key });
  } catch (err) {
    console.error(`secureStorage: failed to write "${key}"`, err);
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    const result = await Keychain.getGenericPassword({ service: SERVICE_PREFIX + key });
    return result ? result.password : null;
  } catch (err) {
    console.error(`secureStorage: failed to read "${key}"`, err);
    return null;
  }
}

export async function removeSecureItem(key: string): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE_PREFIX + key });
  } catch (err) {
    console.error(`secureStorage: failed to remove "${key}"`, err);
  }
}
