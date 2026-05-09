/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PlaygroundPageEditor.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 20:57:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback } from "react";

import { BlockEditor } from "@/features/block-editor";
import { BlockEditorSurface, type SurfaceBlockEditorProps } from "./BlockEditorSurface";

interface PlaygroundPageEditorProps {
  pageId: string;
  locked?: boolean;
}

/** Editable block-based page editor for osionos pages. */
export const PlaygroundPageEditor: React.FC<PlaygroundPageEditorProps> = ({
  pageId,
  locked = false,
}) => {
  const renderBlockEditor = useCallback(
    (props: SurfaceBlockEditorProps) => <BlockEditor {...props} />,
    [],
  );

  return (
    <BlockEditorSurface
      pageId={pageId}
      source={{ kind: "page", pageId }}
      locked={locked}
      renderBlockEditor={renderBlockEditor}
    />
  );
};