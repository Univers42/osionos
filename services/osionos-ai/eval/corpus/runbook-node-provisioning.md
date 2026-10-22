---
title: Runbook — node provisioning for new sites
visibility: shared
owner: u_ben
collaborators:
  - user: u_chloe
    role: viewer
archived: false
---

## What this covers

Every new site installation, whether it is a hotel floor, a clinic or a museum gallery, gets
a small local node. The node runs the show control for the lights, the blinds and the room
signage. This runbook is the procedure from crate to working room.

## Before you leave the workshop

- The node is built on a bench in Vejle and burned in for twenty-four hours.
- The show file is loaded and every scene is triggered once by hand.
- The network configuration is written on a printed sheet, not only on the drive.
- The crate is packed with the power supply, the patch panel and two spare sensors.

## On site

1. Unpack in the room, not in the corridor. The room is where the network is.
2. Fix the node to the wall bracket, at the height given on the drawing.
3. Connect the sensors, one at a time, and check each one before the next.
4. Connect the network lead last, after the sensors answer locally.
5. Run the twenty-minute soak test with the lights at full and the blinds closed.
6. Photograph the finished bracket and the serial plate.

## When the node refuses to join

Error ERR-4712 means the node refused to join the pool because its key does not match the
signed one. <!-- answer:q07 -->

The fix is short and it must be done in this order.

- Read the serial plate and write the last four characters down.
- Compare them with the last four characters of the key on the printed sheet.
- If they differ, the wrong sheet was printed: get a new sheet from the workshop.
- If they match, the key was typed in wrong: enter it again from the printed sheet.
- Never re-key a node from memory, and never copy a key from another node.

The ERR-4712 error also appears when the node has been swapped with another site, because
the signed sheet travels with the room, not with the box.

### The twenty-minute soak test

The soak test is not a formality. The lights run at full, the blinds close, and the room is left
alone. Two things only show up in that window: a sensor that has drifted and a power supply that is
close to its limit. If the room survives twenty minutes with the blinds closed, it will survive a normal
evening.

## If the soak test fails

- A scene that does not trigger usually means a sensor is paired to the wrong room.
- A panel that resets means the power supply is underloaded; check what else is on the
  circuit.
- A node that works but is not visible on the network is a network issue, not a node issue,
  and the node should not be replaced.

## Handover

Leave in the room: the printed configuration sheet, the show schedule, the client keypad
and the spare sensors. Sign the handover sheet with the photographs attached.
