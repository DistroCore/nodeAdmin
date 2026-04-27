import { useMemo, lazy, type ComponentType } from 'react';
import { logger } from '@/lib/logger';

export interface PluginLoaderResult {
  Component: ComponentType<Record<string, unknown>> | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to dynamically load a plugin's UI bundle via ESM dynamic import.
 * @param pluginId Unique identifier of the plugin
 * @param uiUrl Remote URL to the plugin's entrypoint (ESM bundle)
 */
export function usePluginLoader(pluginId: string, uiUrl?: string): PluginLoaderResult {
  const Component = useMemo(() => {
    if (!uiUrl) {
      return null;
    }

    // React.lazy requires a default export from the dynamic import.
    // The plugin bundle MUST 'export default function Plugin() { ... }'.
    return lazy(() => {
      return import(/* @vite-ignore */ uiUrl)
        .then((module) => {
          if (!module.default) {
            throw new Error(`Plugin "${pluginId}" at ${uiUrl} does not have a default export.`);
          }
          return { default: module.default };
        })
        .catch((err) => {
          logger.error('usePluginLoader', `Failed to load plugin "${pluginId}" from ${uiUrl}`, err);
          throw err;
        });
    });
  }, [pluginId, uiUrl]);

  return {
    Component,
    isLoading: false, // React.lazy handles loading internally via Suspense
    error: null, // Error boundaries should be used to catch loading errors
  };
}
