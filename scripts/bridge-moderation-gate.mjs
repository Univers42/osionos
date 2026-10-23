/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-gate.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The GATE — what L0 decides about a comment BEFORE it is written.
 *
 * Two things live here and nothing else:
 *   1. `decideWrite` — PURE. It runs the L0 rules (bridge-moderation.mjs) and
 *      answers one of three outcomes: write it, write it held, or ask the
 *      author first. No I/O, no logging, no clock.
 *   2. `recordDecision` — the ONE audit row a decision leaves behind, in
 *      public.ai_moderation_events (the groot migration).
 *
 * THE DECISION TABLE (mode x verdict). `publicReadable` is C94's rule: the
 * subject's page is public, or its workspace is public — the SAME rule the M4b
 * enqueue trigger uses. A private subject is author-side only: it is never
 * held and never recorded.
 *
 *   mode | verdict | outcome    | record (publicReadable && stateEnabled)
 *   -----+---------+------------+---------------------------------------
 *   off  | any     | write      | null
 *   log  | allow   | write      | null
 *   log  | warn    | write      | 'warn' (shadow)
 *   log  | hold    | write      | 'hold' (shadow)
 *   hold | allow   | write      | null
 *   hold | warn    | needs_ack  | null (not acknowledged) / 'warn' (acknowledged)
 *   hold | hold    | write_held | 'hold' (public-readable, state on)
 *   hold | hold    | needs_ack  | null (private, or state off) / write
 *
 * `on` behaves like `hold`: the difference between the two modes is what a
 * LATER layer does with the same verdict, not what this gate does.
 *
 * THE FLAG AND THE DEPLOY ORDER
 *   The state column (moderation_state) and the audit table (ai_moderation_events)
 *   arrive with the groot migration models/osionos-ugc-moderation-migration.sql.
 *   That migration is NOT applied to the live database yet, so the flag
 *   OSIONOS_MODERATION_STATE=1 goes on ONLY AFTER it: the readers' `or=` filter
 *   400s against a database that has no moderation_state column, and every
 *   comment list breaks. The order is migration first, then the flag. Unset (the
 *   default) — the bridge never names moderation_state and never writes
 *   ai_moderation_events: byte-for-byte today's queries.
 */

import { createHash } from 'node:crypto';
import { SURFACES, checkText, effectiveVerdict, moderationMode } from './bridge-moderation.mjs';
import { rest } from './bridge-social-core.mjs';

/**
 * What L0 says about a text that is about to be written.
 *
 * PURE: it reads no env, no clock, no database. `mode` is the moderation mode
 * ('off' | 'log' | 'hold' | 'on'), `publicReadable` the C94 rule, `acknowledged`
 * the author's answer to the warning, `stateEnabled` the flag that says the
 * state column and the audit table exist.
 *
 * The returned `terms` are the MATCHED BLOCKLIST TERMS: they belong to the
 * author's own UI and to nothing else. A caller must NOT log them and must
 * NOT put them in an event — a log line is a copy of the author's message
 * (C94). Log the CODES.
 */
export function decideWrite({
	text,
	surface,
	mode = 'log',
	publicReadable = false,
	acknowledged = false,
	stateEnabled = false,
} = {}) {
	const { verdict, reasons, policyHash } = checkText(text, { surface });
	const codes = reasons.map((reason) => reason.code);
	const terms = reasons.flatMap((reason) => (Array.isArray(reason.terms) ? reason.terms : []));
	const base = { codes, terms, policyHash };
	// A decision is only ever recorded for a PUBLIC-readable subject whose state
	// column exists: a private comment is author-side only (C94).
	const recordable = publicReadable === true && stateEnabled === true;
	// off: no rule is applied and nothing is recorded.
	if (mode === 'off') return { outcome: 'write', record: null, ...base };
	// log: the shadow. The write always happens; the verdict that WOULD have
	// been enforced is only recorded.
	if (mode === 'log') return { outcome: 'write', record: recordable && verdict !== 'allow' ? verdict : null, ...base };
	// hold and on enforce the verdict as it is (effectiveVerdict is the switch).
	if (effectiveVerdict(verdict, mode) === 'allow') return { outcome: 'write', record: null, ...base };
	// A hold only HOLDS a public-readable subject whose state column is on.
	// Everywhere else a hold is a warning: the author is asked, and the comment
	// is written when they say so.
	if (verdict === 'hold' && recordable) return { outcome: 'write_held', record: 'hold', ...base };
	if (acknowledged !== true) return { outcome: 'needs_ack', record: null, ...base };
	return { outcome: 'write', record: recordable && verdict === 'warn' ? 'warn' : null, ...base };
}

