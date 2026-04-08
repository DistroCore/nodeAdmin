import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePluginStore } from '@/stores/usePluginStore';
import { usePluginManagement } from '@/hooks/useMarketplace';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { NavIcon } from '@/app/layout/navIcon';

export function PluginSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const plugins = usePluginStore((s) => s.plugins);
  const plugin = plugins.find((p) => p.name === id);
  const { updateConfig } = usePluginManagement();

  const [config, setConfig] = useState<Record<string, unknown>>(() => plugin?.config ?? {});

  if (!plugin) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-4">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <NavIcon name="alert" />
        </div>
        <p className="text-destructive font-medium">Plugin not found.</p>
        <Button variant="outline" onClick={() => navigate('/plugins/installed')}>
          Back to list
        </Button>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateConfig.mutate({ id: plugin.name, config });
  };

  const handleFieldChange = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const hasChanges = JSON.stringify(config) !== JSON.stringify(plugin.config ?? {});

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M15 19l-7-7 7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            Back
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {plugin.manifest?.displayName || plugin.name} Settings
          </h1>
        </div>
      </div>

      <Card className="shadow-sm">
        <form onSubmit={handleSubmit}>
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>
              Configure the behavior and parameters for this plugin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {Object.entries(config).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-muted p-2">
                  <NavIcon name="gear" />
                </div>
                <p className="text-sm text-muted-foreground italic">
                  No configurable settings available for this plugin.
                </p>
              </div>
            ) : (
              Object.entries(config).map(([key, value]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key} className="text-sm font-semibold capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </Label>
                  {typeof value === 'boolean' ? (
                    <div className="rounded-md border p-3 transition-colors hover:bg-muted/20">
                      <Checkbox
                        id={key}
                        checked={value}
                        label={`Enable ${key
                          .replace(/([A-Z])/g, ' $1')
                          .trim()
                          .toLowerCase()}`}
                        onChange={(checked: boolean) => handleFieldChange(key, checked)}
                      />
                    </div>
                  ) : typeof value === 'number' ? (
                    <Input
                      id={key}
                      type="number"
                      value={value}
                      onChange={(e) => handleFieldChange(key, Number(e.target.value))}
                      className="max-w-52"
                    />
                  ) : (
                    <Input
                      id={key}
                      value={value as string}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                    />
                  )}
                </div>
              ))
            )}
          </CardContent>
          <CardFooter className="justify-end space-x-2 border-t bg-muted/10 pt-6">
            <Button variant="outline" type="button" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateConfig.isPending || !hasChanges}>
              {updateConfig.isPending && <Spinner className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
