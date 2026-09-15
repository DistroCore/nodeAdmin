#!/usr/bin/env node
/**
 * Enforce review deadlines for every audit-ci allowlist group.
 *
 * An Expiry comment applies to the allowlist entries in the same blank-line-delimited
 * comment block. This supports one deadline for a documented batch while preventing a
 * new undocumented block from inheriting an unrelated earlier deadline.
 */

const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.resolve(__dirname, '..', 'audit-ci.jsonc');
const DAY_MS = 86_400_000;

function skipJsonString(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
    } else if (source[index] === '"') {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return source.length;
}

function sanitizeJsonc(content) {
  const chars = content.split('');
  if (chars[0] === '\uFEFF') chars[0] = ' ';

  let index = 0;
  while (index < chars.length) {
    if (chars[index] === '"') {
      index = skipJsonString(content, index);
      continue;
    }

    if (chars[index] === '/' && chars[index + 1] === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 2;
      while (index < chars.length && chars[index] !== '\n' && chars[index] !== '\r') {
        chars[index] = ' ';
        index += 1;
      }
      continue;
    }

    if (chars[index] === '/' && chars[index + 1] === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 2;
      let closed = false;
      while (index < chars.length) {
        if (chars[index] === '*' && chars[index + 1] === '/') {
          chars[index] = ' ';
          chars[index + 1] = ' ';
          index += 2;
          closed = true;
          break;
        }
        if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
        index += 1;
      }
      if (!closed) throw new Error('unterminated block comment');
      continue;
    }

    index += 1;
  }

  const sanitized = chars.join('');
  index = 0;
  while (index < chars.length) {
    if (chars[index] === '"') {
      index = skipJsonString(sanitized, index);
      continue;
    }
    if (chars[index] === ',') {
      let next = index + 1;
      while (next < chars.length && /\s/.test(chars[next])) next += 1;
      if (chars[next] === ']' || chars[next] === '}') chars[index] = ' ';
    }
    index += 1;
  }

  return chars.join('');
}

