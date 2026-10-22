/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecsHealth.tsx                                     :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE RECS HEALTH — the chart an admin reads the recommender's quality in (M3):
 * the offline quality of every trained model over time, and the daily
 * click-through of what was served. The numbers come from the bridge's own
 * function, which holds AGGREGATES only: no user id and no item id ever
 * reaches this component. The parent gates the surface with the administrator
 * claim, and the server asks again on every call.
 *
 * EVERY CHART HAS ITS NUMBERS TWICE: once as a drawing, and once as a table a
 * screen reader can read — a chart nobody can hear is a chart nobody can check.
 */

import React, { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ApiError } from "@/shared/api/client";
import { fetchRecsHealth, type RecsHealth as Health } from "../api/recsHealthClient";
import { ctrSeries, modelSeries, type CtrPoint, type ModelPoint } from "../model/recsHealthSeries";

const CARD = "rounded-[var(--osio-radius-card)] border border-[var(--osio-border-soft)] bg-[var(--osio-bg-surface)] p-3";
const TITLE = "text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]";
const MUTED = "text-sm text-[var(--osio-fg-muted)]";
const ERROR = "mt-2 text-2xs text-[var(--osio-danger)]";
const TIP = "rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-2 text-xs";
const ACCENT = "var(--osio-accent)";
const SECOND = "var(--osio-fg-muted)";
const THIRD = "var(--osio-warning)";
const TICK = { fontSize: 11, fill: "var(--osio-fg-subtle)" };

/** The message of a failed call: the server's, when it gave one. */
const failure = (error: unknown): string => {
  if (error instanceof ApiError && error.status === 503) return "Recs health is unavailable";
  return error instanceof Error ? error.message : "The request failed.";
};

/** A number of a chart: three decimals, or a dash when there is none. */
const metric = (value: number | null): string => (value === null ? "—" : value.toFixed(3));

/** The day a model was trained, for the tooltip and for the table. */
const day = (value: string | null): string =>
  value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleDateString() : "—";

/** The section of the chart: its title, and what it holds. */
const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="mt-8">
    <h2 className={`flex items-center gap-2 ${TITLE}`}><Activity size={12} /> Recs health</h2>
    {children}
  </section>
);

/** What the tooltip of the quality chart says: the model, its date, its metrics. */
const QualityTip: React.FC<{ active?: boolean; payload?: { payload?: unknown }[] }> = ({ active, payload }) => {
  const point = payload?.[0]?.payload as ModelPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className={TIP}>
      <p className="font-medium">{point.label}</p>
      <p className="text-[var(--osio-fg-muted)]">{day(point.createdAt)}</p>
      <p>ndcg@10 {metric(point.ndcg10)} · recall@20 {metric(point.recall20)}</p>
      {point.isChampion ? <p className="text-[var(--osio-accent)]">champion</p> : null}
    </div>
  );
};

/** What the tooltip of the click-through chart says: the rate AND the counts. */
const CtrTip: React.FC<{ active?: boolean; payload?: { payload?: unknown }[] }> = ({ active, payload }) => {
  const point = payload?.[0]?.payload as CtrPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className={TIP}>
      <p className="font-medium">{point.day}</p>
      <p>real {metric(point.realCtr)} ({point.realClicks}/{point.realImpressions})</p>
      <p>synthetic {metric(point.syntheticCtr)} ({point.syntheticClicks}/{point.syntheticImpressions})</p>
    </div>
  );
};

