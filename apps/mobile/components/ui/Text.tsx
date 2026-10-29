import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

const variants = {
  display: 'text-[28px] leading-[34px] font-sans-bold',
  title: 'text-[22px] leading-[28px] font-sans-bold',
  heading: 'text-[17px] leading-[23px] font-sans-semibold',
  subheading: 'text-[15px] leading-[21px] font-sans-semibold',
  body: 'text-[15px] leading-[22px] font-sans',
  small: 'text-[13px] leading-[19px] font-sans',
  caption: 'text-[12px] leading-[16px] font-sans-medium',
  label: 'text-[13px] leading-[18px] font-sans-semibold',
  overline: 'text-[11px] leading-[14px] font-sans-semibold uppercase tracking-wider',
} as const;

const tones = {
  ink: 'text-ink',
  soft: 'text-ink-soft',
  muted: 'text-muted',
  white: 'text-white',
  primary: 'text-primary',
  cyan: 'text-cyan-600',
  success: 'text-success-700',
  warning: 'text-warning-700',
  danger: 'text-danger',
  whiteMuted: 'text-white/70',
} as const;

export type TextVariant = keyof typeof variants;
export type TextTone = keyof typeof tones;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  className?: string;
}

export function Text({ variant = 'body', tone = 'ink', className = '', ...rest }: TextProps) {
  return <RNText className={`${variants[variant]} ${tones[tone]} ${className}`} {...rest} />;
}
