import type { ParsedColumn, TypeMapping } from './types';

const TYPE_MAP: Record<string, { tsType: string; validators: string[]; imports: string[]; extraImports: string[] }> = {
  varchar: {
    tsType: 'string',
    validators: ['@IsString()'],
    imports: ['IsString'],
    extraImports: [],
  },
  text: {
    tsType: 'string',
    validators: ['@IsString()'],
    imports: ['IsString'],
    extraImports: [],
  },
  boolean: {
    tsType: 'boolean',
    validators: [],
    imports: [],
    extraImports: [],
  },
  integer: {
    tsType: 'number',
    validators: ['@Type(() => Number)', '@IsInt()'],
    imports: ['IsInt'],
    extraImports: ['Type'],
  },
  bigint: {
    tsType: 'number',
    validators: ['@Type(() => Number)', '@IsInt()'],
    imports: ['IsInt'],
    extraImports: ['Type'],
  },
  timestamp: {
    tsType: 'string',
    validators: ['@IsDateString()'],
    imports: ['IsDateString'],
    extraImports: [],
  },
};

export function mapColumn(col: ParsedColumn): TypeMapping {
  const base = TYPE_MAP[col.drizzleType] ?? TYPE_MAP.varchar;
  const validators = [...base.validators];
  const imports = [...base.imports];
  const extraImports = [...base.extraImports];

  // Add MaxLength for varchar
  if (col.drizzleType === 'varchar' && col.length) {
    validators.push(`@MaxLength(${col.length})`);
    imports.push('MaxLength');
  }

  return {
    tsType: base.tsType,
    validators,
    imports,
    extraImports,
  };
}

export function shouldExcludeFromCreateDto(col: ParsedColumn): boolean {
  if (col.isAutoManaged) return true;
  if (col.isPrimary && col.hasDefaultFn) return true;
  if (['createdAt', 'updatedAt'].includes(col.propertyName)) return true;
  return false;
}

export function shouldExcludeFromUpdateDto(col: ParsedColumn): boolean {
  if (shouldExcludeFromCreateDto(col)) return true;
  if (col.propertyName === 'tenantId') return true; // immutable
  return false;
}
