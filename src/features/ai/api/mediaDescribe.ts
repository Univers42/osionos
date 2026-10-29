/**
 * Client of `POST /media/describe` — rides the shared AI transport (bearer,
 * base URL, refusal envelope). Failures are `AiError`; turn them into text
 * with `describeErrorMessage` (model/imageDescription.ts).
 */

import { requestJson } from "./aiClient";
import { type ImageDescription, normaliseImageDescription } from "../model/imageDescription";

/** `path` is the media capability path of the uploaded image. */
export async function describeImage(path: string): Promise<ImageDescription> {
  const body = await requestJson<Record<string, unknown>>("POST", "/media/describe", { path });
  return normaliseImageDescription(body);
}
