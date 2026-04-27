#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const INDEX_PATH = path.join(DOCS_DIR, 'docIndex.md');
const ROADMAP_PATH = path.join(DOCS_DIR, 'delivery', 'roadmapPlan.md');
const TODO_PATH = path.join(DOCS_DIR, 'delivery', 'mvpTeamTodo.md');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let errors = 0;
let warnings = 0;

function walkMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function relativePath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function parseDate(text) {
  const isoMatch = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  const zhMatch = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  const match = isoMatch || zhMatch;
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function extractUpdatedInfo(content) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/(最近更新时间|Last updated)/i.test(lines[i])) continue;
    for (let j = i; j < Math.min(lines.length, i + 5); j += 1) {
      const date = parseDate(lines[j]);
      if (date) {
        return { lineNumber: j + 1, raw: lines[j].trim(), date };
      }
    }
    return { lineNumber: i + 1, raw: lines[i].trim(), date: null };
  }
  return null;
}

function warn(message) {
  warnings += 1;
  process.stdout.write(`${YELLOW}WARN${RESET} ${message}\n`);
}

function error(message) {
  errors += 1;
  process.stdout.write(`${RED}ERROR${RESET} ${message}\n`);
}

function pass(message) {
  process.stdout.write(`${GREEN}PASS${RESET} ${message}\n`);
}

function extractSection(content, pattern) {
  const match = content.match(pattern);
  return match ? match[0] : '';
}

function countUncheckedTasks(section) {
  return (section.match(/^\s*- \[(?: |-)\]/gm) || []).length;
}

function main() {
  process.stdout.write(`\n${BOLD}${CYAN}═══ Documentation Drift Check ═══${RESET}\n`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const markdownFiles = walkMarkdownFiles(DOCS_DIR);

  let staleCount = 0;
  for (const filePath of markdownFiles) {
    const rel = relativePath(filePath);
    const info = extractUpdatedInfo(fs.readFileSync(filePath, 'utf8'));
    if (!info || !info.date) continue;
    const maxAge = /docs\/(governance|architecture)\//.test(rel) ? 180 : 90;
    const age = diffDays(info.date, today);
    if (age > maxAge) {
      staleCount += 1;
      warn(`${rel}:${info.lineNumber} last updated ${age} day(s) ago (${info.raw})`);
    }
  }
  if (staleCount === 0) pass('No stale last-updated dates detected');

  const indexContent = fs.readFileSync(INDEX_PATH, 'utf8');
  const referenced = new Set([...indexContent.matchAll(/`(docs\/[\w./-]+\.md)`/g)].map((m) => m[1]));
  let missingRefs = 0;
  for (const ref of referenced) {
    if (!fs.existsSync(path.join(ROOT, ref))) {
      missingRefs += 1;
      error(`docs/docIndex.md references missing file: ${ref}`);
    }
  }
  if (missingRefs === 0) pass('All docs/docIndex.md references exist on disk');

  const indexedFiles = new Set(referenced);
  let unindexedCount = 0;
  for (const filePath of markdownFiles) {
    const rel = relativePath(filePath);
    if (rel === 'docs/docIndex.md') continue;
    if (!indexedFiles.has(rel)) {
      unindexedCount += 1;
      warn(`Markdown file not referenced in docs/docIndex.md: ${rel}`);
    }
  }
  if (unindexedCount === 0) pass('All markdown docs are referenced in docs/docIndex.md');

  const governanceFiles = markdownFiles.filter((file) => /docs\/governance\/[^/]+\.md$/.test(relativePath(file)));
  const architectureFiles = markdownFiles.filter((file) => /docs\/architecture\/[^/]+\.md$/.test(relativePath(file)));
  let missingSections = 0;
  for (const filePath of [...governanceFiles, ...architectureFiles]) {
    const rel = relativePath(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const hasSection = /docs\/governance\//.test(rel)
      ? /(最近更新时间|Last updated)/i.test(content)
      : /最近更新时间/.test(content);
    if (!hasSection) {
      missingSections += 1;
      error(`${rel} is missing a required 最近更新时间/Last updated section`);
    }
  }
  if (missingSections === 0) pass('Governance and architecture docs include required update sections');

  const roadmap = fs.readFileSync(ROADMAP_PATH, 'utf8');
  const todo = fs.readFileSync(TODO_PATH, 'utf8');
  const roadmapMilestones = {
    M1: /\|\s*\*\*M1[^|]+\|[^|]+\|\s*✅/.test(roadmap),
    M2: /\|\s*\*\*M2[^|]+\|[^|]+\|\s*✅/.test(roadmap),
    M3: /\|\s*\*\*M3[^|]+\|[^|]+\|\s*✅/.test(roadmap),
  };
  const todoSections = {
    'M1 / Phase 1': extractSection(todo, /^## Phase 1[\s\S]*?(?=^## Phase 2|$)/m),
    'M1 / Phase 2': extractSection(todo, /^## Phase 2[\s\S]*?(?=^## Phase 3|$)/m),
    'M2 / Phase 3': extractSection(todo, /^## Phase 3[\s\S]*?(?=^## Phase 4|$)/m),
    'M3 / Phase 4': extractSection(todo, /^## Phase 4[\s\S]*?(?=^## Phase 5|$)/m),
  };
  const checks = [
    ['M1', 'M1 / Phase 1'],
    ['M1', 'M1 / Phase 2'],
    ['M2', 'M2 / Phase 3'],
    ['M3', 'M3 / Phase 4'],
  ];
  let statusMismatches = 0;
  for (const [milestone, label] of checks) {
    if (!roadmapMilestones[milestone]) continue;
    const unchecked = countUncheckedTasks(todoSections[label]);
    if (unchecked > 0) {
      statusMismatches += 1;
      error(`${label} has ${unchecked} incomplete todo item(s) while roadmap marks ${milestone} complete`);
    }
  }
  if (statusMismatches === 0) pass('Roadmap milestone statuses align with MVP todo completion');

  process.stdout.write(
    `\n${BOLD}Summary${RESET} ${errors > 0 ? RED : GREEN}${errors} error(s)${RESET}, ${warnings > 0 ? YELLOW : GREEN}${warnings} warning(s)${RESET}\n`,
  );
  process.exit(errors > 0 ? 1 : 0);
}

main();
