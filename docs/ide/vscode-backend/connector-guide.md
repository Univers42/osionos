# The Connector: pair once, reopen without a code

osionos-node, the Connector, is what lets the app's "This computer" tab open a terminal or a folder
on your machine. It listens on `127.0.0.1:4100` only, so nothing on the network can reach it. The
app can only hand it a short-lived token signed by the bridge. Ruled by devil on 2026-11-27
(TB1–TB25, groot `docs/adr/DRAFT-connector-trusted-browser-ruling.md`), amending groot ADR 0041
and ADR 0044.

## Pair a computer (once)

In the app, open "This computer" and copy the line it shows. From production or the beta it is
the same line, and it serves and remembers both (TB19):

```sh
curl -fsSL https://raw.githubusercontent.com/Univers42/osionos/main/packages/osionos-node/install.sh | sh -s -- --bridge https://baas.tail10f2ea.ts.net:10000 --app-origin https://baas.tail10f2ea.ts.net:8443 --app-origin https://baas-beta.tail10f2ea.ts.net --remember-origin https://baas.tail10f2ea.ts.net:8443 --remember-origin https://baas-beta.tail10f2ea.ts.net --name laptop
```

Run it in a terminal: pairing asks for confirmation there. Then enter the emailed code once in the
app and tick "Remember this computer". The line installs a user service (systemd, or launchd on
macOS) that starts at login, so you never run it again.

The pairing stays until you remove the machine in the app. A lost row, an old bridge, a proxy
error or a network cut never ends it: only a removal signed by a bridge key the Connector pinned
at pairing does (TB14). A restarted Connector with no pairing never pairs on its own (TB16).

## Reopen without a code

With "Remember this computer" ticked, the terminal and the editor reopen with no code for **12
hours after their last use**, within **30 days of the code**. Close the tab, come back within 12
hours, and it opens. After 12 idle hours, or 30 days in all, the app asks for one code again.

Caveat: the idle clock restarts when the last terminal or editor closes. If the Connector crashes
with one open, that close is never counted, so the 12 hours run from the open before it. The code
can then be asked sooner than expected, never later.

A remembered computer is a second factor, not a password. Each reopen also needs a fresh 60 s
assertion that the bridge signs only for the signed-in owner of a machine that is still paired.

## Check it: `osionos status`

```console
$ osionos status
paired       yes, machine m-7sngjeg6ta677lkv, account d•••@g•••.com, bridge https://baas.tail10f2ea.ts.net:10000
service      running on http://127.0.0.1:4100
app origins  https://baas-beta.tail10f2ea.ts.net
remembers    https://baas-beta.tail10f2ea.ts.net
remembered   1 computer(s)
             https://baas-beta.tail10f2ea.ts.net: used 33 min ago, 36 min old
```

That run is from 2026-11-27, on a machine paired before the line served both origins: only the
beta is listed, so production's tab asks for a code each time. The repair below fixes it.

`status` only reads. It prints no key, no secret and no hash, and the email is masked, so its
output is safe to paste in a support thread. `service` says `not this machine: another program
answers` when something else holds port 4100.

## Repair an installed Connector

Run the pairing line again. On a paired machine it asks nothing. It updates the code, rewrites
`~/.osionos/start.sh` with both origins and rewrites the service unit, then restarts it. The
machine id stays the same. Check with `osionos status`: both origins are listed under
`app origins` and `remembers`.

## Lock it now

- From the browser: "Forget this computer" (the terminal toolbar, or Settings). That browser asks
  for a code on its next open.
- From the machine: stop the service, delete the remembered file, start it again. Never delete
  the file while the Connector runs, because it keeps its copy in memory (TB10).

```sh
systemctl --user stop osionos-node        # macOS: launchctl unload ~/Library/LaunchAgents/com.osionos.node.plist
rm -f ~/.osionos/remembered-computers.json
systemctl --user start osionos-node       # macOS: launchctl load ~/Library/LaunchAgents/com.osionos.node.plist
```

## What each control does (TB11)

| Control | New openings | Already open terminal or editor |
| --- | --- | --- |
| Remove the machine in the app | refused at once | closed within one heartbeat (30 s): the Connector archives its identity, forgets remembered computers and folders, and stops |
| Sign out everywhere | refused within 10 s | **keeps running** until you close it |
| Forget this computer | that browser needs a code | keeps running |

**If your browser was taken, remove the machine.** Sign-out-everywhere alone leaves open shells
running.

## Accepted risk: the beta remembers too (TB20)

The owner chose the beta as a remember origin (ADR 0041, R5 override 2026-11-01; C-3). This applies
to everyone who installs the line, testers included: **within the 12-hour window, any commit pushed
to osionos `develop` can run commands in your shell, and read or write the folders you picked,
without a code.** To withdraw it, delete both `https://baas-beta.tail10f2ea.ts.net` arguments from
the line and run it again.

## Remove a computer for good (TB25)

1. **First, remove the machine in the app.** The bridge then refuses it everywhere, and a running
   Connector stops itself within 30 s.
2. **Then unpair locally.** This is the only cleanup when the Connector was off during the
   removal, or when the account was erased: an erased account's machine row is gone, so the bridge
   cannot sign a removal for it (TB18).

```sh
systemctl --user disable --now osionos-node   # macOS: launchctl unload ~/Library/LaunchAgents/com.osionos.node.plist
```

The file steps were run in a scratch home on 2026-11-27, and this is their output:

```console
$ mv ~/.osionos/machine.json ~/.osionos/machine.removed-$(date -u +%Y-%m-%dT%H-%M-%SZ).json
$ rm -f ~/.osionos/remembered-computers.json ~/.osionos/roots.json
$ osionos status
paired       no: run the install line from the app
start line   none (start.sh is missing)
remembered   0 computer(s)
removed      1 archived identity file(s): a record, not a way back
```

- **Never paste** `machine.json`, a `machine.removed-*.json` archive or
  `remembered-computers.json` anywhere. The first two hold the machine's private key. Paste the
  output of `osionos status` instead.
- **An archive is not a restore path.** A removal is one-way on the bridge, so moving the archive
  back gives a machine the bridge refuses. To use the computer again, run the pairing line: it
  pairs a new machine.

## "The bridge answered 410 without a signed removal"

The Connector logs this, at most once an hour, when the bridge refuses its heartbeat without a
removal it can verify. The bridge does not know this machine: its row was deleted (an erased
account, a reset database), or the bridge is older than the signed removal. The Connector stays
paired, and nothing can open on it until this is resolved:

- If you removed the machine, or the account is gone: unpair locally (above).
- If you did not: the bridge lost the row. Unpair locally and pair again.

Caveat: the Connector checks a removal against the bridge keys pinned now. If it was off while the
bridge rotated through two keys, it pins neither, so it ignores the removal and only the local
unpair cleans it up (TB17).

## If the machine is compromised

1. Remove the machine in the app. It can open nothing new from then on.
2. Sign out everywhere, so a stolen browser session dies within 10 s.
3. On the machine, unpair locally (above), then check that `osionos status` says `paired no`.
4. Pair again from a clean machine. A new pairing is a new machine id and a new key.
