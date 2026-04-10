import { Module, type DynamicModule } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './appModule';
import { PluginLoaderModule } from '../modules/plugin/pluginLoaderModule';

@Module({})
class MockPluginLoaderModule {}

describe('AppModule.forRootAsync', () => {
  let pluginLoaderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pluginLoaderSpy = vi
      .spyOn(PluginLoaderModule, 'forRootAsync')
      .mockResolvedValue({ module: MockPluginLoaderModule } as DynamicModule);
  });

  it('injects the plugin loader dynamic module into root imports before bootstrap', async () => {
    const registry = {
      getPluginModule: vi.fn(),
      scanInstalledPlugins: vi.fn().mockResolvedValue([]),
    };

    const dynamicModule = await AppModule.forRootAsync(registry as never);

    expect(pluginLoaderSpy).toHaveBeenCalledWith(registry);
    expect(dynamicModule.module).toBe(AppModule);
    expect(dynamicModule.imports).toEqual(expect.arrayContaining([{ module: MockPluginLoaderModule }]));
  });
});
