/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   postWithProgress.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export interface UploadReply {
  status: number;
  text: string;
}

/**
 * POST a file and report the fraction of it sent so far, in [0, 1]. This is
 * XMLHttpRequest because fetch reports no upload progress. Any HTTP answer
 * resolves, so the caller reads the bridge's own message; only a request that
 * never completes rejects.
 */
export function postWithProgress(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
): Promise<UploadReply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("Upload failed: the network request did not complete."));
    xhr.send(body);
  });
}
