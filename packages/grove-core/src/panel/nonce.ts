import { randomBytes } from "crypto";

/**
 * Generate a cryptographically random nonce for use in Content-Security-Policy
 * script-src directives. Using a fresh nonce per render prevents injected
 * scripts from executing even when the CSP allows inline scripts.
 */
export function getNonce(): string {
  return randomBytes(16).toString("base64");
}
