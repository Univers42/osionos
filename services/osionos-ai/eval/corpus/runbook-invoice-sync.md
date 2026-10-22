---
title: Runbook — invoice sync with the finance system
visibility: shared
owner: u_ben
collaborators:
  - user: u_ana
    role: viewer
archived: false
---

## What this covers

Every invoice we raise for a project is copied into the finance system by an overnight
sync. This runbook says what to do when the sync refuses a document, because a refused
invoice is a milestone that is not invoiced and a client that does not pay.

## The nightly run

The sync reads the project folder, matches each document to a project record, and writes
one finance document per invoice. It runs at two in the morning and it is safe to run
again on the same day: documents that were already copied are skipped.

- A document with no project number is not copied.
- A document with no cost centre is not copied.
- A document with no customer reference is held for one day, then copied anyway.
- A credit note is copied with a negative amount and its own number.

## When a document is refused

Error ERR-6083 appears when an invoice line carries no cost centre and the sync refuses
the whole document. <!-- answer:q08 -->

The document stays in the project folder with a note in the log, and the milestone is not
invoiced. Do not send the client a reminder for an invoice that has not been raised.

## The fix, in order

1. Open the log entry and note the document number and the line it stopped on.
2. Open the invoice in the project folder and read the cost centre field.
3. If it is empty, take the cost centre from the project record, not from another invoice.
4. If the project record has no cost centre either, ask the workshop manager, in writing.
5. Save the invoice and wait for the next run; do not raise a second copy by hand.

## Numbers that must be right

The sync copies three figures and refuses to guess any of them.

| Figure | Source | Rule |
| --- | --- | --- |
| Gross amount | The invoice | Never rounded |
| Milestone split | The contract terms | Must match the order |
| Cost centre | The project record | Never copied from another invoice |

### What the client sees

The client never sees a refusal. The client sees an invoice that does not arrive. An invoice held
for three days becomes a reminder, and a reminder becomes a dispute. That is why the refused list is
read every Monday: a held invoice is a late invoice, and it is caught before the reminder goes out,
not after.

## Common mistakes

- Editing an invoice after the sync has run, which leaves two versions in the folder.
- Giving a milestone a different percentage from the contract to make a number balance.
- Moving a document between project folders after it has been copied.
- Treating a held document as a refused one, and chasing the client for it.

## Handover and audit

The finance team reads the refused list every Monday. An invoice refused more than three
times in a month is a project record problem, and the project record is fixed before the
next invoice goes out.
