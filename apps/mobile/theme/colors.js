/**
 * EMS brand palette. Shared by tailwind.config.js (className styling) and
 * theme/index.ts (places that need raw values: icons, navigation, charts).
 */
module.exports = {
  navy: { DEFAULT: '#0B1736', 700: '#14244D', 600: '#1C2F60' },
  primary: {
    DEFAULT: '#185ADB',
    50: '#EEF4FF',
    100: '#DCE8FD',
    200: '#B9D0FA',
    500: '#185ADB',
    600: '#144BB8',
    700: '#0F3A8F',
  },
  cyan: { DEFAULT: '#18B7D8', 50: '#E7F8FC', 100: '#C9EFF7', 600: '#1293AE' },
  canvas: '#F7F9FC',
  surface: '#FFFFFF',
  ink: { DEFAULT: '#17233B', soft: '#3A4760' },
  muted: { DEFAULT: '#78869B', light: '#A3AEBF' },
  line: { DEFAULT: '#E4E9F2', strong: '#CDD5E2' },
  success: { DEFAULT: '#16A34A', 50: '#EAF7EF', 700: '#0F7A37' },
  warning: { DEFAULT: '#F59E0B', 50: '#FEF5E6', 700: '#B45309' },
  danger: { DEFAULT: '#DC2626', 50: '#FDECEC', 700: '#A91D1D' },
};
