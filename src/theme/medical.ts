// src/theme/medical.ts
// Shuddhaahar design system — "Health-Market Hybrid"
// NHS blue for trust/navigation chrome, grocery green for fresh/safe signals.
// Mirrors the NHS App's visual language (bold black headlines, white cards,
// thin dividers, pill status badges, solid-colour tab bar).

export const Colors = {
  bg:           '#F3F6F9',
  surface:      '#FFFFFF',
  surfaceAlt:   '#F0F4F8',
  border:       '#E1E8F0',
  borderStrong: '#C7D2E0',

  // Primary chrome — NHS blue
  navy:         '#005EB8',
  navyMid:      '#003D78',
  navyLight:    '#E8F1FB',

  textPrimary:  '#141C24',
  textSecondary:'#4C5B6B',
  textMuted:    '#7C8A99',
  textWhite:    '#FFFFFF',

  // Fresh / suitable — grocery green
  safe:         '#00843D',
  safeBg:       '#E8F5EC',
  safeBorder:   '#A9DBBB',

  caution:      '#B45309',
  cautionBg:    '#FEF3CD',
  cautionBorder:'#F6D860',

  danger:       '#C53030',
  dangerBg:     '#FDECEA',
  dangerBorder: '#F5AAAA',

  info:         '#005EB8',
  infoBg:       '#E8F1FB',
  infoBorder:   '#B7D3EF',

  price:        '#00843D',

  warnBg:       '#FEF3CD',
  warnBorder:   '#F6D860',
  warn:         '#B45309',

  // AI / insight accent — kept in the blue family (NHS light blue), replaces
  // the old off-palette purple so AI features still read as part of the app
  accent:       '#41B6E6',
  accentBg:     '#EAF6FC',
  accentBorder: '#B9E4F5',

  nutriA:       '#038141',
  nutriB:       '#85BB2F',
  nutriC:       '#FECB02',
  nutriD:       '#EE8100',
  nutriE:       '#E63312',
};

export const Typography = {
  heading:     'System',
  headingSemi: 'System',
  body:        'System',
  bodyMedium:  'System',
  mono:        'monospace',
  monoMedium:  'monospace',

  // Explicit weight scale — NHS headlines run heavy (700/800), body copy
  // stays regular/medium so bold weights keep their contrast.
  weight: {
    regular: '400' as const,
    medium:  '500' as const,
    semibold:'600' as const,
    bold:    '700' as const,
    heavy:   '800' as const,
  },
};

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardMd: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const StatusConfig = {
  safe: {
    color: Colors.safe,
    bg: Colors.safeBg,
    border: Colors.safeBorder,
    icon: '✓',
    labelKey: 'common.status.safe.label',
    descriptionKey: 'common.status.safe.description',
  },
  caution: {
    color: Colors.caution,
    bg: Colors.cautionBg,
    border: Colors.cautionBorder,
    icon: '!',
    labelKey: 'common.status.caution.label',
    descriptionKey: 'common.status.caution.description',
  },
  avoid: {
    color: Colors.danger,
    bg: Colors.dangerBg,
    border: Colors.dangerBorder,
    icon: '✕',
    labelKey: 'common.status.avoid.label',
    descriptionKey: 'common.status.avoid.description',
  },
};

export const NutriscoreColors: Record<string, string> = {
  a: Colors.nutriA,
  b: Colors.nutriB,
  c: Colors.nutriC,
  d: Colors.nutriD,
  e: Colors.nutriE,
  unknown: Colors.textMuted,
};
