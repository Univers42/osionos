/* ************************************************************************** */
/*                                                                            */
/*   workspace-membership-notice.test.ts               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+       */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { workspaceMembershipNotice } from "../../src/widgets/notifications/model/workspaceMembershipNotice.ts";

test("an added frame names the inviter and the workspace", () => {
  assert.equal(
    workspaceMembershipNotice({ op: "added", workspaceName: "Team", by: { name: "Alice" } }),
    "Alice added you to Team",
  );
});

test("a removed frame names the workspace", () => {
  assert.equal(
    workspaceMembershipNotice({ op: "removed", workspaceName: "Team" }),
    "You were removed from Team",
  );
});

test("a added frame without a name/workspace still reads sensibly", () => {
  assert.equal(workspaceMembershipNotice({ op: "added" }), "Someone added you to a workspace");
});

test("role and unknown ops have no toast", () => {
  assert.equal(workspaceMembershipNotice({ op: "role", workspaceName: "Team" }), null);
  assert.equal(workspaceMembershipNotice({ op: "join_requested" }), null);
});

test("junk payloads are null, never a throw", () => {
  for (const payload of [null, undefined, 42, "added", []]) {
    assert.equal(workspaceMembershipNotice(payload), null);
  }
});
