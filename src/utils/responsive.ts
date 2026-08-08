// src/utils/responsive.ts
// Responsive design system for Shuddhaahar
// Scales fonts, spacing, and layout across all iOS/Android screen sizes
// Reference design: iPhone 14 (390 × 844pt)

import { Dimensions, PixelRatio, Platform, useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

const { width: W, height: H } = Dimensions.get('window');

const BASE_W = 390;  // iPhone 14 reference
const BASE_H = 844;

/** Shared max-width for centered content on tablet (forms, CMS text, cards) — one breakpoint everyone agrees on. */
export const TABLET_CONTENT_MAX_WIDTH = 700;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// Scale factor clamped to prevent extreme values on tablets
const scaleW = clamp(W / BASE_W, 0.75, 1.25);
const scaleH = clamp(H / BASE_H, 0.75, 1.25);

// ── Core scaling functions (launch-time snapshot — see useResponsive() below
// for the live-reactive equivalent used by every screen/component) ─────────

/** Scale a horizontal dimension (width, padding, margin) */
export function rw(size: number): number {
  return Math.round(size * scaleW);
}

/** Scale a vertical dimension (height, vertical padding) */
export function rh(size: number): number {
  return Math.round(size * scaleH);
}

/** Scale a font size — uses moderate scaling to prevent huge text on tablets */
export function rf(size: number): number {
  const scaled = size * scaleW;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

/** Scale border radius */
export function rr(radius: number): number {
  return Math.round(radius * Math.min(scaleW, 1.1));
}

/** Scale spacing (padding/margin) */
export const rs = rw;

// ── Screen info ─────────────────────────────────────────────

export const screen = {
  width:     W,
  height:    H,
  isSmall:   W < 360,          // SE, older Androids
  isMedium:  W >= 360 && W < 414,
  isLarge:   W >= 414,
  isTablet:  W >= 768,
  hasNotch:  H >= 812 && Platform.OS === 'ios',
  statusBarH: Platform.OS === 'ios' ? (H >= 812 ? 44 : 20) : 24,
  tabBarH:   Platform.OS === 'ios' ? (H >= 812 ? 83 : 49) : 56,
};

// ── Column grid ─────────────────────────────────────────────

/** Number of columns for card grids */
export function getColumns(minCardWidth = 140): number {
  return Math.floor(W / minCardWidth);
}

/** Card width for a given number of columns with gutter */
export function getCardWidth(columns: number, gutter = 16, padding = 16): number {
  return Math.floor((W - (padding * 2) - (gutter * (columns - 1))) / columns);
}

// ── Responsive style presets ─────────────────────────────────

function buildRStyles(rwFn: (n: number) => number, rfFn: (n: number) => number, rrFn: (n: number) => number) {
  return {
    // Text sizes
    text: {
      xs:   rfFn(10),
      sm:   rfFn(12),
      base: rfFn(14),
      md:   rfFn(15),
      lg:   rfFn(17),
      xl:   rfFn(20),
      xxl:  rfFn(24),
      h1:   rfFn(30),
      h2:   rfFn(24),
      h3:   rfFn(20),
    },

    // Spacing
    space: {
      xs:   rwFn(4),
      sm:   rwFn(8),
      md:   rwFn(12),
      lg:   rwFn(16),
      xl:   rwFn(20),
      xxl:  rwFn(24),
      xxxl: rwFn(32),
    },

    // Border radius
    radius: {
      sm:  rrFn(8),
      md:  rrFn(12),
      lg:  rrFn(16),
      xl:  rrFn(20),
      pill: rrFn(999),
    },

    // Icon sizes
    icon: {
      sm:  rwFn(16),
      md:  rwFn(20),
      lg:  rwFn(24),
      xl:  rwFn(32),
      xxl: rwFn(48),
    },

    // Touch target (minimum 44pt per Apple HIG)
    touch: {
      min:  Math.max(rwFn(44), 44),
      md:   Math.max(rwFn(48), 44),
      lg:   Math.max(rwFn(56), 44),
    },
  };
}

/** Launch-time snapshot — prefer useResponsive() inside components so this updates on rotation/resize. */
export const rStyles = buildRStyles(rw, rf, rr);

// ── useResponsive hook ───────────────────────────────────────
// The single live-reactive source of truth. Built on RN's own useWindowDimensions
// (auto-updates on rotation, split-screen/multitasking resize — no manual
// Dimensions.addEventListener plumbing needed). Every scale function, rStyles,
// and layout helper is recomputed from the CURRENT window size, memoized per
// render so screens can safely use the returned functions as useMemo deps.

export function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const sW = clamp(width / BASE_W, 0.75, 1.25);
    const sH = clamp(height / BASE_H, 0.75, 1.25);

    const liveRw = (size: number) => Math.round(size * sW);
    const liveRh = (size: number) => Math.round(size * sH);
    const liveRf = (size: number) => Math.round(PixelRatio.roundToNearestPixel(size * sW));
    const liveRr = (radius: number) => Math.round(radius * Math.min(sW, 1.1));

    const isTablet = width >= 768;
    const isLandscape = width > height;

    return {
      width,
      height,
      isLandscape,
      screen: {
        width,
        height,
        isSmall:  width < 360,
        isMedium: width >= 360 && width < 414,
        isLarge:  width >= 414,
        isTablet,
        hasNotch: height >= 812 && Platform.OS === 'ios',
        statusBarH: Platform.OS === 'ios' ? (height >= 812 ? 44 : 20) : 24,
        tabBarH:   Platform.OS === 'ios' ? (height >= 812 ? 83 : 49) : 56,
      },
      isSmall:  width < 360,
      isMedium: width >= 360 && width < 414,
      isLarge:  width >= 414,
      isTablet,

      rw: liveRw,
      rh: liveRh,
      rf: liveRf,
      rr: liveRr,
      rs: liveRw,
      rStyles: buildRStyles(liveRw, liveRf, liveRr),

      getColumns: (minCardWidth = 140) => Math.floor(width / minCardWidth),
      getCardWidth: (columns: number, gutter = 16, padding = 16) =>
        Math.floor((width - (padding * 2) - (gutter * (columns - 1))) / columns),
    };
  }, [width, height]);
}
