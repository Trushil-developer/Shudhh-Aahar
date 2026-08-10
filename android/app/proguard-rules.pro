# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ─────────────────────────────────────────────────────────────────
# These rules exist so that when `enableProguardInReleaseBuilds` in
# app/build.gradle is flipped to true, R8 doesn't strip or rename classes
# that these native modules reach via reflection/JNI — most well-maintained
# RN libraries ship their own consumer-rules.pro bundled in their AAR
# (auto-merged, no action needed here), but the ones below are libraries
# with known edge cases where the bundled rules aren't always sufficient,
# based on each library's own proguard troubleshooting docs/issues.
# Do NOT enable minification without testing every one of these features
# (camera scan, health sync, IAP, Google sign-in, file upload) on a real
# release build first — obfuscation bugs don't show up in debug builds.
# ─────────────────────────────────────────────────────────────────

# ── react-native-vision-camera (barcode/photo scanning) ──
-keep class com.mrousavy.camera.** { *; }
-keep class com.google.mlkit.** { *; }
-dontwarn com.mrousavy.camera.**

# ── react-native-health-connect (Android Health Connect API) ──
-keep class androidx.health.connect.client.** { *; }
-keep class com.matinzd.healthconnect.** { *; }
-dontwarn androidx.health.connect.**

# ── react-native-iap (Google Play Billing) ──
-keep class com.android.billingclient.api.** { *; }
-keep class com.dooboolab.RNIap.** { *; }
-dontwarn com.android.billingclient.**

# ── @react-native-google-signin/google-signin ──
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }
-keep class com.reactnativegooglesignin.** { *; }
-dontwarn com.google.android.gms.**

# ── react-native-keychain (Android Keystore-backed secure storage) ──
-keep class com.oblador.keychain.** { *; }
-keep class androidx.security.crypto.** { *; }

# ── react-native-vision-camera / react-native-fs / react-native-document-picker / react-native-image-picker ──
# File and URI handling via reflection-based provider lookups
-keep class com.rnfs.** { *; }
-keep class com.reactnative.documentpicker.** { *; }
-keep class com.imagepicker.** { *; }

# ── react-native-device-info ──
-keep class com.learnium.RNDeviceInfo.** { *; }

# ── react-native-gesture-handler / react-native-screens ──
# Both ship their own consumer rules, but the RN bridge's reflective
# ViewManager lookups are worth an explicit keep as a safety net.
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ── @react-native-async-storage/async-storage ──
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ── @react-native-community/netinfo ──
-keep class com.reactnativecommunity.netinfo.** { *; }

# ── React Native core / Hermes / TurboModules ──
# Bridge and codegen classes are reached reflectively by the RN runtime.
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-dontwarn com.facebook.react.**

# ── JSON/model classes read via reflection by any Gson-based library above ──
# (Play Billing and Google Sign-In both use Gson internally for API responses)
-keepattributes Signature
-keepattributes *Annotation*
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}
