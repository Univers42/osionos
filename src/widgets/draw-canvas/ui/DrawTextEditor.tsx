/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DrawTextEditor.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The inline text-element editor: a transparent <textarea> positioned over the
 * canvas at the element's screen box. Each keystroke commits live through the
 * engine (which resizes the element to fit); blur/Escape ends editing. `fontSizePx`
 * is the world font scaled by the current zoom so the overlay matches the render.
 */

import { useEffect, useRef, useState } from "react";
import type { DrawEngine, TextEditRequest } from "@osionos/draw-engine";

interface Props {
  engine: DrawEngine;
  request: TextEditRequest;
  fontSizePx: number;
  onDone: () => void;
}

export function DrawTextEditor({ engine, request, fontSizePx, onDone }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(request.text);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      aria-label="Text editor"
      spellCheck={false}
      onChange={(event) => {
        setValue(event.target.value);
        engine.setElementText(request.id, event.target.value);
      }}
      onBlur={() => {
        // Commit the final value (empty → the engine discards the element).
        engine.setElementText(request.id, value);
        onDone();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") event.currentTarget.blur();
      }}
      style={{
        position: "absolute",
        left: request.x,
        top: request.y,
        minWidth: 40,
        minHeight: fontSizePx * 1.3,
        padding: 0,
        margin: 0,
        border: "1px dashed var(--osio-accent)",
        outline: "none",
        resize: "none",
        overflow: "hidden",
        background: "transparent",
        color: request.color,
        fontFamily: "sans-serif",
        fontSize: fontSizePx,
        lineHeight: 1.25,
        whiteSpace: "pre",
      }}
    />
  );
}
