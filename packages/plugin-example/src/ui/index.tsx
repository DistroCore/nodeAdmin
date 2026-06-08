import React from 'react';
import type { PluginComponentProps } from '@nodeadmin/shared-types';

// The shell injects `host` as a prop (apiClient / tenantId / hasPermission / toast / translate).
export default function ExamplePlugin({ host }: PluginComponentProps) {
  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Example Plugin</h1>
      <p>This is a minimal example plugin for the nodeAdmin plugin system.</p>
      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          background: '#f3f4f6',
          borderRadius: '0.5rem',
        }}
      >
        <p>
          <strong>Plugin ID:</strong> @nodeadmin/plugin-example
        </p>
        <p>
          <strong>Version:</strong> 1.0.0
        </p>
        <p>
          <strong>Tenant:</strong> {host.tenantId ?? 'unknown'}
        </p>
        <p>
          <strong>Can read:</strong> {host.hasPermission('example:read') ? 'yes' : 'no'}
        </p>
      </div>
    </div>
  );
}
