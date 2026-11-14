// App.tsx — Shuddhaahar with T&C gate
// Flow: Login → T&C check → Health setup → Walkthrough → App
// T&C gate is checked on EVERY login and blocks the app if new version exists

import './src/i18n';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, View, ActivityIndicator, Text, Image, Platform, Linking, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DeviceInfo from 'react-native-device-info';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppConfigProvider, useAppConfig } from './src/context/AppConfigContext';
import { isVersionBelow } from './src/services/appConfigService';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineBar } from './src/components/OfflineBar';
import { Colors } from './src/theme/medical';
import logger from './src/utils/logger';
import errorReporter, { setupGlobalErrorHandler, setupPromiseRejectionHandler } from './src/utils/errorReporter';
// PHASE 2: import { WalkthroughModal } from './src/components/AppGuide';
import TCConsentModal from './src/components/TCConsentModal';
import { TabIcon } from './src/components/TabIcon';
import { checkTCAcceptance, TCVersion, TCCheckResult } from './src/services/tcService';
import { initIAPConnection } from './src/services/subscriptionService';

import LoginScreen from './src/screens/LoginScreen';
import HealthProfileScreen from './src/screens/HealthProfileScreen';
import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import ProductScreen from './src/screens/ProductScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ShoppingListScreen from './src/screens/ShoppingListScreen';
import CouponExchangeScreen from './src/screens/CouponExchangeScreen';
import { SHOP_MODE } from './src/config/appMode';
import { ShopProvider, useShop } from './src/context/ShopContext';
import { ShopStackParamList } from './src/navigation/shopRoutes';
import ShopHomeScreen from './src/screens/ShopHomeScreen';
import ShopSearchScreen from './src/screens/ShopSearchScreen';
import ShopProductScreen from './src/screens/ShopProductScreen';
import CartScreen from './src/screens/CartScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';

// Bootstrap production monitoring
setupGlobalErrorHandler();
setupPromiseRejectionHandler();
logger.info('app', 'Shuddhaahar starting', { version: DeviceInfo.getVersion(), env: __DEV__ ? 'dev' : 'prod' });

// Must resolve before any StoreKit/Play Billing call (requestPurchase,
// restorePurchases, etc.) will work — see subscriptionService.ts's
// initIAPConnection comment for why every purchase attempt was failing
// without this. Skipped in shop mode — nothing is sold through the stores.
if (!SHOP_MODE) void initIAPConnection();

export type RootStackParamList = {
  Home: undefined;
  Scan: undefined;
  Product: { barcode: string; fromRecommendation?: boolean; whyBetter?: string; fromScan?: boolean; scansRemaining?: number };
  History: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const ShopStack = createNativeStackNavigator<ShopStackParamList>();
const Tab   = createBottomTabNavigator();
const linking = { prefixes: ['shuddhaahar://'], config: { screens: {} } };

// ── Splash / Loading screen ─────────────────────────────────
function SplashScreen() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ marginBottom: 24, shadowColor: Colors.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 }}>
        <Image source={require('./src/assets/app-icon.png')} style={{ width: 60, height: 60, borderRadius: 16 }} />
      </View>
      <ActivityIndicator size="large" color={Colors.navyMid} />
      <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 14, letterSpacing: 0.5 }}>{t('app.splashLoading')}</Text>
    </View>
  );
}

