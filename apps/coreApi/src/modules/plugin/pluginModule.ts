import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../../infrastructure/infrastructureModule';
import { AdminPluginController } from './adminPluginController';
import { PluginAssetController } from './pluginAssetController';
import { PluginController } from './pluginController';
import { PluginAutoUpdateService } from './pluginAutoUpdateService';
import { PluginGuard } from './pluginGuard';
import { PluginMarketService } from './pluginMarketService';
import { PluginRegistryService } from './pluginRegistryService';
import { PluginService } from './pluginService';

@Module({
  imports: [InfrastructureModule],
  controllers: [PluginController, AdminPluginController, PluginAssetController],
  providers: [PluginService, PluginGuard, PluginMarketService, PluginRegistryService, PluginAutoUpdateService],
  exports: [PluginService, PluginGuard, PluginMarketService, PluginRegistryService, PluginAutoUpdateService],
})
export class PluginModule {}
