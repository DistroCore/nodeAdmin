import type { ParsedColumn, TemplateField } from './types';

function isDateType(column: ParsedColumn): boolean {
  return column.drizzleType === 'timestamp';
}

function isNumericType(column: ParsedColumn): boolean {
  return column.drizzleType === 'integer' || column.drizzleType === 'bigint';
}

function isBooleanType(column: ParsedColumn): boolean {
  return column.drizzleType === 'boolean';
}

function isStringType(column: ParsedColumn): boolean {
  return column.drizzleType === 'varchar' || column.drizzleType === 'text';
}

function buildBaseDecorators(column: ParsedColumn): string[] {
  const decorators: string[] = [];

  if (isStringType(column)) {
    decorators.push('@IsString()');
    if (column.drizzleType === 'varchar' && column.length) {
      decorators.push(`@MaxLength(${column.length})`);
    }
    return decorators;
  }

  if (isNumericType(column)) {
    decorators.push('@Type(() => Number)');
    decorators.push('@IsInt()');
    return decorators;
  }

  if (isBooleanType(column)) {
    decorators.push('@IsBoolean()');
    return decorators;
  }

  if (isDateType(column)) {
    decorators.push('@IsDateString()');
    return decorators;
  }

  decorators.push('@IsString()');
  return decorators;
}

export function shouldIncludeInCreateDto(column: ParsedColumn): boolean {
  if (column.isAutoManaged) {
    return false;
  }

  return column.propertyName !== 'createdAt' && column.propertyName !== 'updatedAt';
}

export function shouldIncludeInUpdateDto(column: ParsedColumn): boolean {
  if (!shouldIncludeInCreateDto(column)) {
    return false;
  }

  return column.propertyName !== 'tenantId';
}

export function toCreateDtoField(column: ParsedColumn): TemplateField {
  const required = !column.isNullable && !column.hasDefault;
  const decorators = [...buildBaseDecorators(column)];

  if (!required) {
    decorators.unshift('@IsOptional()');
  }

  return {
    decorators,
    propertyName: column.propertyName,
    required,
    tsType: column.tsType,
  };
}

export function toUpdateDtoField(column: ParsedColumn): TemplateField {
  return {
    decorators: ['@IsOptional()', ...buildBaseDecorators(column)],
    propertyName: column.propertyName,
    required: false,
    tsType: column.tsType,
  };
}
