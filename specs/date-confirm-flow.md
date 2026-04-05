# Date Confirm Flow Spec

## Context

When a squad member proposes a date for a squad event, other members are asked to confirm whether they're still down. This is the "date confirm" flow.

---

## Proposing a date

Any squad member can propose a date via the squad settings or edit event modal. When proposed:

- A system message appears in chat: "{name} proposed {date} — are you still down?"
- The proposer is auto-confirmed as "yes"
- All other members get a pending confirm row and an in-app notification
- The squad's `date_status` is set to `'proposed'`

---

## Responding

Members see a sticky confirm bar at the bottom of the squad chat with two options:

### "STILL DOWN"
- Records response as `'yes'`
- Confirm bar changes to "you're in" status
- System message shows "you're in" under the date proposal

### "CAN'T MAKE IT"
- Records response as `'no'`
- **User stays in the squad** — this is a soft decline, not a squad leave
- Confirm bar changes to "can't make it" status
- System message shows "can't make it" under the date proposal
- The user can still participate in squad chat and future date proposals

---

## Auto-lock

When all members have responded:

- If at least one member said "yes", the date is auto-locked (`date_status` → `'locked'`)
- The squad expiry is extended to the event date + 24 hours
- A system message announces the locked date

If all members say "can't make it", the date is NOT auto-locked. The proposer can:
- Propose a new date (clears old confirms, starts fresh)
- Clear the date entirely

---

## Re-proposing

When a new date is proposed:
- All previous confirm rows are deleted
- New pending confirms are created for all members
- The flow restarts from the beginning

---

## Clearing a date

Any squad member can clear the proposed/locked date:
- Confirm rows are deleted
- `date_status` is set to null
- A system message announces "{name} cleared the date"

---

## Edge cases

- **New members added after a date is proposed**: They get a pending confirm row and see the confirm bar
- **Waitlisted members**: Do not get confirm rows (they're not active members)
- **Promoted from waitlist**: Get a confirm row when promoted, with a "A spot opened up" notification
