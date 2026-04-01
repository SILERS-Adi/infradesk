import { AppError } from '../middleware/errorHandler';

/**
 * Password requirements:
 * - Min 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character (@$!%*?&#^()_+-=)
 */
export function validatePassword(password: string): void {
  const errors: string[] = [];

  if (password.length < 8) errors.push('minimum 8 znaków');
  if (!/[A-Z]/.test(password)) errors.push('wielka litera');
  if (!/[a-z]/.test(password)) errors.push('mała litera');
  if (!/[0-9]/.test(password)) errors.push('cyfra');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('znak specjalny (@$!%*?&)');

  if (errors.length > 0) {
    throw new AppError(`Hasło nie spełnia wymagań: ${errors.join(', ')}`, 400);
  }
}
