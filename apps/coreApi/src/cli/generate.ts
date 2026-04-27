import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import * as nunjucks from 'nunjucks';
import type { ArgumentsCamelCase, CommandModule } from 'yargs';
import {
  shouldIncludeInCreateDto,
  shouldIncludeInUpdateDto,
  toCreateDtoField,
  toUpdateDtoField,
} from '../generator/columnMapper';
import { parseSchema, resolveTable } from '../generator/schemaParser';
import type { CrudTemplateContext, GenerateCrudOptions, GeneratedFile, ParsedTable } from '../generator/types';

interface CrudCommandArgs {
  dryRun: boolean;
  entity: string;
  force: boolean;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  return capitalize(toCamelCase(value));
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

function resolvePaths() {
  const cliDir = __dirname;
  const srcDir = resolve(cliDir, '..');

  return {
    modulesDir: join(srcDir, 'modules'),
    schemaPath: join(srcDir, 'infrastructure', 'database', 'schema.ts'),
    templatesDir: join(srcDir, 'generator', 'templates'),
  };
}

function buildContext(entity: string, table: ParsedTable): CrudTemplateContext {
  const entityName = toPascalCase(entity);
  const entityNameLower = toCamelCase(entity);
  const moduleName = pluralize(entityNameLower);
  const createDtoFields = table.columns
    .filter((column) => shouldIncludeInCreateDto(column))
    .map((column) => toCreateDtoField(column));
  const updateDtoFields = table.columns
    .filter((column) => shouldIncludeInUpdateDto(column))
    .map((column) => toUpdateDtoField(column));

  const collectImports = (fields: typeof createDtoFields) => {
    const swaggerImports = new Set<string>();
    const validatorImports = new Set<string>();
    const classTransformerImports = new Set<string>();

    for (const field of fields) {
      swaggerImports.add(field.required ? 'ApiProperty' : 'ApiPropertyOptional');

      for (const decorator of field.decorators) {
        const match = decorator.match(/^@(\w+)/);
        if (!match) {
          continue;
        }

        const importName = match[1];
        if (importName === 'Type') {
          classTransformerImports.add(importName);
        } else {
          validatorImports.add(importName);
        }
      }
    }

    return {
      classTransformerImports: [...classTransformerImports].sort(),
      swaggerImports: [...swaggerImports].sort(),
      validatorImports: [...validatorImports].sort(),
    };
  };

  const createImports = collectImports(createDtoFields);
  const updateImports = collectImports(updateDtoFields);
  const sortColumnName = table.columns.some((column) => column.propertyName === 'createdAt')
    ? 'createdAt'
    : table.primaryColumnName;

  return {
    createDtoClassTransformerImports: createImports.classTransformerImports,
    createDtoFields,
    createDtoSwaggerImports: createImports.swaggerImports,
    createDtoValidatorImports: createImports.validatorImports,
    entityName,
    entityNameLower,
    hasTenantId: table.hasTenantId,
    listSearchColumn: table.searchableColumns[0],
    moduleName,
    primaryColumnName: table.primaryColumnName,
    serviceClassName: `${entityName}sService`,
    sortColumnName,
    tableExportName: table.exportName,
    tableName: table.sqlTableName,
    touchUpdatedAt: table.columns.some((column) => column.propertyName === 'updatedAt'),
    updateDtoClassTransformerImports: updateImports.classTransformerImports,
    updateDtoFields,
    updateDtoSwaggerImports: updateImports.swaggerImports,
    updateDtoValidatorImports: updateImports.validatorImports,
  };
}

function createEnvironment(templatesDir: string) {
  return nunjucks.configure(templatesDir, {
    autoescape: false,
    lstripBlocks: true,
    trimBlocks: true,
  });
}

function renderFiles(context: CrudTemplateContext, templatesDir: string): GeneratedFile[] {
  const env = createEnvironment(templatesDir);

  return [
    {
      content: env.render('module.template.njk', context),
      relativePath: `${context.moduleName}Module.ts`,
    },
    {
      content: env.render('service.template.njk', context),
      relativePath: `${context.moduleName}Service.ts`,
    },
    {
      content: env.render('controller.template.njk', context),
      relativePath: `${context.moduleName}Controller.ts`,
    },
    {
      content: env.render('create-dto.template.njk', context),
      relativePath: join('dto', `create${context.entityName}Dto.ts`),
    },
    {
      content: env.render('update-dto.template.njk', context),
      relativePath: join('dto', `update${context.entityName}Dto.ts`),
    },
  ];
}

function printDryRun(moduleDir: string, files: GeneratedFile[]): void {
  for (const file of files) {
    const fullPath = join(moduleDir, file.relativePath);
    process.stdout.write(`\n# ${fullPath}\n`);
    process.stdout.write(`${file.content}\n`);
  }
}

function writeFiles(moduleDir: string, files: GeneratedFile[], force: boolean): string[] {
  const writtenFiles: string[] = [];

  for (const file of files) {
    const fullPath = join(moduleDir, file.relativePath);

    if (existsSync(fullPath) && !force) {
      throw new Error(`Refusing to overwrite existing file without --force: ${fullPath}`);
    }

    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf8');
    writtenFiles.push(fullPath);
  }

  return writtenFiles;
}

function readSchemaPreview(schemaPath: string): string {
  const source = readFileSync(schemaPath, 'utf8');
  const tableCount = (source.match(/pgTable\s*\(/g) ?? []).length;
  return `Parsed schema.ts (${tableCount} pgTable definitions).`;
}

async function handleGenerate(args: ArgumentsCamelCase<CrudCommandArgs>): Promise<void> {
  const options: GenerateCrudOptions = {
    dryRun: Boolean(args.dryRun),
    entity: String(args.entity),
    force: Boolean(args.force),
  };
  const paths = resolvePaths();
  const parsedTables = parseSchema(paths.schemaPath);
  const table = resolveTable(parsedTables, options.entity);
  const context = buildContext(options.entity, table);
  const files = renderFiles(context, paths.templatesDir);
  const moduleDir = join(paths.modulesDir, context.moduleName);

  process.stdout.write(`${readSchemaPreview(paths.schemaPath)}\n`);
  if (!parsedTables.has(table.exportName)) {
    process.stdout.write(
      `No matching pgTable export found for "${options.entity}". Using fallback scaffold for ${context.moduleName}.\n`,
    );
  } else {
    process.stdout.write(
      `Matched entity "${options.entity}" to schema export "${table.exportName}" (${table.sqlTableName}).\n`,
    );
  }

  if (options.dryRun) {
    process.stdout.write(`[dry-run] Previewing generated files for ${context.entityName}.\n`);
    printDryRun(moduleDir, files);
    return;
  }

  const writtenFiles = writeFiles(moduleDir, files, options.force);
  process.stdout.write(`Generated ${writtenFiles.length} files in ${moduleDir}.\n`);
  for (const file of writtenFiles) {
    process.stdout.write(`- ${file}\n`);
  }
}

export const crudCommand: CommandModule<object, CrudCommandArgs> = {
  builder: (yargs: import('yargs').Argv<object>) =>
    (yargs as import('yargs').Argv<CrudCommandArgs>)
      .positional('entity', {
        demandOption: true,
        describe: 'Entity name, e.g. Product',
        type: 'string',
      })
      .option('dry-run', {
        default: false,
        describe: 'Preview generated files without writing them',
        type: 'boolean',
      })
      .option('force', {
        default: false,
        describe: 'Overwrite existing generated files',
        type: 'boolean',
      }),
  command: 'crud <entity>',
  describe: 'Generate NestJS + Drizzle CRUD scaffolding from schema.ts',
  handler: async (args) => {
    await handleGenerate(args);
  },
};
