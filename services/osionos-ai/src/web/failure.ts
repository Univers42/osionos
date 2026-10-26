/**
 * The failures of the web tools: a fixed code, never the words of a server
 * (web C368). The code is all a log, a run event or the model ever sees; an
 * upstream body, an `error.message` or a `cause` is dropped where the failure
 * is made.
 */
export type WebFailureCode =
	| 'web_unreachable'
	| 'web_timeout'
	| 'web_too_large'
	| 'web_content_type'
	| 'web_redirect_refused'
	| 'web_robots_disallowed'
	| 'url_not_provided'
	| 'query_has_workspace_text'
	| 'web_rate_limited'
	| 'web_protocol';

export class WebFailure extends Error {
	readonly code: WebFailureCode;
	constructor(code: WebFailureCode) {
		super(code);
		this.name = 'web_failure';
		this.code = code;
	}
}
