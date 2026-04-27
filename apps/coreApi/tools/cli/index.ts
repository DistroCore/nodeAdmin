/**
 * CRUD module generator CLI.
 *
 * Usage: npm run generate:crud -- crud <EntityName> [--dry-run] [--force] [--no-register] [--backend-only] [--frontend-only]
 */
import * as path from 'node:path';
import { parseSchema, findTable } from '../generator/schemaParser';
import type { FrontendPaths } from '../generator/types';
import {
  generateModule,
  generateFrontend,
  writeFiles,
  writeFrontendFiles,
  appendToAppModule,
  appendI18nKeys,
  appendToNavConfig,
  appendToAppRoot,
  appendToSharedTypes,
} from '../generator/generator';
import { shouldExcludeFromCreateDto } from '../generator/columnMapper';

function resolvePaths() {
  // __dirname = .../apps/coreApi/tools/cli (via tsx)
  const toolsDir = path.resolve(__dirname, '..');
  const coreApiDir = path.resolve(toolsDir, '..');
  const srcDir = path.join(coreApiDir, 'src');
  const monorepoRoot = path.resolve(coreApiDir, '..', '..');
  const adminPortalDir = path.join(monorepoRoot, 'apps', 'adminPortal');
  const sharedTypesDir = path.join(monorepoRoot, 'packages', 'shared-types');

  return {
    schemaPath: path.join(srcDir, 'infrastructure', 'database', 'schema.ts'),
    templateDir: path.join(toolsDir, 'generator', 'templates'),
    modulesDir: path.join(srcDir, 'modules'),
    appModulePath: path.join(srcDir, 'app', 'appModule.ts'),
    frontendPaths: {
      businessDir: path.join(adminPortalDir, 'src', 'components', 'business'),
      i18nDir: path.join(adminPortalDir, 'src', 'i18n', 'locales'),
      navConfigPath: path.join(adminPortalDir, 'src', 'app', 'layout', 'navConfig.ts'),
      appRootPath: path.join(adminPortalDir, 'src', 'app', 'appRoot.tsx'),
      sharedTypesPath: path.join(sharedTypesDir, 'src', 'index.ts'),
    } satisfies FrontendPaths,
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') {
    console.log(`
Usage: npm run generate:crud -- crud <EntityName> [options]

Options:
  --dry-run         Preview generated files without writing
  --force           Overwrite existing files
  --no-register     Skip automatic appModule / navConfig / route registration
  --backend-only    Generate only backend code (NestJS module)
  --frontend-only   Generate only frontend code (React panel + form + i18n)

Examples:
  npm run generate:crud -- crud Product --dry-run
  npm run generate:crud -- crud Tenant --force
  npm run generate:crud -- crud Order --backend-only
  npm run generate:crud -- crud Product --frontend-only
`);
    process.exit(0);
  }

  const command = args[0];
  if (command !== 'crud') {
    console.error(`Unknown command: ${command}. Use 'crud'.`);
    process.exit(1);
  }

  const entityInput = args[1];
  if (!entityInput) {
    console.error('Entity name is required. Usage: generate:crud crud <EntityName>');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const noRegister = args.includes('--no-register');
  const backendOnly = args.includes('--backend-only');
  const frontendOnly = args.includes('--frontend-only');
  const generateBackend = !frontendOnly;
  const generateFrontendFlag = !backendOnly;

  const paths = resolvePaths();

  // Parse schema
  console.log(`Parsing schema from ${paths.schemaPath}...`);
  const tables = parseSchema(paths.schemaPath);

  // Resolve table
  const table = findTable(tables, entityInput);
  if (!table) {
    console.error(`Table not found: "${entityInput}"`);
    console.error(`Available tables: ${[...tables.keys()].join(', ')}`);
    process.exit(1);
  }

  // Build config
  const entityName = entityInput.charAt(0).toUpperCase() + entityInput.slice(1).toLowerCase();
  // Strip trailing 's' if user gave plural
  const singular = entityName.endsWith('s') ? entityName.slice(0, -1) : entityName;

  const config = {
    entityName: singular,
    entityNameLower: singular.toLowerCase(),
    tableName: table.exportName,
    sqlTableName: table.sqlTableName,
    hasTenantId: table.hasTenantId,
    dryRun,
    force,
    noRegister,
    outputDir: paths.modulesDir,
  };

  console.log(`Generating CRUD module for "${singular}" (table: ${table.exportName})...`);
  if (dryRun) console.log('[DRY RUN] No files will be written.\n');

  // ─── Backend ───────────────────────────────────────────────────────
  if (generateBackend) {
    console.log('--- Backend ---');
    const backendFiles = generateModule(config, table, paths.templateDir);

    if (dryRun) {
      for (const [relPath, content] of backendFiles) {
        console.log(`--- ${config.entityNameLower}s/${relPath} ---`);
        console.log(content);
        console.log('');
      }
    } else {
      const { written, skipped } = writeFiles(config, backendFiles);
      for (const f of written) console.log(`  Created: ${f}`);
      for (const f of skipped) console.log(`  Skipped (exists): ${f}`);
    }

    // Register in appModule
    if (!noRegister) {
      const result = appendToAppModule(config.entityNameLower, paths.modulesDir, paths.appModulePath, dryRun);
      if (result) {
        console.log(dryRun ? `  Would add: ${result}` : `  Registered: ${result}`);
      } else {
        console.log('  AppModule: already registered (skipped)');
      }
    }
  }

  // ─── Frontend ──────────────────────────────────────────────────────
  if (generateFrontendFlag) {
    console.log('\n--- Frontend ---');
    const frontendFiles = generateFrontend(config, table, paths.templateDir);

    if (dryRun) {
      for (const [fileName, content] of frontendFiles) {
        console.log(`--- ${fileName} ---`);
        console.log(content);
        console.log('');
      }
    } else {
      const { written, skipped } = writeFrontendFiles(config, frontendFiles, paths.frontendPaths);
      for (const f of written) console.log(`  Created: ${f}`);
      for (const f of skipped) console.log(`  Skipped (exists): ${f}`);
    }

    // i18n keys
    const displayColumns = table.columns.filter(
      (c) =>
        !['id', 'tenantId', 'createdAt', 'updatedAt', 'passwordHash', 'passwordSalt', 'configJson'].includes(
          c.propertyName,
        ) && !c.isAutoManaged,
    );
    const formColumns = table.columns.filter((c) => !shouldExcludeFromCreateDto(c));

    const i18nResult = appendI18nKeys(
      config.entityNameLower,
      displayColumns,
      formColumns,
      paths.frontendPaths.i18nDir,
      dryRun,
    );
    if (dryRun) {
      console.log('\n  i18n keys (en):');
      for (const k of i18nResult.en) console.log(`    ${k}`);
      console.log('  i18n keys (zh):');
      for (const k of i18nResult.zh) console.log(`    ${k}`);
    } else {
      console.log('  i18n keys appended to en.json and zh.json');
    }

    // Registration (navConfig + route + shared-types)
    if (!noRegister) {
      const navResult = appendToNavConfig(config.entityNameLower, paths.frontendPaths.navConfigPath, dryRun);
      if (navResult) {
        console.log(
          dryRun
            ? `  Would add to navConfig.ts: ${config.entityNameLower}`
            : `  navConfig.ts: added ${config.entityNameLower}`,
        );
      } else {
        console.log('  navConfig.ts: already registered (skipped)');
      }

      const routeResult = appendToAppRoot(
        config.entityName,
        config.entityNameLower,
        paths.frontendPaths.appRootPath,
        dryRun,
      );
      if (routeResult) {
        console.log(dryRun ? `  Would add route: /${config.entityNameLower}s` : `  appRoot.tsx: ${routeResult}`);
      } else {
        console.log('  appRoot.tsx: already registered (skipped)');
      }

      const typesResult = appendToSharedTypes(
        config.entityName,
        config.entityNameLower,
        table,
        paths.frontendPaths.sharedTypesPath,
        dryRun,
      );
      if (typesResult) {
        console.log(dryRun ? `  Would add: ${typesResult}` : `  shared-types: ${typesResult}`);
      } else {
        console.log('  shared-types: already registered (skipped)');
      }
    }
  }

  console.log(dryRun ? '\n[DRY RUN] Complete. No files were written.' : '\nDone!');
}

main();
