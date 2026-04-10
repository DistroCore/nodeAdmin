import * as fs from 'node:fs';
import * as path from 'node:path';
import nunjucks from 'nunjucks';
import type { ParsedColumn, ParsedTable, GeneratorConfig, TemplateContext, FrontendPaths } from './types';
import { mapColumn, shouldExcludeFromCreateDto, shouldExcludeFromUpdateDto } from './columnMapper';

const BACKEND_TEMPLATES = [
  { template: 'module.njk', suffix: 'Module.ts' },
  { template: 'service.njk', suffix: 'Service.ts' },
  { template: 'controller.njk', suffix: 'Controller.ts' },
  {
    template: 'createDto.njk',
    suffix: 'Dto.ts',
    subdir: 'dto',
    prefix: 'create',
    extraName: 'Dto',
  },
  {
    template: 'updateDto.njk',
    suffix: 'Dto.ts',
    subdir: 'dto',
    prefix: 'update',
    extraName: 'Dto',
  },
  {
    template: 'listQueryDto.njk',
    suffix: 'QueryDto.ts',
    subdir: 'dto',
    prefix: 'list',
    extraName: 'sQueryDto',
  },
];

const FRONTEND_TEMPLATES = [
  { template: 'panel.njk', fileName: '{{ entityNameLower }}ControlPanel.tsx' },
  { template: 'formDialog.njk', fileName: '{{ entityNameLower }}FormDialog.tsx' },
];

const DISPLAY_EXCLUDED = new Set([
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'passwordHash',
  'passwordSalt',
  'configJson',
]);

function shouldExcludeFromDisplay(col: ParsedColumn): boolean {
  if (DISPLAY_EXCLUDED.has(col.propertyName)) return true;
  if (col.isAutoManaged) return true;
  return false;
}

function buildContext(config: GeneratorConfig, table: ParsedTable): TemplateContext {
  const createDtoColumns = table.columns.filter((c) => !shouldExcludeFromCreateDto(c));
  const displayColumns = table.columns.filter((c) => !shouldExcludeFromDisplay(c));
  const booleanColumns = displayColumns.filter((c) => c.drizzleType === 'boolean').map((c) => c.propertyName);

  return {
    entityName: config.entityName,
    entityNameLower: config.entityNameLower,
    tableName: config.tableName,
    sqlTableName: config.sqlTableName,
    hasTenantId: config.hasTenantId,
    searchableColumns: table.searchableColumns,
    allColumns: table.columns,
    createDtoColumns,
    updateDtoColumns: table.columns.filter((c) => !shouldExcludeFromUpdateDto(c)),
    primaryKeys: table.columns.filter((c) => c.isPrimary).map((c) => c.propertyName),
    displayColumns,
    booleanColumns,
    formColumns: createDtoColumns,
  };
}

export function generateModule(config: GeneratorConfig, table: ParsedTable, templateDir: string): Map<string, string> {
  const env = nunjucks.configure(templateDir, {
    autoescape: false,
    trimBlocks: true,
    lstripBlocks: true,
  });
  addCustomFilters(env);
  const ctx = buildContext(config, table);
  const results = new Map<string, string>();

  for (const t of BACKEND_TEMPLATES) {
    const content = env.render(t.template, {
      ...ctx,
      mapColumn,
      shouldExcludeFromCreateDto,
      shouldExcludeFromUpdateDto,
    });

    let fileName: string;
    if (t.subdir) {
      fileName = path.join(t.subdir, `${t.prefix}${config.entityName}${t.extraName!}.ts`);
    } else {
      fileName = `${config.entityNameLower}s${t.suffix}`;
    }

    results.set(fileName, content);
  }

  return results;
}

