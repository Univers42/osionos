/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   user-store-storage-full-notice.test.ts             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A5, landing finding 3: the signed-in accounts, their workspaces and the active
// context make room like the session does, and a refusal is shown instead of dropped.

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { reset, signIn, storage, useToastStore, userStore } from "./user-store-fixtures.ts";

const noticed = () => useToastStore.getState().toasts
  .filter((toast) => toast.title === "Browser storage is full")
  .map((toast) => toast.description?.split(":")[0]);

beforeEach(reset);

test("A5 refused workspaces, accounts and context keep the sign-in in memory and are shown once", () => {
  for (const key of ["osionos:user-workspaces", "osionos:active-accounts", "osionos:user-context"]) storage.refused.add(key);
  assert.doesNotThrow(() => signIn("u1", "r1"));
  assert.equal(userStore.useUserStore.getState().activeUserId, "u1");
  assert.equal(storage.getItem("osionos:user-workspaces"), null);
  assert.deepEqual(noticed(), ["Accounts and workspaces"]);
});
