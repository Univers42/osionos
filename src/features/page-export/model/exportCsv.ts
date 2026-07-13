/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   exportCsv.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// RFC-4180 CSV: quote a field when it holds a comma, quote, or newline;
// double inner quotes. CRLF row endings so spreadsheets open it untouched.

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function toCsv(columns: string[], rows: string[][]): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
