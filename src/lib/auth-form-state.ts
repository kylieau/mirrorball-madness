export type AuthFormState = { error: string | null; notice?: string };

export const INITIAL_AUTH_STATE: AuthFormState = { error: null };

export function authErrorMessage(message: string): string {
  if (message === "confirmation") return "This confirmation link is invalid or expired. Request a new link.";
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/already registered|already been registered/i.test(message)) return "An account already exists for this email. Try signing in.";
  if (/email not confirmed/i.test(message)) return "Check your email to confirm your account before signing in.";
  if (/rate limit|too many|security purposes/i.test(message)) return "Too many attempts. Please wait a little and try again.";
  if (/password.*least|weak password/i.test(message)) return "Choose a stronger password with at least 8 characters.";
  return "Could not complete sign-in. Please try again.";
}