function skipWhitespace(source, start) {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function findMatchingArrayEnd(source, start) {
  let depth = 0;
  let index = start;
  while (index < source.length) {
    if (source[index] === '"') {
      index = skipJsonString(source, index);
      continue;
    }
    if (source[index] === '[') depth += 1;
    if (source[index] === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function locateRootAllowlistArray(source) {
  let index = skipWhitespace(source, 0);
  if (source[index] !== '{') return null;

  let depth = 0;
  const matches = [];
  while (index < source.length) {
    if (source[index] === '"') {
      const end = skipJsonString(source, index);
      if (depth === 1) {
        const key = JSON.parse(source.slice(index, end));
        let next = skipWhitespace(source, end);
        if (key === 'allowlist' && source[next] === ':') {
          next = skipWhitespace(source, next + 1);
          matches.push(source[next] === '[' ? next : -1);
        }
      }
      index = end;
      continue;
    }
    if (source[index] === '{' || source[index] === '[') depth += 1;
    if (source[index] === '}' || source[index] === ']') depth -= 1;
    index += 1;
  }

  if (matches.length !== 1 || matches[0] < 0) return null;
  const end = findMatchingArrayEnd(source, matches[0]);
  return end < 0 ? null : { end, start: matches[0] };
}

function splitTopLevelElements(source, start, end) {
  const elements = [];
  let depth = 0;
  let segmentStart = start + 1;
  let index = segmentStart;

  function appendSegment(segmentEnd) {
    let valueStart = skipWhitespace(source, segmentStart);
    let valueEnd = segmentEnd;
    while (valueEnd > valueStart && /\s/.test(source[valueEnd - 1])) valueEnd -= 1;
    if (valueStart < valueEnd) elements.push({ end: valueEnd, start: valueStart });
  }

  while (index < end) {
    if (source[index] === '"') {
      index = skipJsonString(source, index);
      continue;
    }
    if (source[index] === '{' || source[index] === '[') depth += 1;
    if (source[index] === '}' || source[index] === ']') depth -= 1;
    if (source[index] === ',' && depth === 0) {
      appendSegment(index);
      segmentStart = index + 1;
    }
    index += 1;
  }
  appendSegment(end);
  return elements;
}

function parseAllowlistDocument(content) {
  try {
    const sanitized = sanitizeJsonc(content);
    const config = JSON.parse(sanitized);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('root config must be an object');
    }
    if (!Object.hasOwn(config, 'allowlist')) {
      return { elements: [], location: null, values: [] };
    }
    if (!Array.isArray(config.allowlist)) {
      throw new Error('root allowlist must be an array when present');
    }

    const location = locateRootAllowlistArray(sanitized);
    if (!location) throw new Error('exactly one root allowlist array is required');
    const elements = splitTopLevelElements(sanitized, location.start, location.end);
    if (elements.length !== config.allowlist.length) {
      throw new Error('could not enumerate every allowlist entry');
    }

    return { elements, location, values: config.allowlist };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function extractAllowlistBody(content) {
  const document = parseAllowlistDocument(content);
  if (document.error) return null;
  if (!document.location) return '';
  return content.slice(document.location.start + 1, document.location.end);
}

function isValidCalendarDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function extractComments(source) {
  const comments = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] === '"') {
      index = skipJsonString(source, index);
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '/') {
      const start = index + 2;
      index = start;
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
      comments.push(source.slice(start, index));
      continue;
    }
    if (source[index] === '/' && source[index + 1] === '*') {
      const start = index + 2;
      const end = source.indexOf('*/', start);
      if (end < 0) return [];
      comments.push(source.slice(start, end));
      index = end + 2;
      continue;
    }
    index += 1;
  }
  return comments;
}

function buildCommentGroups(content, start, end) {
  const body = content.slice(start, end);
  const groups = [];
  const separator = /\r?\n[\t ]*\r?\n/g;
  let groupStart = start;
  for (const match of body.matchAll(separator)) {
    groups.push({ end: start + match.index, start: groupStart });
    groupStart = start + match.index + match[0].length;
  }
  groups.push({ end, start: groupStart });
  return groups;
}

function findGroupIndex(groups, offset) {
  return groups.findIndex((group) => offset >= group.start && offset <= group.end);
}

function inspectCalendarExpiry(entries, dateString, today) {
  if (!isValidCalendarDate(dateString)) {
    return { entries, dateString, status: 'invalid' };
  }

  const expiry = new Date(`${dateString}T00:00:00Z`);
  const daysRemaining = Math.floor((expiry.getTime() - today.getTime()) / DAY_MS);
  if (daysRemaining <= 0) return { entries, dateString, daysRemaining, status: 'expired' };
  if (daysRemaining <= 14) return { entries, dateString, daysRemaining, status: 'warn' };
  return null;
}

function inspectObjectExpiry(entries, expiryValue, now) {
  const dateString = typeof expiryValue === 'string' ? expiryValue : String(expiryValue);
  if (
    (typeof expiryValue !== 'string' && typeof expiryValue !== 'number') ||
    (typeof expiryValue === 'string' && !expiryValue.trim()) ||
    (typeof expiryValue === 'number' && (!Number.isFinite(expiryValue) || expiryValue <= 0))
  ) {
    return { entries, dateString, status: 'invalid' };
  }

  const calendarPrefix = typeof expiryValue === 'string' ? expiryValue.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/) : null;
  if (calendarPrefix && !isValidCalendarDate(calendarPrefix[1])) {
    return { entries, dateString, status: 'invalid' };
  }

  const expiry = new Date(expiryValue);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= 0) {
    return { entries, dateString, status: 'invalid' };
  }

  if (calendarPrefix && calendarPrefix[0] === calendarPrefix[1]) {
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    return inspectCalendarExpiry(entries, calendarPrefix[1], today);
  }

  const millisecondsRemaining = expiry.getTime() - now.getTime();
  const daysRemaining = Math.ceil(millisecondsRemaining / DAY_MS);
  if (millisecondsRemaining <= 0) return { entries, dateString, daysRemaining, status: 'expired' };
  if (daysRemaining <= 14) return { entries, dateString, daysRemaining, status: 'warn' };
  return null;
}

function malformedFinding(entries, detail) {
  return { detail, entries, dateString: null, status: 'malformed' };
}