// ── Update-required screen — hard block, no dismiss ─────────
// Shown when the running native version is below the admin-configured
// minVersionIOS/minVersionAndroid. There's no real store listing yet, so
// the button opens a placeholder URL matching the bundle ID convention
// used elsewhere (see src/config/environment.ts).
function UpdateRequiredScreen() {
  const { t } = useTranslation();
  const storeUrl = Platform.OS === 'ios'
    ? 'https://apps.apple.com/app/id0000000000'
    : 'https://play.google.com/store/apps/details?id=com.shuddhaahar';

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <View style={{ marginBottom: 24, shadowColor: Colors.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 }}>
        <Image source={require('./src/assets/app-icon.png')} style={{ width: 72, height: 72, borderRadius: 18 }} />
      </View>
      <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: 10, textAlign: 'center' }}>
        {t('app.updateRequiredTitle')}
      </Text>
      <Text style={{ color: Colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 }}>
        {t('app.updateRequiredMessage')}
      </Text>
      <TouchableOpacity
        onPress={() => Linking.openURL(storeUrl)}
        style={{ backgroundColor: Colors.navy, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 }}
      >
        <Text style={{ color: Colors.textWhite, fontSize: 16, fontWeight: '700' }}>{t('app.updateNow')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Delivery shop (SHOP_MODE) ───────────────────────────────
// Five tabs, each its own stack. Anyone can browse; signing in is only
// asked for at checkout and on the Orders tab (see SignInModal).
const shopStackOptions = { headerShown: false, animation: 'slide_from_right' as const };

function ShopHomeStack() {
  return (
    <ShopStack.Navigator screenOptions={shopStackOptions}>
      <ShopStack.Screen name="ShopHome"    component={ShopHomeScreen} />
      <ShopStack.Screen name="Search"      component={ShopSearchScreen} />
      <ShopStack.Screen name="ShopProduct" component={ShopProductScreen} />
    </ShopStack.Navigator>
  );
}

function ShopSearchStack() {
  return (
    <ShopStack.Navigator screenOptions={shopStackOptions}>
      <ShopStack.Screen name="Search"      component={ShopSearchScreen} />
      <ShopStack.Screen name="ShopProduct" component={ShopProductScreen} />
    </ShopStack.Navigator>
  );
}

function CartStack() {
  return (
    <ShopStack.Navigator screenOptions={shopStackOptions}>
      <ShopStack.Screen name="Cart"        component={CartScreen} />
      <ShopStack.Screen name="Checkout"    component={CheckoutScreen} />
      <ShopStack.Screen name="ShopProduct" component={ShopProductScreen} />
    </ShopStack.Navigator>
  );
}

function OrdersStack() {
  return (
    <ShopStack.Navigator screenOptions={shopStackOptions}>
      <ShopStack.Screen name="Orders"      component={OrdersScreen} />
      <ShopStack.Screen name="OrderDetail" component={OrderDetailScreen} />
    </ShopStack.Navigator>
  );
}

function ShopTabs() {
  const { t } = useTranslation();
  const { cartCount } = useShop();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: Colors.navy, borderTopWidth: 0, height: 68, paddingBottom: 10, paddingTop: 8 },
        tabBarActiveTintColor: Colors.textWhite,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.65)',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
      }}
    >
      <Tab.Screen name="HomeTab"    component={ShopHomeStack}   options={{ tabBarLabel: t('shop.tabHome'),   tabBarIcon: ({ color, focused }) => <TabIcon emoji="🏠" color={color} focused={focused} /> }} />
      <Tab.Screen name="SearchTab"  component={ShopSearchStack} options={{ tabBarLabel: t('shop.tabSearch'), tabBarIcon: ({ color, focused }) => <TabIcon emoji="🔍" color={color} focused={focused} /> }} />
      <Tab.Screen name="CartTab"    component={CartStack}       options={{ tabBarLabel: t('shop.tabCart'),   tabBarBadge: cartCount > 0 ? cartCount : undefined, tabBarIcon: ({ color, focused }) => <TabIcon emoji="🛒" color={color} focused={focused} /> }} />
      <Tab.Screen name="OrdersTab"  component={OrdersStack}     options={{ tabBarLabel: t('shop.tabOrders'), tabBarIcon: ({ color, focused }) => <TabIcon emoji="📦" color={color} focused={focused} /> }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen}   options={{ tabBarLabel: t('app.tabProfile'), tabBarIcon: ({ color, focused }) => <TabIcon emoji="👤" color={color} focused={focused} /> }} />
    </Tab.Navigator>
  );
}

// ── Home stack (Home → Scan → Product) ─────────────────────
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Home"    component={HomeScreen} />
      <Stack.Screen name="Scan"    component={ScanScreen} />
      <Stack.Screen name="Product" component={ProductScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
    </Stack.Navigator>
  );
}

