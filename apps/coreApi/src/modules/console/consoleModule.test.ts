import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../../infrastructure/connectionRegistry';
import { DatabaseService } from '../../infrastructure/database/databaseService';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { ImModule } from '../im/imModule';
import { ConsoleModule } from './consoleModule';

function readModuleMetadata(moduleType: object, key: string): unknown[] {
  return (Reflect.getMetadata(key, moduleType) as unknown[] | undefined) ?? [];
}

describe('Console and IM infrastructure provider ownership', () => {
  it('owns shared state in InfrastructureModule instead of recreating it in feature modules', () => {
    const infrastructureProviders = readModuleMetadata(InfrastructureModule, MODULE_METADATA.PROVIDERS);
    const infrastructureExports = readModuleMetadata(InfrastructureModule, MODULE_METADATA.EXPORTS);
    const consoleImports = readModuleMetadata(ConsoleModule, MODULE_METADATA.IMPORTS);
    const consoleProviders = readModuleMetadata(ConsoleModule, MODULE_METADATA.PROVIDERS);
    const imImports = readModuleMetadata(ImModule, MODULE_METADATA.IMPORTS);
    const imProviders = readModuleMetadata(ImModule, MODULE_METADATA.PROVIDERS);

    expect(infrastructureProviders).toEqual(expect.arrayContaining([ConnectionRegistry, DatabaseService]));
    expect(infrastructureExports).toEqual(expect.arrayContaining([ConnectionRegistry, DatabaseService]));
    expect(consoleImports).toContain(InfrastructureModule);
    expect(imImports).toContain(InfrastructureModule);
    expect(consoleProviders).not.toContain(ConnectionRegistry);
    expect(consoleProviders).not.toContain(DatabaseService);
    expect(imProviders).not.toContain(ConnectionRegistry);
    expect(imProviders).not.toContain(DatabaseService);
  });
});
