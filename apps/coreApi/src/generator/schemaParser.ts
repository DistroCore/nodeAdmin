import { readFileSync } from 'node:fs';
import type { ParsedColumn, ParsedTable } from './types';

const AUTO_MANAGED_COLUMNS = new Set(['createdAt', 'id', 'updatedAt']);
const SEARCHABLE_COLUMNS = new Set(['code', 'email', 'label', 'name', 'slug', 'title']);
const TABLE_DECLARATION = /export\s+const\s+(\w+)\s*=\s*pgTable\s*\(/g;
const TYPE_MAP: Record<string, string> = {
  bigint: 'number',
  boolean: 'boolean',
  integer: 'number',
  text: 'string',
  timestamp: 'string',
  varchar: 'string',
};

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

function toCamelCase(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-\s]+/g, ' ')
    .trim()
    .toLowerCase();

  return normalized.replace(/ (\w)/g, (_, char: string) => char.toUpperCase());
}

function toPascalCase(value: string): string {
  const camel = toCamelCase(value);
  return capitalize(camel);
}

function pluralize(value: string): string {
  if (value.endsWith('s')) {
    return value;
  }

  if (value.endsWith('y') && !/[aeiou]y$/.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }

  return `${value}s`;
}

function extractBalancedBlock(source: string, startIndex: number): string {
  let depth = 0;
  let blockStart = -1;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      if (depth === 0) {
        blockStart = index + 1;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && blockStart >= 0) {
        return source.slice(blockStart, index);
      }
    }
  }

  return '';
}

function parseColumnDefinition(definition: string): ParsedColumn | null {
  const match = definition.match(/(\w+)\s*:\s*(\w+)\s*\(\s*'([^']+)'(?:\s*,\s*\{([^}]*)\})?\s*\)([\s\S]*)/);

  if (!match) {
    return null;
  }

  const [, propertyName, drizzleType, sqlName, optionsText = '', chainText = ''] = match;
  const lengthMatch = optionsText.match(/length\s*:\s*(\d+)/);

  const isPrimary = chainText.includes('.primaryKey()') || propertyName === 'id';
  const hasDefaultFn = chainText.includes('.$defaultFn(');
  const hasDefault = hasDefaultFn || chainText.includes('.default(') || chainText.includes('.defaultNow(');
  const isNullable = !chainText.includes('.notNull()');
  const isAutoManaged = AUTO_MANAGED_COLUMNS.has(propertyName) || (isPrimary && hasDefaultFn);

  return {
    drizzleType,
    hasDefault,
    hasDefaultFn,
    isAutoManaged,
    isNullable,
    isPrimary,
    length: lengthMatch ? Number(lengthMatch[1]) : undefined,
    propertyName,
    sqlName,
    tsType: TYPE_MAP[drizzleType] ?? 'string',
  };
}

function parseColumns(block: string): ParsedColumn[] {
  const columns: ParsedColumn[] = [];
  const lines = block.split('\n');
  let current = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) {
      continue;
    }

    current += current ? ` ${line}` : line;

    if (!/\),?\s*$/.test(line) && !/\)\s*,\s*$/.test(line)) {
      continue;
    }

    const parsed = parseColumnDefinition(current.replace(/,$/, ''));
    if (parsed) {
      columns.push(parsed);
    }
    current = '';
  }

  if (current) {
    const parsed = parseColumnDefinition(current.replace(/,$/, ''));
    if (parsed) {
      columns.push(parsed);
    }
  }

  return columns;
}

export function parseSchema(schemaPath: string): Map<string, ParsedTable> {
  const source = readFileSync(schemaPath, 'utf8');
  const tables = new Map<string, ParsedTable>();
  let match: RegExpExecArray | null;

  TABLE_DECLARATION.lastIndex = 0;
  while ((match = TABLE_DECLARATION.exec(source)) !== null) {
    const exportName = match[1];
    const tableStart = match.index + match[0].length;
    const remainder = source.slice(tableStart);
    const sqlNameMatch = remainder.match(/^\s*'([^']+)'/);
    const blockStart = source.indexOf('{', tableStart);

    if (blockStart < 0) {
      continue;
    }

    const columns = parseColumns(extractBalancedBlock(source, blockStart));
    const primaryColumn = columns.find((column) => column.isPrimary)?.propertyName ?? 'id';

    tables.set(exportName, {
      columns,
      exportName,
      hasTenantId: columns.some((column) => column.propertyName === 'tenantId'),
      primaryColumnName: primaryColumn,
      searchableColumns: columns
        .map((column) => column.propertyName)
        .filter((column) => SEARCHABLE_COLUMNS.has(column)),
      sqlTableName: sqlNameMatch?.[1] ?? exportName,
    });
  }

  return tables;
}

export function resolveTable(parsedTables: Map<string, ParsedTable>, entityInput: string): ParsedTable {
  const singularCamel = toCamelCase(entityInput);
  const pluralCamel = pluralize(singularCamel);
  const singularPascal = toPascalCase(entityInput);
  const candidates = [entityInput, singularCamel, pluralCamel, singularPascal, pluralCamel.toLowerCase()];

  for (const candidate of candidates) {
    const table = parsedTables.get(candidate);
    if (table) {
      return table;
    }
  }

  for (const table of parsedTables.values()) {
    if (table.exportName.toLowerCase() === pluralCamel.toLowerCase()) {
      return table;
    }
  }

  return createFallbackTable(entityInput);
}

export function createFallbackTable(entityInput: string): ParsedTable {
  const singularCamel = toCamelCase(entityInput);
  const pluralCamel = pluralize(singularCamel);
  const sqlTableName = pluralize(toSnakeCase(entityInput));

  return {
    columns: [
      {
        drizzleType: 'varchar',
        hasDefault: true,
        hasDefaultFn: true,
        isAutoManaged: true,
        isNullable: false,
        isPrimary: true,
        length: 128,
        propertyName: 'id',
        sqlName: 'id',
        tsType: 'string',
      },
      {
        drizzleType: 'varchar',
        hasDefault: false,
        hasDefaultFn: false,
        isAutoManaged: false,
        isNullable: false,
        isPrimary: false,
        length: 128,
        propertyName: 'tenantId',
        sqlName: 'tenant_id',
        tsType: 'string',
      },
      {
        drizzleType: 'varchar',
        hasDefault: false,
        hasDefaultFn: false,
        isAutoManaged: false,
        isNullable: false,
        isPrimary: false,
        length: 200,
        propertyName: 'name',
        sqlName: 'name',
        tsType: 'string',
      },
      {
        drizzleType: 'timestamp',
        hasDefault: true,
        hasDefaultFn: false,
        isAutoManaged: true,
        isNullable: false,
        isPrimary: false,
        propertyName: 'createdAt',
        sqlName: 'created_at',
        tsType: 'string',
      },
      {
        drizzleType: 'timestamp',
        hasDefault: true,
        hasDefaultFn: false,
        isAutoManaged: true,
        isNullable: false,
        isPrimary: false,
        propertyName: 'updatedAt',
        sqlName: 'updated_at',
        tsType: 'string',
      },
    ],
    exportName: pluralCamel,
    hasTenantId: true,
    primaryColumnName: 'id',
    searchableColumns: ['name'],
    sqlTableName,
  };
}
