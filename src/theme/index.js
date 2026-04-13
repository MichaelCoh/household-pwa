export const Colors = {
  // Background layers
  bg: '#F7F8FA',
  bgCard: '#FFFFFF',
  bgElevated: '#F0F2F5',
  bgModal: '#FFFFFF',
  border: '#E8EAF0',
  borderLight: '#F0F2F5',

  // Brand accents
  primary: '#5B6AF0',
  primaryLight: '#EEF0FD',
  primaryDark: '#4455E0',

  teal: '#00BFA5',
  tealLight: '#E0F7F4',

  coral: '#FF5A5A',
  coralLight: '#FFF0F0',

  amber: '#FF9500',
  amberLight: '#FFF4E0',

  sky: '#2196F3',
  skyLight: '#E3F2FD',

  mint: '#34C759',
  mintLight: '#EDFAF1',

  purple: '#9C6FFF',
  purpleLight: '#F3EEFF',

  // Text
  textPrimary: '#1A1D2E',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnDark: '#FFFFFF',

  // Status
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  info: '#007AFF',

  // Tab
  tabBg: '#FFFFFF',
  tabBorder: '#E8EAF0',
  tabActive: '#5B6AF0',
  tabInactive: '#9CA3AF',

  // Shadows
  shadow: 'rgba(0,0,0,0.06)',
  shadowMd: 'rgba(0,0,0,0.10)',
};

export const TAB_COLORS = {
  home: Colors.primary,
  shopping: Colors.teal,
  tasks: Colors.coral,
  calendar: Colors.sky,
  budget: Colors.amber,
};

export const Fonts = {
  sizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 26,
    xxxl: 32,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const Shadow = {
  sm: {
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: Colors.shadowMd,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
};
