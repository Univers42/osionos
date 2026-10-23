/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SentimentPulseChart.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Pulse: the weekly totals of the sentiment of a workspace's comments, as a
 * stacked bar per week. A week with too few people is a gap, not a zero (C140);
 * the numbers are also a table a screen reader can read.
 */

import React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { pulseRows, type Pulse } from "@/features/ai/model/sentimentPulse";

const MUTED = "text-sm text-[var(--osio-fg-muted)]";
const TICK = { fontSize: 11, fill: "var(--osio-fg-subtle)" };
const cell = (value: number | null): string => (value === null ? "—" : String(value));

export const SentimentPulseChart: React.FC<{ pulse: Pulse }> = ({ pulse }) => {
  const rows = pulseRows(pulse.weeks);
  if (rows.length === 0) {
    return <p className={`mt-3 ${MUTED}`}>Nothing to show yet: a week appears once at least {pulse.minAuthors} people commented in it.</p>;
  }
  return (
    <figure className="m-0 mt-3">
      <figcaption className={MUTED}>Comments per week by tone. A week with fewer than {pulse.minAuthors} people is left out.</figcaption>
      <div aria-hidden="true" className="mt-2 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--osio-border-soft)" vertical={false} />
            <XAxis dataKey="weekStart" tick={TICK} />
            <YAxis allowDecimals={false} tick={TICK} width={36} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="negative" name="negative" stackId="tone" fill="var(--osio-danger)" />
            <Bar dataKey="neutral" name="neutral" stackId="tone" fill="var(--osio-fg-subtle)" />
            <Bar dataKey="positive" name="positive" stackId="tone" fill="var(--osio-accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Comment tone per week</caption>
        <thead><tr><th scope="col">Week of</th><th scope="col">Negative</th><th scope="col">Neutral</th><th scope="col">Positive</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.weekStart}>
              <td>{row.weekStart}</td><td>{cell(row.negative)}</td><td>{cell(row.neutral)}</td><td>{cell(row.positive)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
