/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   program-engine-home.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The button program and its interpreter live in the database engine, so the
// engine's automations run the same steps as buttons. The app's old paths
// re-export them: one implementation, not a copy that drifts.

import assert from "node:assert/strict";
import test from "node:test";

import * as appModel from "../../src/entities/block/model/buttonProgram.ts";
import * as appInterpreter from "../../src/services/button-program/interpreter.ts";
import * as engineModel from "../../src/shared/notion-database-sys/src/lib/program/buttonProgram.ts";
import * as engineInterpreter from "../../src/shared/notion-database-sys/src/lib/program/interpreter.ts";

test("the app's program model is the engine's", () => {
	assert.equal(appModel.parseButtonProgram, engineModel.parseButtonProgram);
	assert.equal(appModel.PROGRAM_LIMITS, engineModel.PROGRAM_LIMITS);
	assert.equal(appModel.DESTRUCTIVE_PAGE_ACTIONS, engineModel.DESTRUCTIVE_PAGE_ACTIONS);
});

test("the app's interpreter is the engine's", () => {
	assert.equal(appInterpreter.runButtonProgram, engineInterpreter.runButtonProgram);
	assert.equal(appInterpreter.guardDestructive, engineInterpreter.guardDestructive);
	assert.equal(appInterpreter.DEFAULT_LIMITS, engineInterpreter.DEFAULT_LIMITS);
});
