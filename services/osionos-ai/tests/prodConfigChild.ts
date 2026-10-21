/**
 * The child of the "production" case.
 *
 * The service reads its configuration when it is imported, so the case needs
 * a process of its own: this one runs with NODE_ENV=production and with both
 * development escape hatches set, and prints what the configuration kept of
 * them.
 */

const { config } = await import('../src/config.ts');

process.stdout.write(
	`RESULT hosts=${JSON.stringify(config.devEndpointHosts)} urls=${JSON.stringify(config.devProviderBaseUrls)}\n`,
);
