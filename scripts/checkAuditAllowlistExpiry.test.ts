import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import checker from './checkAuditAllowlistExpiry.cjs';

const { inspectAllowlist, isValidCalendarDate, main } = checker as {
  inspectAllowlist: (
    content: string,
    now?: Date,
  ) => Array<{
    dateString: string | null;
    detail?: string;
    daysRemaining?: number;
    entries: string[];
    status: string;
  }>;
  isValidCalendarDate: (dateString: string) => boolean;
  main: (options?: {
    configPath?: string;
    io?: { error: ReturnType<typeof vi.fn>; log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
    now?: Date;
  }) => number;
};

const today = new Date('2026-07-10T12:00:00.000Z');

function createConfig(body: string): string {
  return `{
  "allowlist": [
${body}
  ]
}`;
}

describe('checkAuditAllowlistExpiry', () => {
  it('accepts the repository allowlist at its documented review dates', () => {
    const content = readFileSync(resolve(process.cwd(), 'audit-ci.jsonc'), 'utf8');

    expect(inspectAllowlist(content, today)).toEqual([]);
  });

  it('accepts a valid audit-ci config with no allowlist exceptions', () => {
    expect(inspectAllowlist('{ "high": true, "skip-dev": true }', today)).toEqual([]);
  });

  it('requires expiry metadata for each blank-line-delimited entry group', () => {
    const findings = inspectAllowlist(
      createConfig(`    // Expiry: 2026-12-01
    "GHSA-valid",

    // New risk without a review deadline
    "GHSA-missing",`),
      today,
    );

    expect(findings).toEqual([
      {
        entries: ['GHSA-missing'],
        dateString: null,
        status: 'missing',
      },
    ]);
  });

  it('fails dates due today, dates in the past, and impossible calendar dates', () => {
    const findings = inspectAllowlist(
      createConfig(`    // Expiry: 2026-07-10
    "GHSA-today",

    // Expiry: 2026-07-09
    "GHSA-yesterday",

    // Expiry: 2027-02-30
    "GHSA-invalid",`),
      today,
    );

    expect(findings.map(({ dateString, status }) => ({ dateString, status }))).toEqual([
      { dateString: '2026-07-10', status: 'expired' },
      { dateString: '2026-07-09', status: 'expired' },
      { dateString: '2027-02-30', status: 'invalid' },
    ]);
  });

  it('warns within fourteen days without failing the group', () => {
    expect(
      inspectAllowlist(
        createConfig(`    // Expiry: 2026-07-24
    "GHSA-review-soon",`),
        today,
      ),
    ).toEqual([
      {
        entries: ['GHSA-review-soon'],
        dateString: '2026-07-24',
        daysRemaining: 14,
        status: 'warn',
      },
    ]);
  });

  it('does not let an expiry comment outside the allowlist satisfy an entry', () => {
    const findings = inspectAllowlist(
      `// Expiry: 2026-12-01
${createConfig('    "GHSA-no-local-expiry",')}`,
      today,
    );

    expect(findings[0]).toMatchObject({ entries: ['GHSA-no-local-expiry'], status: 'missing' });
  });

  it('does not truncate the allowlist when comments contain brackets', () => {
    const findings = inspectAllowlist(
      createConfig(`    // Tracked in [SEC-123]; Expiry: 2026-12-01
    "GHSA-bracket-comment",`),
      today,
    );

    expect(findings).toEqual([]);
  });

  it('validates official object records and ignores inactive records', () => {
    const findings = inspectAllowlist(
      createConfig(`    {
      "GHSA-object-active": {
        "active": true,
        "notes": "Review before the deadline",
        "expiry": "2026-07-24"
      }
    },
    {
      "GHSA-object-inactive": {
        "active": false
      }
    },`),
      today,
    );

    expect(findings).toEqual([
      {
        entries: ['GHSA-object-active'],
        dateString: '2026-07-24',
        daysRemaining: 14,
        status: 'warn',
      },
    ]);
  });

  it('fails active object records with missing or invalid expiry metadata', () => {
    const findings = inspectAllowlist(
      createConfig(`    { "GHSA-object-missing": { "active": true } },
    { "GHSA-object-invalid": { "active": true, "expiry": "2027-02-30" } },
    { "GHSA-object-disabled": { "active": false, "expiry": "not-a-date" } },`),
      today,
    );

    expect(findings).toEqual([
      { entries: ['GHSA-object-missing'], dateString: null, status: 'missing' },
      { entries: ['GHSA-object-invalid'], dateString: '2027-02-30', status: 'invalid' },
    ]);
  });

  it('fails a comment group containing multiple expiry declarations', () => {
    const findings = inspectAllowlist(
      createConfig(`    // Expiry: 2026-12-01
    "GHSA-first-deadline",
    // Expiry: 2027-01-01
    "GHSA-second-deadline",`),
      today,
    );

    expect(findings).toEqual([
      {
        entries: ['GHSA-first-deadline', 'GHSA-second-deadline'],
        dateString: '2026-12-01, 2027-01-01',
        status: 'multiple',
      },
    ]);
  });

  it.each([
    ['unsupported primitive', '    42,'],
    ['multi-id object', '    { "GHSA-one": { "active": false }, "GHSA-two": { "active": false } },'],
    ['non-boolean active', '    { "GHSA-bad-active": { "active": "true", "expiry": "2027-01-01" } },'],
  ])('fails closed for an %s allowlist entry', (_label, body) => {
    const findings = inspectAllowlist(createConfig(body), today);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ status: 'malformed' });
  });

  it('fails closed for malformed JSONC instead of returning an empty finding list', () => {
    const findings = inspectAllowlist('{ "allowlist": [ /* unterminated', today);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ entries: [], status: 'malformed' });
  });

  it('strictly validates padded calendar dates', () => {
    expect(isValidCalendarDate('2026-02-28')).toBe(true);
    expect(isValidCalendarDate('2027-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-7-10')).toBe(false);
  });

  it('returns a failing exit code when the config file is missing', () => {
    const io = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    expect(main({ configPath: '/missing/audit-ci.jsonc', io, now: today })).toBe(1);
    expect(io.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('returns a failing exit code for an unrecognized allowlist entry', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'audit-expiry-test-'));
    const configPath = join(workspace, 'audit-ci.jsonc');
    const io = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    writeFileSync(configPath, createConfig('    true,'), 'utf8');

    try {
      expect(main({ configPath, io, now: today })).toBe(1);
      expect(io.error).toHaveBeenCalledWith(expect.stringContaining('INVALID config'));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});