export function generateFrontend(
  config: GeneratorConfig,
  table: ParsedTable,
  templateDir: string,
): Map<string, string> {
  const env = nunjucks.configure(templateDir, {
    autoescape: false,
    trimBlocks: true,
    lstripBlocks: true,
  });
  addCustomFilters(env);
  const ctx = buildContext(config, table);
  const results = new Map<string, string>();

  for (const t of FRONTEND_TEMPLATES) {
    const content = env.render(t.template, {
      ...ctx,
      mapColumn,
      shouldExcludeFromCreateDto,
      shouldExcludeFromUpdateDto,
    });

    // Resolve template variables in fileName
    const fileName = t.fileName
      .replace('{{ entityName }}', config.entityName)
      .replace('{{ entityNameLower }}', config.entityNameLower);

    results.set(fileName, content);
  }

  return results;
}

export function writeFiles(
  config: GeneratorConfig,
  files: Map<string, string>,
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const [relPath, content] of files) {
    const fullPath = path.join(config.outputDir, config.entityNameLower + 's', relPath);

    if (fs.existsSync(fullPath) && !config.force) {
      skipped.push(fullPath);
      continue;
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    written.push(fullPath);
  }

  return { written, skipped };
}

export function writeFrontendFiles(
  config: GeneratorConfig,
  files: Map<string, string>,
  frontendPaths: FrontendPaths,
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];

  for (const [fileName, content] of files) {
    const fullPath = path.join(frontendPaths.businessDir, fileName);

    if (fs.existsSync(fullPath) && !config.force) {
      skipped.push(fullPath);
      continue;
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    written.push(fullPath);
  }

  return { written, skipped };
}

export function appendToAppModule(
  entityNameLower: string,
  _modulesDir: string,
  appModulePath: string,
  dryRun: boolean,
): string | null {
  const className = `${capitalize(entityNameLower)}sModule`;
  const importPath = `../modules/${entityNameLower}s/${entityNameLower}sModule`;

  let source = fs.readFileSync(appModulePath, 'utf-8');

  // Check if already registered
  if (source.includes(className)) {
    return null;
  }

  // Add import statement after existing module imports
  const importLine = `import { ${className} } from '${importPath}';\n`;
  const lastModuleImport = source.lastIndexOf("from '../modules/");
  if (lastModuleImport === -1) {
    const lastImport = source.lastIndexOf('\nimport ');
    const insertPos = source.indexOf('\n', lastImport) + 1;
    source = source.slice(0, insertPos) + importLine + source.slice(insertPos);
  } else {
    const lineEnd = source.indexOf('\n', lastModuleImport);
    source = source.slice(0, lineEnd + 1) + importLine + source.slice(lineEnd + 1);
  }

  // Add to imports array
  const importsMatch = source.match(/imports:\s*\[([\s\S]*?)\]/);
  if (importsMatch) {
    const importsContent = importsMatch[1];
    const newImports = importsContent.trimEnd() + `,\n    ${className},`;
    source = source.replace(importsMatch[0], `imports: [${newImports}\n  ]`);
  }

  if (!dryRun) {
    fs.writeFileSync(appModulePath, source, 'utf-8');
  }

  return importLine.trim();
}

/**
 * Generate i18n keys for the entity and append to en.json and zh.json.
 */
export function appendI18nKeys(
  entityNameLower: string,
  displayColumns: ParsedColumn[],
  formColumns: ParsedColumn[],
  i18nDir: string,
  dryRun: boolean,
): { en: string[]; zh: string[] } {
  const en = generateEnKeys(entityNameLower, displayColumns, formColumns);
  const zh = generateZhKeys(entityNameLower, displayColumns, formColumns);

  if (!dryRun) {
    appendKeysToFile(path.join(i18nDir, 'en.json'), en);
    appendKeysToFile(path.join(i18nDir, 'zh.json'), zh);
  }

  return { en, zh };
}