// ── Bottom tab navigator ────────────────────────────────────
function MainTabs() {
  const { t } = useTranslation();
  // Coupon Exchange only gets its own tab while the admin kill switch is on
  // — see AppConfig.couponExchangeEnabled's comment in schema.graphql. This
  // is the same on/off gate that used to just hide a row inside Profile;
  // conditionally including/excluding a Tab.Screen works the same way.
  const { config: appConfig } = useAppConfig();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: Colors.navy, borderTopWidth: 0, height: 68, paddingBottom: 10, paddingTop: 8 },
        tabBarActiveTintColor: Colors.textWhite,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.65)',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
      }}
    >
      <Tab.Screen name="HomeTab"    component={HomeStack}          options={{ tabBarLabel: t('app.tabHome'),    tabBarIcon: ({ color, focused }) => <TabIcon emoji="🏠" color={color} focused={focused} /> }} />
      <Tab.Screen name="ListTab"    component={ShoppingListScreen} options={{ tabBarLabel: t('app.tabWishlist'), tabBarIcon: ({ color, focused }) => <TabIcon emoji="❤️" color={color} focused={focused} /> }} />
      {appConfig.couponExchangeEnabled && (
        <Tab.Screen name="CouponsTab" component={CouponExchangeScreen} options={{ tabBarLabel: t('app.tabCoupons'), tabBarIcon: ({ color, focused }) => <TabIcon emoji="🎟️" color={color} focused={focused} /> }} />
      )}
      <Tab.Screen name="ProfileTab" component={ProfileScreen}      options={{ tabBarLabel: t('app.tabProfile'), tabBarIcon: ({ color, focused }) => <TabIcon emoji="👤" color={color} focused={focused} /> }} />
    </Tab.Navigator>
  );
}

