export interface ParsedColumn {
  drizzleType: string;
  hasDefault: boolean;
  hasDefaultFn: boolean;
  isAutoManaged: boolean;
  isNullable: boolean;
  isPrimary: boolean;
  length?: number;
  propertyName: string;
  sqlName: string;
  tsType: string;
}

export interface ParsedTable {
  columns: ParsedColumn[];
  exportName: string;
  hasTenantId: boolean;
  primaryColumnName: string;
  searchableColumns: string[];
  sqlTableName: string;
}

export interface TemplateField {
  decorators: string[];
  propertyName: string;
  required: boolean;
  tsType: string;
}

export interface CrudTemplateContext {
  createDtoClassTransformerImports: string[];
  createDtoFields: TemplateField[];
  createDtoSwaggerImports: string[];
  createDtoValidatorImports: string[];
  entityName: string;
  entityNameLower: string;
  hasTenantId: boolean;
  listSearchColumn?: string;
  moduleName: string;
  primaryColumnName: string;
  serviceClassName: string;
  sortColumnName: string;
  tableExportName: string;
  tableName: string;
  touchUpdatedAt: boolean;
  updateDtoClassTransformerImports: string[];
  updateDtoFields: TemplateField[];
  updateDtoSwaggerImports: string[];
  updateDtoValidatorImports: string[];
}

export interface GeneratedFile {
  content: string;
  relativePath: string;
}

export interface GenerateCrudOptions {
  dryRun: boolean;
  entity: string;
  force: boolean;
}
