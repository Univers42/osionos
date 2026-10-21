import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The fixture of the catalog: a trimmed models.dev.
 *
 * There is one provider per case: an OpenAI-compatible one, Anthropic, Google,
 * one whose SDK the service does not speak, and one that is malformed. A model
 * of it is malformed too, and a model has no price.
 *
 * The base URL of the OpenAI-compatible provider is the mock of the tests, so
 * a connection of it is tested without leaving the machine.
 */
export function catalogFixture(apiBaseUrl: string): Record<string, unknown> {
	return {
		mockcompatible: {
			id: 'mockcompatible',
			name: 'Mock Compatible',
			doc: 'https://mock.example/docs',
			api: `${apiBaseUrl}/v1`,
			npm: '@ai-sdk/openai-compatible',
			models: {
				'mock-model': {
					id: 'mock-model',
					name: 'Mock Model',
					limit: { context: 128000, output: 8192 },
					cost: { input: 3, output: 15 },
				},
				'mock-free': { id: 'mock-free', name: 'Mock Free', limit: { context: 8192 } },
				'mock-broken': { id: 'mock-broken', name: 42 },
			},
		},
		anthropic: {
			id: 'anthropic',
			name: 'Anthropic',
			doc: 'https://docs.anthropic.com',
			npm: '@ai-sdk/anthropic',
			models: {
				'claude-mock': {
					id: 'claude-mock',
					name: 'Claude Mock',
					limit: { context: 200000 },
					cost: { input: 3, output: 15 },
				},
			},
		},
		google: {
			id: 'google',
			name: 'Google',
			npm: '@ai-sdk/google',
			models: {
				'gemini-mock': {
					id: 'gemini-mock',
					name: 'Gemini Mock',
					limit: { context: 1000000 },
					cost: { input: 0.3, output: 2.5 },
				},
			},
		},
		weird: {
			id: 'weird',
			name: 'Weird Cloud',
			api: 'https://api.weird.example/v1',
			npm: '@ai-sdk/weird',
			models: { 'weird-1': { id: 'weird-1', name: 'Weird 1' } },
		},
		broken: { id: 'broken', name: 42 },
	};
}

/** The server of the catalog: it answers the fixture to everything. */
export async function startCatalogServer(payload: unknown): Promise<{ url: string; close: () => Promise<void> }> {
	const server = createServer((_request: IncomingMessage, response: ServerResponse) => {
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(payload));
	});
	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', () => resolve());
	});
	const address = server.address();
	const port = address && typeof address === 'object' ? address.port : 0;
	return {
		url: `http://127.0.0.1:${port}/api.json`,
		close: async () => {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
				server.closeAllConnections?.();
			});
		},
	};
}
