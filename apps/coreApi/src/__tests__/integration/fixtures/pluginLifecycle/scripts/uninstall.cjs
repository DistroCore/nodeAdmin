const { writeFile } = require('node:fs/promises');

module.exports = async function onUninstall(context) {
  const markerPath = process.env.PLUGIN_LIFECYCLE_UNINSTALL_MARKER;

  if (!markerPath) {
    return;
  }

  await writeFile(
    markerPath,
    JSON.stringify(
      {
        pluginId: context.pluginId,
        tenantId: context.tenantId,
      },
      null,
      2
    ),
    'utf8'
  );
};
