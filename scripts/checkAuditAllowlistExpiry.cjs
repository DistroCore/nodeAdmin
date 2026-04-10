#!/usr/bin/env node
/**
 * Enforce that audit-ci.jsonc allowlist entries carry an un-expired
 * "Expiry: YYYY-MM-DD" comment. Every allowlisted advisory is a deliberate
 * acceptance of risk with a review deadline — letting the deadline slip
 * silently defeats the purpose of the allowlist.
 *
 * Exits non-zero with a clear error if any Expiry date in audit-ci.jsonc
 * is on or before today. Intended to run as a CI step before audit-ci.
 *
 * Parsing is intentionally comment-based (not JSON schema): audit-ci's
 * allowlist is a flat string array, so expiry metadata lives in //
 * comments immediately preceding the entries it applies to.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.resolve(__dirname, '..', 'audit-ci.jsonc');

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`[audit-expiry] ${CONFIG_PATH} not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(CONFIG_PATH, 'utf8');
  const expiryPattern = /Expiry:\s*(\d{4}-\d{2}-\d{2})/g;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const findings = [];
  for (const match of content.matchAll(expiryPattern)) {
    const dateString = match[1];
    const date = new Date(`${dateString}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      findings.push({ dateString, status: 'invalid' });
      continue;
    }
    const daysRemaining = Math.floor((date.getTime() - today.getTime()) / 86400000);
    if (daysRemaining < 0) {
      findings.push({ dateString, status: 'expired', daysRemaining });
    } else if (daysRemaining <= 14) {
      findings.push({ dateString, status: 'warn', daysRemaining });
    }
  }

  if (findings.length === 0) {
    console.log('[audit-expiry] all audit-ci.jsonc allowlist entries within review window');
    return;
  }

  let hasFailure = false;
  for (const finding of findings) {
    if (finding.status === 'expired') {
      hasFailure = true;
      console.error(`[audit-expiry] EXPIRED ${finding.dateString} (${-finding.daysRemaining} day(s) ago)`);
    } else if (finding.status === 'invalid') {
      hasFailure = true;
      console.error(`[audit-expiry] INVALID date: ${finding.dateString}`);
    } else {
      console.warn(`[audit-expiry] WARN ${finding.dateString} expires in ${finding.daysRemaining} day(s)`);
    }
  }

  if (hasFailure) {
    console.error(
      '[audit-expiry] Allowlist entries past their review deadline must be ' +
        're-evaluated (upstream fix? still accepted? extended with fresh ' +
        'justification?) before CI can pass.',
    );
    process.exit(1);
  }
}

main();
