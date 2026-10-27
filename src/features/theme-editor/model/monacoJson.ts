/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   monacoJson.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The JSON language service for the theme editor. The IDE's Monaco is built
// without language services (ide/model/monacoRuntime.ts); this module adds
// JSON, its worker and the colour picker, and it is reached only from the theme
// editor's lazy chunk, so the IDE and the warm path never load it.

import "@/features/ide/model/monacoRuntime";

import type { Environment } from "monaco-editor/editor";
import "monaco-editor/features/colorPicker/register";
import JsonWorker from "monaco-editor/languages/features/json/json.worker?worker";
import { jsonDefaults, type DiagnosticsOptions } from "monaco-editor/languages/features/json/register";

type SchemaAssociation = NonNullable<DiagnosticsOptions["schemas"]>[number];

let workerReady = false;
/** One schema per open theme model, keyed by model URI, so one tab's schema never replaces another's. */
const schemas = new Map<string, SchemaAssociation>();

/** Routes the `json` worker label to the JSON worker; every other label keeps the runtime's base worker. Safe to call more than once. */
export function ensureJsonLanguage(): void {
  if (workerReady) return;
  workerReady = true;
  const runtime = globalThis as { MonacoEnvironment?: Environment };
  const previous = runtime.MonacoEnvironment;
  runtime.MonacoEnvironment = {
    ...previous,
    getWorker: (workerId, label) => {
      if (label === "json") return new JsonWorker();
      if (!previous?.getWorker) throw new Error(`No Monaco worker for "${label}"`);
      return previous.getWorker(workerId, label);
    },
  };
}

/** Validates and completes the model at `modelUri` against `schema`. Comments and trailing commas are errors, as the bridge's JSON parser refuses them. */
export function setJsonSchema(modelUri: string, schemaUri: string, schema: object): void {
  schemas.set(modelUri, { uri: schemaUri, fileMatch: [modelUri], schema });
  jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: false, enableSchemaRequest: false, schemas: [...schemas.values()] });
}
