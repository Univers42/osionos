/**
 * OpenRouter refuses a request its data policy forbids with a 404 whose
 * message, or body, names the policy. That is a refusal the caller must be
 * told about, not a missing model.
 */
export function isDataPolicyRefusal(error: unknown): boolean {
	const failure = error as { statusCode?: number; status?: number; responseBody?: string } | null;
	const status = failure?.statusCode ?? failure?.status;
	if (status !== 404) return false;
	const text = `${String(error ?? '')} ${failure?.responseBody ?? ''}`;
	return /data[ _-]?policy|data_collection|no endpoints found|free model training/i.test(text);
}
