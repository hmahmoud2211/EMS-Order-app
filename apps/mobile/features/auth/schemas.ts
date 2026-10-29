import { z } from 'zod';

import i18n from '@/i18n';

const t = (key: string) => i18n.t(key);

export const loginSchema = z.object({
  username: z.string().trim().min(1, { message: t('auth.usernameRequired') }),
  password: z.string().min(1, { message: t('auth.passwordRequired') }),
});
export type LoginForm = z.infer<typeof loginSchema>;

const strongPassword = z
  .string()
  .min(8, { message: t('auth.passwordWeak') })
  .max(128)
  .regex(/[A-Za-z؀-ۿ]/, { message: t('auth.passwordWeak') })
  .regex(/\d/, { message: t('auth.passwordWeak') });

export const newPasswordSchema = z
  .object({ password: strongPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: t('auth.passwordMismatch'), path: ['confirm'] });

export const changePasswordSchema = z
  .object({ current: z.string().min(1, { message: t('auth.passwordRequired') }), password: strongPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: t('auth.passwordMismatch'), path: ['confirm'] });

export const resetSchema = z
  .object({
    username: z.string().trim().min(1, { message: t('auth.usernameRequired') }),
    code: z.string().trim().min(6, { message: t('auth.codePlaceholder') }),
    password: strongPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: t('auth.passwordMismatch'), path: ['confirm'] });
