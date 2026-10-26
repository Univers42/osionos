// The AI Hub's "Routing": the models a run moves on to when the chosen one cannot answer
// (rate limit, upstream error). The chain is a device preference, sent with every run.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { isAiConfigured, listConnections, listModels } from "@/features/ai/api/aiClient";
import type { AiConnection, AiModel } from "@/features/ai/api/aiContract";
import {
  MAX_AI_FALLBACKS,
  PLATFORM_CONNECTION_ID,
  defaultModelId,
  readAiFallbacks,
  readAiSelection,
  writeAiFallbacks,
  type AiFallbackChoice,
} from "@/features/ai/model/aiSelection";
import { Dropdown } from "@/shared/ui";
import { Section, SettingRow } from "@/features/settings/ui/settingsKit";

type ModelsByConnection = Record<string, AiModel[]>;

interface EditorProps {
  primary: AiFallbackChoice;
  connections: AiConnection[];
  models: ModelsByConnection;
  chain: AiFallbackChoice[];
  onChange: (index: number, next: AiFallbackChoice) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
}

const labelOf = (connections: AiConnection[], id: string) =>
  connections.find((connection) => connection.id === id)?.label ?? id;

/** C262: a chain from a private key to the platform sends the text to a provider the user did not pick. */
export const sendsToPlatform = (primary: AiFallbackChoice, chain: AiFallbackChoice[]) =>
  primary.connectionId !== PLATFORM_CONNECTION_ID && chain.some((entry) => entry.connectionId === PLATFORM_CONNECTION_ID);

/** The editor, with no data of its own: the section feeds it, the tests render it. */
export const RoutingEditor: React.FC<EditorProps> = ({ primary, connections, models, chain, onChange, onRemove, onAdd }) => (
  <div className="space-y-4" data-testid="routing-editor">
    <p className="text-sm text-[var(--osio-fg-muted)]">
      When the chosen model is busy or unavailable, the run moves on to the next model below, in order.
    </p>
    <Section title="Primary">
      <SettingRow
        title={`${labelOf(connections, primary.connectionId)} · ${primary.model || "default model"}`}
        description="Chosen in the composer, above the message box."
      />
    </Section>
    <Section title="Fallbacks">
      {chain.map((entry, index) => (
        <SettingRow
          key={`${entry.connectionId}-${index}`}
          title={`Fallback ${index + 1}`}
          action={
            <>
              <Dropdown
                label={`Fallback ${index + 1} connection`}
                variant="inline"
                width={180}
                value={entry.connectionId}
                options={connections.map((connection) => ({ value: connection.id, label: connection.label }))}
                onChange={(id) => onChange(index, { connectionId: id, model: defaultModelId(models[id] ?? []) })}
                placeholder="Connection"
              />
              <Dropdown
                label={`Fallback ${index + 1} model`}
                variant="inline"
                width={200}
                value={entry.model}
                options={(models[entry.connectionId] ?? []).map((model) => ({ value: model.id, label: model.label }))}
                onChange={(model) => onChange(index, { connectionId: entry.connectionId, model })}
                placeholder="Model"
              />
              <button type="button" className="text-sm text-[var(--osio-fg-muted)] hover:underline" onClick={() => onRemove(index)}>
                Remove
              </button>
            </>
          }
        />
      ))}
      <button
        type="button"
        disabled={chain.length >= MAX_AI_FALLBACKS}
        onClick={onAdd}
        className="mt-2 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-sm text-[var(--osio-fg-default)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add a fallback
      </button>
    </Section>
    {sendsToPlatform(primary, chain) ? (
      <p role="note" className="text-sm text-[var(--osio-fg-muted)]" data-testid="routing-privacy-note">
        If your model fails, this message goes to OpenRouter instead
      </p>
    ) : null}
  </div>
);

export const HubRoutingSection: React.FC = () => {
  const [connections, setConnections] = useState<AiConnection[]>([]);
  const [models, setModels] = useState<ModelsByConnection>({});
  const [primary] = useState<AiFallbackChoice>(() => {
    const stored = readAiSelection();
    return { connectionId: stored?.connectionId ?? PLATFORM_CONNECTION_ID, model: stored?.model ?? "" };
  });
  const [chain, setChain] = useState<AiFallbackChoice[]>(() => readAiFallbacks(undefined, primary));
  const configured = isAiConfigured();

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    void listConnections().then((list) => alive && setConnections(list)).catch(() => undefined);
    return () => { alive = false; };
  }, [configured]);

  // The models of every connection the chain or the primary names.
  const wanted = useMemo(
    () => Array.from(new Set([PLATFORM_CONNECTION_ID, primary.connectionId, ...chain.map((entry) => entry.connectionId)])),
    [primary.connectionId, chain],
  );
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    for (const id of wanted.filter((one) => !(one in models))) {
      void listModels(id).then((list) => alive && setModels((current) => ({ ...current, [id]: list }))).catch(() => undefined);
    }
    return () => { alive = false; };
  }, [configured, wanted, models]);

  const save = useCallback((next: AiFallbackChoice[]) => {
    writeAiFallbacks(next, undefined, primary);
    setChain(readAiFallbacks(undefined, primary));
  }, [primary]);

  if (!configured) {
    return <p className="text-sm text-[var(--osio-fg-muted)]">The AI service is not configured on this build</p>;
  }
  // A connection whose models have not loaded yet has no default model to save.
  const replaceAt = (index: number, next: AiFallbackChoice) => {
    const put = (entry: AiFallbackChoice) => save(chain.map((one, at) => (at === index ? entry : one)));
    if (next.model) return put(next);
    void listModels(next.connectionId)
      .then((list) => put({ ...next, model: defaultModelId(list) }))
      .catch(() => undefined);
  };
  const onAdd = () => {
    const taken = new Set([primary, ...chain].map((entry) => `${entry.connectionId}/${entry.model}`));
    const model = (models[PLATFORM_CONNECTION_ID] ?? []).find((one) => !taken.has(`${PLATFORM_CONNECTION_ID}/${one.id}`));
    if (model) save([...chain, { connectionId: PLATFORM_CONNECTION_ID, model: model.id }]);
  };
  return (
    <RoutingEditor
      primary={primary}
      connections={connections}
      models={models}
      chain={chain}
      onChange={replaceAt}
      onRemove={(index) => save(chain.filter((_entry, at) => at !== index))}
      onAdd={onAdd}
    />
  );
};
