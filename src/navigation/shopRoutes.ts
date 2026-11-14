// src/navigation/shopRoutes.ts
// Route params for the delivery shop's stacks (see ShopTabs in App.tsx).
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ShopOrder } from '../services/shopService';

export type ShopStackParamList = {
  ShopHome: undefined;
  Search: { category?: string } | undefined;
  ShopProduct: { barcode: string };
  Cart: undefined;
  Checkout: undefined;
  Orders: undefined;
  OrderDetail: { order: ShopOrder; justPlaced?: boolean };
};

export type ShopNav = NativeStackNavigationProp<ShopStackParamList>;
