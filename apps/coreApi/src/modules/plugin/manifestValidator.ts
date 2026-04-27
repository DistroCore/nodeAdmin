import type {
  PluginManifest,
  PluginManifestContributes,
  PluginManifestEntrypoints,
  PluginManifestLifecycle,
  PluginManifestMenuContribution,
} from '@nodeadmin/shared-types';

const PLUGIN_ID_PATTERN = /^@nodeadmin\/plugin-[a-z0-9-]+$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const SEMVER_RANGE_PATTERN = /^(?:\^|~|>=|<=|>|<)?\d+\.\d+\.\d+(?:\s+\|\|\s+(?:\^|~|>=|<=|>|<)?\d+\.\d+\.\d+)*$/;

export class ManifestValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(issues.join('; '));
    this.name = 'ManifestValidationError';
    this.issues = issues;
  }
}

export function validatePluginManifest(input: unknown): PluginManifest {
  const issues: string[] = [];

  if (!isRecord(input)) {
    throw new ManifestValidationError(['manifest must be an object']);
  }

  validateRequiredString(input, 'displayName', issues);
  validateRequiredString(input, 'description', issues);
  validatePluginId(input.id, 'id', issues);
  validateSemver(input.version, 'version', issues);
  validateAuthor(input.author, issues);
  validateEngines(input.engines, issues);
  validatePermissions(input.permissions, issues);
  validateDependencies(input.dependencies, issues);
  validateEntrypoints(input.entrypoints, issues);
  validateContributes(input.contributes, issues);
  validateLifecycle(input.lifecycle, issues);

  if (issues.length > 0) {
    throw new ManifestValidationError(issues);
  }

  return input as unknown as PluginManifest;
}

function validateAuthor(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('author is required');
    return;
  }

  validateRequiredString(value, 'name', issues, 'author.name');

  if (value.email !== undefined && !isNonEmptyString(value.email)) {
    issues.push('author.email must be a non-empty string when provided');
  }
}

function validateEngines(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('engines is required');
    return;
  }

  if (!isNonEmptyString(value.nodeAdmin)) {
    issues.push('engines.nodeAdmin is required');
    return;
  }

  if (!SEMVER_RANGE_PATTERN.test(value.nodeAdmin)) {
    issues.push('engines.nodeAdmin must be a valid SemVer range');
  }
}

function validatePermissions(value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push('permissions is required');
    return;
  }

  if (!value.every((item) => isNonEmptyString(item))) {
    issues.push('permissions must contain non-empty strings');
  }
}

function validateDependencies(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    issues.push('dependencies must be an array of strings');
    return;
  }

  if (!value.every((item) => PLUGIN_ID_PATTERN.test(item))) {
    issues.push('dependencies must contain plugin ids in the @nodeadmin/plugin-* namespace');
  }
}

function validateEntrypoints(value: unknown, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push('entrypoints is required');
    return;
  }

  validateRelativePath(value.server, 'entrypoints.server', issues, true);
  validateRelativePath(value.ui, 'entrypoints.ui', issues, false);
  validateRelativePath(value.settings, 'entrypoints.settings', issues, false);
}

function validateContributes(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push('contributes must be an object when provided');
    return;
  }

  validateMenuContributions(value.menus, issues);
  validateRouteContributions(value.routes, issues);
}

function validateMenuContributions(value: PluginManifestContributes['menus'] | unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push('contributes.menus must be an array when provided');
    return;
  }

  value.forEach((item, index) => validateMenuContribution(item, index, issues));
}

function validateMenuContribution(
  value: PluginManifestMenuContribution | unknown,
  index: number,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`contributes.menus[${index}] must be an object`);
    return;
  }

  validateRequiredString(value, 'name', issues, `contributes.menus[${index}].name`);

  if (value.icon !== undefined && !isNonEmptyString(value.icon)) {
    issues.push(`contributes.menus[${index}].icon must be a non-empty string when provided`);
  }

  if (!isNonEmptyString(value.route)) {
    issues.push(`contributes.menus[${index}].route is required`);
    return;
  }

  if (!value.route.startsWith('/')) {
    issues.push(`contributes.menus[${index}].route must start with /`);
  }
}

function validateRouteContributions(value: PluginManifestContributes['routes'] | unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    issues.push('contributes.routes must be an array of strings when provided');
    return;
  }

  value.forEach((item, index) => {
    if (!item.startsWith('/')) {
      issues.push(`contributes.routes[${index}] must start with /`);
    }
  });
}

function validateLifecycle(value: unknown, issues: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!isRecord(value)) {
    issues.push('lifecycle must be an object when provided');
    return;
  }

  validateRelativePath(value.onInstall, 'lifecycle.onInstall', issues, false);
  validateRelativePath(value.onUninstall, 'lifecycle.onUninstall', issues, false);
}

function validatePluginId(value: unknown, fieldName: string, issues: string[]): void {
  if (!isNonEmptyString(value)) {
    issues.push(`${fieldName} is required`);
    return;
  }

  if (!PLUGIN_ID_PATTERN.test(value)) {
    issues.push(`${fieldName} must match '@nodeadmin/plugin-*'`);
  }
}

function validateSemver(value: unknown, fieldName: string, issues: string[]): void {
  if (!isNonEmptyString(value)) {
    issues.push(`${fieldName} is required`);
    return;
  }

  if (!SEMVER_PATTERN.test(value)) {
    issues.push(`${fieldName} must be a valid SemVer`);
  }
}

function validateRequiredString(record: Record<string, unknown>, key: string, issues: string[], label = key): void {
  if (!isNonEmptyString(record[key])) {
    issues.push(`${label} is required`);
  }
}

function validateRelativePath(
  value:
    | PluginManifestEntrypoints[keyof PluginManifestEntrypoints]
    | PluginManifestLifecycle[keyof PluginManifestLifecycle]
    | unknown,
  label: string,
  issues: string[],
  required: boolean,
): void {
  if (value === undefined) {
    if (required) {
      issues.push(`${label} is required`);
    }
    return;
  }

  if (!isNonEmptyString(value)) {
    issues.push(`${label} must be a non-empty string`);
    return;
  }

  if (!value.startsWith('./')) {
    issues.push(`${label} must be a relative path starting with ./`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
