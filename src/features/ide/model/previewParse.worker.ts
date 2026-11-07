/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   previewParse.worker.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/07 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/07 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The preview's parse, off the main thread: a pathological file costs this worker and its
// budget (previewParseQueue), never the text being typed beside it.
import { answerPreviewRequest, type PreviewRequest } from "./previewDocument";

self.onmessage = (event: MessageEvent<PreviewRequest>) => {
  answerPreviewRequest(event.data, (response) => self.postMessage(response));
};
