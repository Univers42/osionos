/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat-media.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeAttachmentMetadata } from '../../scripts/bridge-chat-media.mjs';

describe('sanitizeAttachmentMetadata', () => {
	it('returns {} for non-objects', () => {
		assert.deepEqual(sanitizeAttachmentMetadata(null), {});
		assert.deepEqual(sanitizeAttachmentMetadata('x'), {});
		assert.deepEqual(sanitizeAttachmentMetadata([1, 2]), {});
		assert.deepEqual(sanitizeAttachmentMetadata(undefined), {});
	});

	it('clamps integer fields to their caps and drops negatives', () => {
		assert.equal(sanitizeAttachmentMetadata({ width: 99999 }).width, 16384);
		assert.equal(sanitizeAttachmentMetadata({ height: 99999 }).height, 16384);
		assert.equal(sanitizeAttachmentMetadata({ durationMs: 10 ** 12 }).durationMs, 86_400_000);
		assert.equal('width' in sanitizeAttachmentMetadata({ width: -5 }), false);
		assert.equal(sanitizeAttachmentMetadata({ width: 640.7 }).width, 640); // truncated
	});

	it('bounds the waveform to 256 samples in [0,1] rounded to 2dp', () => {
		const out = sanitizeAttachmentMetadata({ waveform: [0.5, 2, -1, 'x', 0.123456] });
		assert.deepEqual(out.waveform, [0.5, 1, 0, 0, 0.12]);
		const long = sanitizeAttachmentMetadata({ waveform: new Array(400).fill(0.5) });
		assert.equal(long.waveform.length, 256);
	});

	it('keeps url-card text fields and drops unknown keys', () => {
		const out = sanitizeAttachmentMetadata({ title: 'Hi', description: 'd', image: 'http://x/i.png', evil: 'x', __proto__: { polluted: true } });
		assert.equal(out.title, 'Hi');
		assert.equal(out.image, 'http://x/i.png');
		assert.equal('evil' in out, false);
		assert.equal('polluted' in out, false);
	});

	it('preserves the voice round-trip (durationMs + waveform)', () => {
		const out = sanitizeAttachmentMetadata({ durationMs: 3200, waveform: [0.1, 0.9, 0.4] });
		assert.equal(out.durationMs, 3200);
		assert.deepEqual(out.waveform, [0.1, 0.9, 0.4]);
	});
});
