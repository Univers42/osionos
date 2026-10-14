// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   interactionRun.mjs                                 :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// One measured interaction: timed samples, then one CPU profile of the same action, then the
// budget assertion. The profile runs BEFORE the assertion so a failing budget still leaves the
// raw .cpuprofile behind to explain it.
//
// Ponytail: the profiled repeats include the untimed `before` reset (it is part of the loop the
// profiler sees), so reset work shows up in the profile next to the action - read the stacks,
// not the totals. Sampling caveats: perfProfile.mjs.

import { writeFileSync } from "node:fs";
import path from "node:path";

import { REPORT_DIR, assertBudget, measureToPaint, writeReport } from "./perfHarness.mjs";
import { aggregateProfile, profileDuring } from "./perfProfile.mjs";

const PROFILE_REPEATS = 10;

export async function runInteraction(page, { spec, name, floor, action, before, until, startEvent, runs = 20, warmups = 3, target, budget }) {
  const options = { startEvent, until, before };
  const stats = await measureToPaint(page, action, { ...options, runs, warmups });
  const profile = await profileDuring(page, () => measureToPaint(page, action, { ...options, runs: PROFILE_REPEATS, warmups: 0 }));
  writeFileSync(path.join(REPORT_DIR, `${spec}.${name}.cpuprofile`), `${JSON.stringify(profile)}\n`);
  const { totalMs, self } = aggregateProfile(profile);
  writeReport(spec, `${name}.profile`, { totalMs, selfTop: self.slice(0, 20) });
  assertBudget(spec, name, stats, { target, budget }, { floor });
}