function generateEnKeys(entity: string, displayCols: ParsedColumn[], formCols: ParsedColumn[]): string[] {
  const keys = [
    `  "${entity}.title": "${capitalize(entity)} Management",`,
    `  "${entity}.desc": "Manage ${entity}s.",`,
    `  "${entity}.create": "Create ${capitalize(entity)}",`,
    `  "${entity}.edit": "Edit ${capitalize(entity)}",`,
    `  "${entity}.delete": "Delete",`,
    `  "${entity}.deleteConfirm": "Are you sure you want to delete this ${entity}? This action cannot be undone.",`,
    `  "${entity}.loadFailed": "Failed to load ${entity}s.",`,
    `  "${entity}.empty": "No ${entity}s found",`,
    `  "${entity}.saveSuccess": "${capitalize(entity)} saved successfully.",`,
    `  "${entity}.deleteSuccess": "${capitalize(entity)} deleted successfully.",`,
    `  "${entity}.deleteFailed": "Failed to delete ${entity}.",`,
    `  "${entity}.active": "Active",`,
    `  "${entity}.inactive": "Inactive",`,
    `  "${entity}.colActions": "Actions",`,
  ];

  for (const col of displayCols) {
    keys.push(`  "${entity}.col${capitalize(col.propertyName)}": "${capitalize(col.propertyName)}",`);
  }

  for (const col of formCols) {
    keys.push(`  "${entity}.field${capitalize(col.propertyName)}": "${capitalize(col.propertyName)}",`);
  }

  return keys;
}

function generateZhKeys(entity: string, displayCols: ParsedColumn[], formCols: ParsedColumn[]): string[] {
  const keys = [
    `  "${entity}.title": "${capitalize(entity)}管理",`,
    `  "${entity}.desc": "管理${entity}。",`,
    `  "${entity}.create": "新建${capitalize(entity)}",`,
    `  "${entity}.edit": "编辑${capitalize(entity)}",`,
    `  "${entity}.delete": "删除",`,
    `  "${entity}.deleteConfirm": "确定要删除该${entity}吗？此操作不可恢复。",`,
    `  "${entity}.loadFailed": "加载${entity}数据失败。",`,
    `  "${entity}.empty": "暂无${entity}",`,
    `  "${entity}.saveSuccess": "${capitalize(entity)}保存成功。",`,
    `  "${entity}.deleteSuccess": "${capitalize(entity)}删除成功。",`,
    `  "${entity}.deleteFailed": "删除${entity}失败。",`,
    `  "${entity}.active": "启用",`,
    `  "${entity}.inactive": "禁用",`,
    `  "${entity}.colActions": "操作",`,
  ];

  for (const col of displayCols) {
    keys.push(`  "${entity}.col${capitalize(col.propertyName)}": "${capitalize(col.propertyName)}",`);
  }

  for (const col of formCols) {
    keys.push(`  "${entity}.field${capitalize(col.propertyName)}": "${capitalize(col.propertyName)}",`);
  }

  return keys;
}

function appendKeysToFile(filePath: string, keys: string[]): void {
  let source = fs.readFileSync(filePath, 'utf-8');

  // Find the last key before closing brace and insert before it
  // JSON files end with "}\n" — insert keys before the closing brace
  const lastBrace = source.lastIndexOf('}');
  if (lastBrace === -1) return;

  const prefix = source.endsWith(',\n') ? '' : ',\n';
  const insertion = prefix + keys.join('\n') + '\n';
  source = source.slice(0, lastBrace) + insertion + source.slice(lastBrace);

  fs.writeFileSync(filePath, source, 'utf-8');
}

/**
 * Append a nav item to navConfig.ts.
 */
export function appendToNavConfig(entityNameLower: string, navConfigPath: string, dryRun: boolean): string | null {
  let source = fs.readFileSync(navConfigPath, 'utf-8');
  const navKey = entityNameLower;

  if (source.includes(`'${navKey}'`)) return null;

  const navEntry = `  {
    icon: 'box',
    key: '${navKey}',
    labelId: 'nav.${entityNameLower}s',
    path: '/${entityNameLower}s',
    permission: '${entityNameLower}:view',
  },`;

  // Insert before the closing ]; of navItems array
  const closingBracket = source.lastIndexOf('];');
  if (closingBracket === -1) return null;

  // Find the last entry (ends with },)
  const lastEntry = source.lastIndexOf('},', closingBracket);
  if (lastEntry === -1) return null;

  const insertPos = source.indexOf('\n', lastEntry) + 1;
  source = source.slice(0, insertPos) + navEntry + '\n' + source.slice(insertPos);

  if (!dryRun) {
    fs.writeFileSync(navConfigPath, source, 'utf-8');
  }

  return navEntry;
}