/**
 * The WARN-ONLY gate: L0 asks the author before FIVE MORE public-facing
 * writes — a profile, a community, a channel message, a published page, a
 * marketplace app.
 *
 * ONE helper for the five sites, so the rule of this slice lives in one
 * place: `publicReadable` is false and `stateEnabled` is false, ALWAYS. These
 * five tables have no `moderation_state` column, so nothing here is ever
 * written held and no audit row is ever written: a verdict that is a HOLD is
 * a warning like any other, and the author answers it with
 * `acknowledgeWarning: true`. The mode still decides whether the question is
 * asked at all: unset (the default) is `log`, and every outcome is `write`,
 * so the default configuration changes NOTHING.
 *
 * The decision is PURE, like `decideWrite`: the caller asks BEFORE the write
 * and answers `needs_ack` with a 409 (`moderationWarningBody`) and writes
 * NOTHING. The matched TERMS belong to the author's own screen and are never
 * logged (C94).
 *
 * @param {{ text: string, surface: string, env?: object, payload?: object }} input
 * @returns {{ outcome: 'write' | 'needs_ack' | 'write_held', codes: string[], terms: string[], policyHash: string }}
 */
export function askBeforeWrite({ text, surface, env = process.env, payload = null } = {}) {
	return decideWrite({
		text,
		surface,
		mode: moderationMode(env),
		// No state column on these five tables: nothing is held, nothing is recorded.
		publicReadable: false,
		stateEnabled: false,
		acknowledged: payload?.acknowledgeWarning === true,
	});
}

/**
 * The audit row of one decision: ONE row of public.ai_moderation_events.
 *
 * The `layer` says WHO decided: 'l0' is the gate (the default, and what every
 * existing caller writes), 'admin' is a human at the console. The `actorId` is
 * that human — null for the gate, which has no actor but its rules.
 *
 * The `reason` is the reason CODES, joined by ','. They are the codes the
 * same rules name for this content on this surface — the subject kind names
 * the surface — and the matched TERMS never reach this row (C94). An admin's
 * own reason (a code from the console's closed list) REPLACES those codes in
 * that row: the human's words are the reason for the human's act.
 *
 * NEVER the text itself: the content is a sha256, and the reason is a code.
 * The matched terms never reach this row (C94).
 *
 * A failed insert is a warn and nothing more: the write that triggered it has
 * already happened, and the audit is a net behind it, not a gate in front of
 * it. The M4b trigger is the async net; this row is the synchronous trace.
 */
export async function recordDecision(config, fetchImpl, {
	subjectKind,
	subjectId,
	workspaceId = null,
	authorId = null,
	action,
	mode,
	policyHash,
	content,
	layer = 'l0',
	actorId = null,
	reason = null,
}) {
	// The reason is the reason CODES, joined by ','. They are the codes the
	// same rules name for this content on this surface — the subject kind names
	// the surface — and the matched TERMS never come here (C94).
	const codes = checkText(content, { surface: SURFACES.includes(subjectKind) ? subjectKind : 'chat' })
		.reasons.map((entry) => entry.code);
	const computed = codes.filter(Boolean).join(',').slice(0, 200) || null;
	const reasonText = String(reason ?? computed ?? '').slice(0, 200) || null;
	try {
		await rest(config, fetchImpl, 'ai_moderation_events', {
			method: 'POST',
			body: {
				subject_kind: subjectKind,
				subject_id: String(subjectId ?? '').slice(0, 80),
				workspace_id: workspaceId ?? null,
				author_id: authorId ?? null,
				layer,
				actor_id: actorId ?? null,
				action,
				mode,
				scores: { verdict: action },
				policy_hash: policyHash,
				content_sha256: createHash('sha256').update(String(content ?? ''), 'utf8').digest('hex'),
				reason: reasonText,
			},
			prefer: 'return=minimal',
		});
		return true;
	} catch {
		// The codes, never the content and never the terms.
		console.warn(`[osionos-bridge] moderation event not recorded (${reasonText ?? 'no reason'})`);
		return false;
	}
}
