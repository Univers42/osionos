import { useCallback, useState } from "react";
import { AiError, isAiConfigured } from "@/features/ai/api/aiClient";
import { describeImage } from "@/features/ai/api/mediaDescribe";
import {
  canShowDescribe,
  describeErrorMessage,
  isDescribeOff,
  isFeatureOff,
  markDescribeOff,
  mergeDescription,
} from "@/features/ai/model/imageDescription";
import { API_BASE } from "@/shared/api/client";
import { mediaPathOfAsset } from "@/features/chat/model/assistantHandoff";
import type { Block } from "@/entities/block";
import { usePageStore } from "@/store/usePageStore";

export interface DescribeImageState {
  /** Hidden for links, when the service is not configured, or once known off. */
  available: boolean;
  running: boolean;
  error: string | null;
  /** The caption offered when the block already has alt text of the user's. */
  suggestion: string | null;
  run: () => void;
  replaceAlt: () => void;
  keepMine: () => void;
}

/** Runs "Describe with AI" and writes the answer in ONE `updateBlock` call. */
export function useDescribeImage(pageId: string, block: Block): DescribeImageState {
  const updateBlock = usePageStore((s) => s.updateBlock);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [, bump] = useState(0);
  const path = mediaPathOfAsset(block.asset, API_BASE);

  const run = useCallback(() => {
    if (!path || running) return;
    setRunning(true);
    setError(null);
    setSuggestion(null);
    describeImage(path)
      .then((description) => {
        const merge = mergeDescription(block, description);
        if (Object.keys(merge.updates).length > 0) updateBlock(pageId, block.id, merge.updates);
        setSuggestion(merge.altSuggestion);
      })
      .catch((e: unknown) => {
        const failure = e instanceof AiError
          ? { status: e.status, code: e.code, retryAfter: e.headers?.get("Retry-After") }
          : { status: 0, code: "network" };
        if (isFeatureOff(failure)) {
          markDescribeOff();
          bump((n) => n + 1);
          return;
        }
        setError(describeErrorMessage(failure));
      })
      .finally(() => setRunning(false));
  }, [block, pageId, path, running, updateBlock]);

  const replaceAlt = useCallback(() => {
    if (suggestion) updateBlock(pageId, block.id, { mediaAlt: suggestion });
    setSuggestion(null);
  }, [block.id, pageId, suggestion, updateBlock]);

  return {
    available: isAiConfigured() && canShowDescribe(path, isDescribeOff()),
    running,
    error,
    suggestion,
    run,
    replaceAlt,
    keepMine: () => setSuggestion(null),
  };
}
