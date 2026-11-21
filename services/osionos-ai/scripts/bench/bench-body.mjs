// The request body of the LLM benchmark.
//
// The spike body is llama.cpp-shaped (cache_prompt, tools). A remote provider
// may reject unknown fields with a 4xx, which would record 0% success for a
// model that works: cache_prompt goes only to a local target, and --plain drops
// the tools, so the rank run sends a plain chat body.
// stream_options.include_usage stays: it is the OpenAI field the service itself
// sends, and the only source of tok/s on a server with no llama.cpp timings.
//
// Caveat: a plain body measures plain chat; a model slow only at tool calling is
// not caught by the rank run.

export function buildBody({ model, request, maxTokens, remote, plain }) {
	const body = {
		model,
		messages: request.messages,
		stream: true,
		stream_options: { include_usage: true },
		max_tokens: maxTokens,
		temperature: 0,
	};
	if (!plain) {
		body.tools = request.tools;
		body.tool_choice = 'auto';
	}
	if (!remote) body.cache_prompt = true;
	return body;
}
