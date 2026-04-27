import * as fs from 'node:fs';
import type { ParsedColumn, ParsedTable } from './types';

/**
 * Regex-based parser for Drizzle `pgTable()` definitions in schema.ts.
 * Extracts column names, types, and modifiers from the source text.
 */

const TABLE_DECL_REGEX = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(/g;
const DEFAULT_FN = /\.\$defaultFn\s*\(/;
const LENGTH_OPT = /length\s*:\s*(\d+)/;

/** Drizzle type → TypeScript type mapping */
const DRIZZLE_TO_TS: Record<string, string> = {
  varchar: 'string',
  text: 'string',
  boolean: 'boolean',
  integer: 'number',
  bigint: 'number',
  timestamp: 'Date',
};

/** Column names that are auto-managed (excluded from DTOs) */
const AUTO_MANAGED = new Set(['id', 'createdAt', 'updatedAt', 'passwordHash', 'passwordSalt']);

/** Column names suitable for ILIKE search */
const SEARCHABLE_NAMES = new Set(['name', 'title', 'email', 'slug', 'code', 'label']);

/**
 * Extract a balanced block of text between matching braces starting at `startPos`.
 * Returns the content between the outermost `{` and `}`.
 */
function extractBraceBlock(source: string, startPos: number): string {
  let depth = 0;
  let start = -1;
  for (let i = startPos; i < source.length; i++) {
    if (source[i] === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i);
      }
    }
  }
  return '';
}

/**
 * Parse all columns from a column definition block string.
 */
function parseColumns(block: string): ParsedColumn[] {
  const columns: ParsedColumn[] = [];
  // Match individual column definitions — may span multiple lines
  const lines = block.split('\n');
  let currentCol = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('*')) continue;

    currentCol += (currentCol ? ' ' : '') + line;

    // A column definition is complete when it ends with a comma or closing paren+comma
    // and contains a Drizzle type call
    if (/(?:\),?\s*$|\.\w+\([^)]*\)\s*,?\s*$)/.test(currentCol) && /\w+\s*:\s*\w+\s*\(/.test(currentCol)) {
      const col = parseSingleColumn(currentCol);
      if (col) columns.push(col);
      currentCol = '';
    }
  }

  // Handle last column (may not end with comma)
  if (currentCol && /\w+\s*:\s*\w+\s*\(/.test(currentCol)) {
    const col = parseSingleColumn(currentCol);
    if (col) columns.push(col);
  }

  return columns;
}

function parseSingleColumn(text: string): ParsedColumn | null {
  // Match: propertyName: drizzleType('sql_name', { options })
  const match = text.match(/(\w+)\s*:\s*(\w+)\s*\(\s*'([^']+)'(?:\s*,\s*\{([^}]*)\})?\s*\)(.*)/);
  if (!match) return null;

  const [, propertyName, drizzleType, sqlName, optionsStr, chainStr] = match;

  const tsType = DRIZZLE_TO_TS[drizzleType] ?? 'string';

  // Parse options
  const lengthMatch = optionsStr?.match(LENGTH_OPT);
  const length = lengthMatch ? parseInt(lengthMatch[1], 10) : undefined;

  // Parse chain modifiers
  const chain = chainStr ?? '';
  const isPrimary = chain.includes('.primaryKey()');
  const isNullable = !chain.includes('.notNull()');
  const hasDefault = chain.includes('.default(') || chain.includes('.defaultNow()');
  const hasDefaultFn = DEFAULT_FN.test(chain);
  const isUnique = chain.includes('.unique()') || chain.includes('uniqueIndex');

  const isAutoManaged = AUTO_MANAGED.has(propertyName) || (isPrimary && hasDefaultFn);

  return {
    propertyName,
    sqlName,
    drizzleType,
    tsType,
    length,
    isPrimary,
    isNullable,
    hasDefault,
    hasDefaultFn,
    isUnique,
    isAutoManaged,
  };
}

/**
 * Parse a Drizzle schema file and extract all table definitions.
 */
export function parseSchema(schemaFilePath: string): Map<string, ParsedTable> {
  const source = fs.readFileSync(schemaFilePath, 'utf-8');
  const tables = new Map<string, ParsedTable>();

  let match: RegExpExecArray | null;
  TABLE_DECL_REGEX.lastIndex = 0;

  while ((match = TABLE_DECL_REGEX.exec(source)) !== null) {
    const exportName = match[1];
    const startPos = match.index + match[0].length;

    // Extract SQL table name (first argument to pgTable)
    const restOfLine = source.slice(startPos);
    const sqlNameMatch = restOfLine.match(/^\s*'([^']+)'/);
    const sqlTableName = sqlNameMatch ? sqlNameMatch[1] : exportName;

    // Extract the column definition block (second argument to pgTable)
    const columnBlockStart = source.indexOf('{', startPos);
    if (columnBlockStart === -1) continue;

    const columnBlock = extractBraceBlock(source, columnBlockStart);
    const columns = parseColumns(columnBlock);

    const hasTenantId = columns.some((c) => c.propertyName === 'tenantId');
    const searchableColumns = columns
      .filter((c) => !c.isPrimary && !c.isAutoManaged && (c.drizzleType === 'varchar' || c.drizzleType === 'text'))
      .map((c) => c.propertyName)
      .filter((name) => SEARCHABLE_NAMES.has(name));

    tables.set(exportName, {
      exportName,
      sqlTableName,
      columns,
      hasTenantId,
      searchableColumns,
    });
  }

  return tables;
}

/**
 * Resolve a user-provided entity name to a matching table in the parsed schema.
 * Tries: exact match, lowercase match, pluralized, singularized.
 */
export function findTable(parsed: Map<string, ParsedTable>, input: string): ParsedTable | null {
  const lower = input.toLowerCase();

  // Exact match
  if (parsed.has(input)) return parsed.get(input)!;
  if (parsed.has(lower)) return parsed.get(lower)!;

  // Try plural
  const plural = lower + 's';
  if (parsed.has(plural)) return parsed.get(plural)!;

  // Try singular (strip trailing 's')
  if (lower.endsWith('s')) {
    const singular = lower.slice(0, -1);
    if (parsed.has(singular)) return parsed.get(singular)!;
  }

  // Case-insensitive scan
  for (const [key, table] of parsed) {
    if (key.toLowerCase() === lower || key.toLowerCase() === plural) {
      return table;
    }
  }

  return null;
}
