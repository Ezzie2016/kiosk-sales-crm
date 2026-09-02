/**
 * New-salesperson input validation (spec §15). Pure — the edge function
 * re-validates server-side; this is for immediate form feedback.
 */
export interface NewSalespersonInput {
  email: string;
  fullName: string;
  password: string;
}

export function validateNewSalesperson(input: NewSalespersonInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = input.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email';
  if (input.fullName.trim().length < 2) errors.fullName = 'Full name is required';
  if (input.password.length < 8) errors.password = 'Password must be at least 8 characters';
  return errors;
}

/** A readable one-off password for the "add salesperson" form. */
export function suggestPassword(): string {
  const words = ['kiosk', 'lagos', 'market', 'sales', 'naira', 'store', 'trade'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}