function inspectAllowlist(content, now = new Date()) {
  const document = parseAllowlistDocument(content);
  if (document.error) return [malformedFinding([], document.error)];
  if (!document.location) return [];

  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const findings = [];
  const groups = buildCommentGroups(content, document.location.start + 1, document.location.end);
  const stringEntriesByGroup = new Map();

  for (const [index, value] of document.values.entries()) {
    const element = document.elements[index];
    if (typeof value === 'string') {
      const groupIndex = findGroupIndex(groups, element.start);
      if (groupIndex < 0) {
        findings.push(malformedFinding([value], `could not associate allowlist[${index}] with a comment group`));
        continue;
      }
      const entries = stringEntriesByGroup.get(groupIndex) ?? [];
      entries.push(value);
      stringEntriesByGroup.set(groupIndex, entries);
      continue;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      findings.push(malformedFinding([`allowlist[${index}]`], 'entry must be a string or audit-ci object record'));
      continue;
    }

    const recordIds = Object.keys(value);
    if (recordIds.length !== 1 || !recordIds[0]) {
      findings.push(malformedFinding([`allowlist[${index}]`], 'object record must contain exactly one non-empty id'));
      continue;
    }

    const entryId = recordIds[0];
    const record = value[entryId];
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.active !== 'boolean') {
      findings.push(malformedFinding([entryId], 'object record must contain a boolean active field'));
      continue;
    }
    if (!record.active) continue;
    if (!Object.hasOwn(record, 'expiry')) {
      findings.push({ entries: [entryId], dateString: null, status: 'missing' });
      continue;
    }

    const finding = inspectObjectExpiry([entryId], record.expiry, now);
    if (finding) findings.push(finding);
  }

  for (const [groupIndex, entries] of stringEntriesByGroup) {
    const group = groups[groupIndex];
    const comments = extractComments(content.slice(group.start, group.end));
    const expiryMatches = comments.flatMap((comment) => [...comment.matchAll(/Expiry:\s*([^\s,)]+)/g)]);

    if (expiryMatches.length === 0) {
      findings.push({ entries, dateString: null, status: 'missing' });
      continue;
    }
    if (expiryMatches.length > 1) {
      findings.push({
        entries,
        dateString: expiryMatches.map((match) => match[1]).join(', '),
        status: 'multiple',
      });
      continue;
    }

    const finding = inspectCalendarExpiry(entries, expiryMatches[0][1], today);
    if (finding) findings.push(finding);
  }

  return findings;
}

function main(options = {}) {
  const configPath = options.configPath ?? CONFIG_PATH;
  const io = options.io ?? console;
  const now = options.now ?? new Date();

  if (!fs.existsSync(configPath)) {
    io.error(`[audit-expiry] ${configPath} not found`);
    return 1;
  }

  const findings = inspectAllowlist(fs.readFileSync(configPath, 'utf8'), now);
  if (findings.length === 0) {
    io.log('[audit-expiry] all audit-ci.jsonc allowlist entries within review window');
    return 0;
  }

  let hasFailure = false;
  for (const finding of findings) {
    const entries = finding.entries.length > 0 ? ` (${finding.entries.join(', ')})` : '';
    if (finding.status === 'expired') {
      hasFailure = true;
      const timing = finding.daysRemaining === 0 ? 'due today' : `${-finding.daysRemaining} day(s) ago`;
      io.error(`[audit-expiry] EXPIRED ${finding.dateString} (${timing})${entries}`);
    } else if (finding.status === 'invalid') {
      hasFailure = true;
      io.error(`[audit-expiry] INVALID date: ${finding.dateString}${entries}`);
    } else if (finding.status === 'missing') {
      hasFailure = true;
      io.error(`[audit-expiry] MISSING Expiry metadata${entries}`);
    } else if (finding.status === 'multiple') {
      hasFailure = true;
      io.error(`[audit-expiry] MULTIPLE Expiry metadata: ${finding.dateString}${entries}`);
    } else if (finding.status === 'malformed') {
      hasFailure = true;
      io.error(`[audit-expiry] INVALID config: ${finding.detail ?? 'malformed allowlist'}${entries}`);
    } else if (finding.status === 'warn') {
      io.warn(`[audit-expiry] WARN ${finding.dateString} expires in ${finding.daysRemaining} day(s)${entries}`);
    } else {
      hasFailure = true;
      io.error(`[audit-expiry] INVALID finding status: ${finding.status}${entries}`);
    }
  }

  if (hasFailure) {
    io.error(
      '[audit-expiry] Allowlist entries at or past their review deadline, or missing valid expiry metadata, must be re-evaluated before CI can pass.',
    );
    return 1;
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  extractAllowlistBody,
  inspectAllowlist,
  isValidCalendarDate,
  main,
};
