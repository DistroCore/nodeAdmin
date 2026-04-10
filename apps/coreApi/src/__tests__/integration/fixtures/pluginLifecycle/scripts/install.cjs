module.exports = async function onInstall(context) {
  await context.client.query(
    `UPDATE tenant_plugins
     SET config = jsonb_set(config, '{lifecycleInstalled}', 'true'::jsonb, true)
     WHERE tenant_id = $1 AND plugin_name = $2`,
    [context.tenantId, context.pluginId],
  );
};