/**
 * Append a route to appRoot.tsx.
 */
export function appendToAppRoot(
  entityName: string,
  entityNameLower: string,
  appRootPath: string,
  dryRun: boolean,
): string | null {
  let source = fs.readFileSync(appRootPath, 'utf-8');
  const component = `${entityName}ControlPanel`;

  if (source.includes(component)) return null;

  // Add import
  const importLine = `import { ${component} } from '@/components/business/${entityNameLower}ControlPanel';\n`;
  const lastBusinessImport = source.lastIndexOf("from '@/components/business/");
  if (lastBusinessImport === -1) return null;
  const lineEnd = source.indexOf('\n', lastBusinessImport);
  source = source.slice(0, lineEnd + 1) + importLine + source.slice(lineEnd + 1);

  // Add route before the NotFound catch-all
  const routeBlock = `                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="${entityNameLower}:view">
                        <${component} />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/${entityNameLower}s"
                />
`;
  const notFoundPos = source.lastIndexOf('<Route element={<NotFoundPage />}');
  if (notFoundPos === -1) return null;

  source = source.slice(0, notFoundPos) + routeBlock + source.slice(notFoundPos);

  if (!dryRun) {
    fs.writeFileSync(appRootPath, source, 'utf-8');
  }

  return `Route: /${entityNameLower}s → ${component}`;
}

/**
 * Append an entity interface and permission to shared-types/src/index.ts.
 */
export function appendToSharedTypes(
  entityName: string,
  entityNameLower: string,
  table: ParsedTable,
  sharedTypesPath: string,
  dryRun: boolean,
): string | null {
  let source = fs.readFileSync(sharedTypesPath, 'utf-8');
  const interfaceName = `${entityName}Item`;

  if (source.includes(interfaceName)) return null;

  // Build the interface fields from columns
  const fields = table.columns
    .map((col) => {
      const tsType = col.drizzleType === 'boolean' ? 'number' : col.tsType;
      const nullable = col.isNullable ? ' | null' : '';
      return `  ${col.sqlName}: ${tsType}${nullable};`;
    })
    .join('\n');

  const interfaceBlock = `
export interface ${interfaceName} {
${fields}
}
`;

  // Add the interface before the last closing comment or at the end of the type union
  // Insert before the last line (or before PaginatedResponse if it exists)
  const paginatedPos = source.indexOf('export interface PaginatedResponse');
  if (paginatedPos !== -1) {
    source = source.slice(0, paginatedPos) + interfaceBlock + '\n' + source.slice(paginatedPos);
  } else {
    source += interfaceBlock;
  }

  // Add permission to AppPermission union
  const permissionLine = `  | '${entityNameLower}:manage'\n  | '${entityNameLower}:view'`;
  const permMarker = "  | 'users:view';";
  if (source.includes(permMarker)) {
    source = source.replace(permMarker, permMarker + '\n' + permissionLine + ';');
  }

  if (!dryRun) {
    fs.writeFileSync(sharedTypesPath, source, 'utf-8');
  }

  return `interface ${interfaceName} + permissions ${entityNameLower}:view/manage`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Register custom Nunjucks filters used in frontend templates.
 */
function addCustomFilters(env: nunjucks.Environment): void {
  // "pascal" filter: camelCase → PascalCase (only capitalizes first letter)
  // Unlike Nunjucks built-in "capitalize" which lowercases the rest.
  env.addFilter('pascal', (val: unknown) => {
    const s = String(val ?? '');
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
}