// ── Main navigator — controls the whole app flow ────────────
function AppNavigator() {
  const { user, loading } = useAuth();
  const { config: appConfig, loading: appConfigLoading } = useAppConfig();

  // Force-update gate — compares the real native version against the
  // admin-configured minimum. Runs before even the !user check below, per
  // the design: this blocks a not-yet-logged-in user too. fetchAppConfig()
  // already fails open (defaults to '0.0.0', which no real version is ever
  // below), so a config-fetch failure naturally never triggers this.
  const currentVersion = DeviceInfo.getVersion();
  const minVersion = Platform.OS === 'ios' ? appConfig.minVersionIOS : appConfig.minVersionAndroid;
  const updateRequired = isVersionBelow(currentVersion, minVersion);

  // App-level state machine
  const [showHealthSetup, setShowHealthSetup] = useState(false);
  // PHASE 2: const [showWalkthrough, setShowWalkthrough] = useState(false);

  // T&C gate state
  const [tcCheck,     setTCCheck]     = useState<TCCheckResult | null>(null);
  const [tcChecking,  setTCChecking]  = useState(false);
  const [showTCModal, setShowTCModal] = useState(false);

  // ── Step 1: When user logs in, check T&C + new-user health setup ──
  useEffect(() => {
    if (!user) return;

    // Set synchronously, in this same effect pass — BEFORE any of the async
    // work below, including the health-setup AsyncStorage read. That read
    // used to run first, and until it resolved, `loading` was already false
    // but `tcChecking` hadn't been set true yet: with `user` truthy and
    // `showTCModal` still false (T&C hadn't been checked), the render logic
    // fell straight through to the main app for however many frames that gap
    // lasted — a real window where the mandatory consent gate was bypassed.
    setTCChecking(true);

    const init = async () => {
      // Show health setup only once — first time this user ever signs in.
      // AsyncStorage key is per-user so returning users are never re-prompted.
      const key = `health_setup_prompted_${user.id}`;
      const alreadyPrompted = await AsyncStorage.getItem(key);
      if (!alreadyPrompted && !SHOP_MODE) {
        await AsyncStorage.setItem(key, 'true');
        setShowHealthSetup(true);
      }

      // Always check T&C on every login
      await runTCCheck(user.id);
    };

    init();
  }, [user?.id]);

  const runTCCheck = async (userId: string) => {
    setTCChecking(true);
    try {
      const result = await checkTCAcceptance(userId);
      setTCCheck(result);
      if (result.needsAcceptance) {
        logger.info('app', 'T&C acceptance required', { version: result.currentVersion.version, isUpdate: result.isUpdate });
        setShowTCModal(true);
      }
    } catch (err) {
      // If TC check fails (network down etc.), be permissive — don't block user
      // for a network error. The check will run again next login.
      logger.warn('app', 'T&C check failed — allowing through', {}, err as Error);
    } finally {
      setTCChecking(false);
    }
  };

  const handleTCAccepted = () => {
    setShowTCModal(false);
    setTCCheck(prev => prev ? { ...prev, needsAcceptance: false } : null);
    logger.info('app', 'T&C accepted — user unblocked');
  };

  // ── Render: priority order ──────────────────────────────
  // 1. Loading spinner — config loading is treated the same as auth/T&C
  //    still loading, so the update-required check below never runs on
  //    stale/default data while the real config is in flight.
  if (SHOP_MODE) {
    // Only the first load shows the splash — signing in later must not
    // unmount the navigator (it would throw away the checkout the customer
    // was in the middle of).
    if (loading || appConfigLoading) return <SplashScreen />;
    if (updateRequired) return <UpdateRequiredScreen />;
    return (
      <>
        <NavigationContainer linking={linking}>
          <OfflineBar />
          <ShopTabs />
        </NavigationContainer>
        {user && showTCModal && tcCheck && (
          <TCConsentModal
            visible={true}
            version={tcCheck.currentVersion}
            isUpdate={tcCheck.isUpdate}
            acceptedVersion={tcCheck.acceptedVersion}
            userId={user.id}
            onAccepted={handleTCAccepted}
          />
        )}
      </>
    );
  }

  if (loading || tcChecking || appConfigLoading) {
    return <SplashScreen />;
  }

  // 2. Force-update gate — hard block, no dismiss, runs before even the
  //    login check so an out-of-date not-yet-logged-in user is blocked too.
  if (updateRequired) return <UpdateRequiredScreen />;

  // 3. Login (not authenticated)
  if (!user) return <LoginScreen />;

  // 4. T&C blocking gate — shown on top of everything
  //    The modal handles its own full-screen rendering
  //    We still render the app behind it but it's fully blocked
  if (showTCModal && tcCheck) {
    return (
      <TCConsentModal
        visible={true}
        version={tcCheck.currentVersion}
        isUpdate={tcCheck.isUpdate}
        acceptedVersion={tcCheck.acceptedVersion}
        userId={user.id}
        onAccepted={handleTCAccepted}
      />
    );
  }

  // 5. Health profile setup (first time after login + T&C accepted)
  if (showHealthSetup) {
    return (
      <HealthProfileScreen
        onComplete={() => {
          setShowHealthSetup(false);
          // PHASE 2: setShowWalkthrough(true);
        }}
      />
    );
  }

  // 6. Main app
  return (
    <NavigationContainer linking={linking}>
      <OfflineBar />
      <MainTabs />
      {/* PHASE 2: App walkthrough not in Phase 1 scope
      <WalkthroughModal
        visible={showWalkthrough}
        onComplete={() => setShowWalkthrough(false)}
      />
      */}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    // Required by react-native-gesture-handler (powers HomeScreen's
    // swipe-to-delete) — must wrap the whole tree, as high as possible.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          {/* AppConfigProvider wraps AuthProvider (not just AppNavigator) because
              AuthContext's AuthProvider itself calls useAppConfig() to source the
              daily scan limit — it needs AppConfigProvider as an ancestor, not a
              sibling. AppConfigProvider has no dependency on auth state, so this
              nesting is safe either way; this order is required for the above. */}
          <AppConfigProvider>
            <AuthProvider>
              <ShopProvider>
                <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
                <AppNavigator />
              </ShopProvider>
            </AuthProvider>
          </AppConfigProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
