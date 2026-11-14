// The app is in shop mode (src/config/appMode.ts): Apple Health isn't used,
// so the HealthKit native module isn't linked on iOS. Its JS stays in the
// codebase (healthKitService.ts already tolerates the module being absent).
// Remove this entry to bring Apple Health back.
module.exports = {
  dependencies: {
    'react-native-health': {
      platforms: { ios: null },
    },
  },
};
