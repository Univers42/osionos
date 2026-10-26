/**
 * The child of the C263 production case: with NODE_ENV=production and the
 * development hosts set, does the MCP URL check still let a private http
 * address through? It prints what it saw, one line.
 */

const { checkServerUrl } = await import('../src/mcpClient/validate.ts');

const seen: string[] = [];
for (const url of ['http://127.0.0.1:9/mcp', 'https://127.0.0.1/mcp', 'https://10.0.0.5/mcp']) {
	try {
		checkServerUrl(url);
		seen.push(`${url}=allowed`);
	} catch {
		seen.push(`${url}=refused`);
	}
}
process.stdout.write(`RESULT ${seen.join(' ')}\n`);