/** The quality of every trained model, oldest first. The champion is marked. */
const QualityChart: React.FC<{ models: ModelPoint[] }> = ({ models }) => {
  const champion = models.find((model) => model.isChampion) ?? null;
  const marked = champion && champion.ndcg10 !== null ? { label: champion.label, value: champion.ndcg10 } : null;
  const recalled = champion && champion.recall20 !== null ? { label: champion.label, value: champion.recall20 } : null;
  return (
    <figure className="m-0">
      <figcaption className={MUTED}>The offline quality of every trained model, oldest first. The champion is marked.</figcaption>
      <div aria-hidden="true" className="mt-2 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={models} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--osio-border-soft)" vertical={false} />
            <XAxis dataKey="label" tick={TICK} />
            <YAxis domain={[0, 1]} tick={TICK} width={44} />
            <Tooltip content={<QualityTip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="ndcg10" name="ndcg@10" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="recall20" name="recall@20" stroke={SECOND} strokeWidth={2} dot={{ r: 3 }} />
            {marked ? <ReferenceDot x={marked.label} y={marked.value} r={5} fill={ACCENT} stroke="var(--osio-bg-surface)" /> : null}
            {recalled ? <ReferenceDot x={recalled.label} y={recalled.value} r={5} fill={SECOND} stroke="var(--osio-bg-surface)" /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Model quality over time</caption>
        <thead><tr><th scope="col">Model</th><th scope="col">Trained at</th><th scope="col">ndcg@10</th><th scope="col">recall@20</th><th scope="col">Champion</th></tr></thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id}>
              <td>{model.label}</td><td>{day(model.createdAt)}</td><td>{metric(model.ndcg10)}</td><td>{metric(model.recall20)}</td><td>{model.isChampion ? "yes" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

/** The daily click-through: the real and the synthetic, as two lines. */
const CtrChart: React.FC<{ days: CtrPoint[] }> = ({ days }) => (
  <figure className="m-0">
    <figcaption className={MUTED}>The daily click-through of what was served, the real and the synthetic apart.</figcaption>
    <div aria-hidden="true" className="mt-2 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={days} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--osio-border-soft)" vertical={false} />
          <XAxis dataKey="day" tick={TICK} />
          <YAxis domain={[0, "auto"]} tick={TICK} width={44} />
          <Tooltip content={<CtrTip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="realCtr" name="real" stroke={ACCENT} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="syntheticCtr" name="synthetic" stroke={THIRD} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <table className="sr-only">
      <caption>Daily click-through</caption>
      <thead><tr><th scope="col">Day</th><th scope="col">Real rate</th><th scope="col">Real clicks</th><th scope="col">Real impressions</th><th scope="col">Synthetic rate</th><th scope="col">Synthetic clicks</th><th scope="col">Synthetic impressions</th></tr></thead>
      <tbody>
        {days.map((row) => (
          <tr key={row.day}>
            <td>{row.day}</td><td>{metric(row.realCtr)}</td><td>{row.realClicks}</td><td>{row.realImpressions}</td><td>{metric(row.syntheticCtr)}</td><td>{row.syntheticClicks}</td><td>{row.syntheticImpressions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </figure>
);

/** The recs health: the quality of the models, and the click-through of the days. */
export const RecsHealth: React.FC = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void fetchRecsHealth()
      .then((answer) => { if (alive) setHealth(answer); })
      .catch((thrown: unknown) => { if (alive) setError(failure(thrown)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <Panel><p className={`mt-1 ${MUTED}`}>Loading the recs health…</p></Panel>;
  if (error || !health) return <Panel><p className={ERROR}>{error ?? "Recs health is unavailable"}</p></Panel>;

  const models = modelSeries(health.models);
  const days = ctrSeries(health.daily);
  const impressions = days.reduce((total, row) => total + row.realImpressions + row.syntheticImpressions, 0);

  return (
    <Panel>
      <p className={`mt-1 ${MUTED}`}>The quality of every trained model, and the click-through of what was served.</p>
      <div className="mt-3 space-y-6">
        <div className={CARD}>{models.length === 0 ? <p className={MUTED}>No model trained yet</p> : <QualityChart models={models} />}</div>
        <div className={CARD}>{impressions === 0 ? <p className={MUTED}>No impressions logged yet — the impression beacon is not live</p> : <CtrChart days={days} />}</div>
      </div>
    </Panel>
  );
};
