import { describe, expect, it } from 'vitest';

import { DEFAULT_CSP_POLICY, resolveCspPolicy } from './cspPolicy';

describe('resolveCspPolicy', () => {
  it('keeps a valid CSP policy unchanged', () => {
    const result = resolveCspPolicy(
      "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https:",
    );

    expect(result.valid).toBe(true);
    expect(result.policy).toContain("script-src 'self'");
    expect(result.issues).toEqual([]);
  });

  it('falls back to the default policy when required directives are missing', () => {
    const result = resolveCspPolicy("default-src 'self'; script-src 'self'");

    expect(result.valid).toBe(false);
    expect(result.policy).toBe(DEFAULT_CSP_POLICY);
    expect(result.issues).toContain('Missing required CSP directive: img-src');
  });

  it('falls back to the default policy when script-src contains unsafe-eval', () => {
    const result = resolveCspPolicy(
      "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self'",
    );

    expect(result.valid).toBe(false);
    expect(result.policy).toBe(DEFAULT_CSP_POLICY);
    expect(result.issues).toContain("Disallowed script-src token detected: 'unsafe-eval'");
  });
});
