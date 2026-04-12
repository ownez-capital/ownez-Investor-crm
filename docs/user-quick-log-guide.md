# Quick Log — How It Works

**For:** anyone logging activities with prospects in OwnEZ CRM
**Skim time:** 2 minutes · **Worked examples:** below

---

## What changed

Two upgrades. The fast path is unchanged — you only see the new stuff when it's useful.

- **Close-out on old Next Actions.** When you log an activity and you had a follow-up already due, a small prompt asks whether that old follow-up is **Done**, **Still pending**, or should be **Replaced**. No more silent drift.
- **Drop lead from Quick Log.** Mark a prospect Dead or Nurture without leaving the flow.

---

## The normal flow (most logs)

Type → Enter → set a Next Action → Enter. Done. Same as before.

![Quick Log ready to accept an activity](screenshots/quick-log-guide/02-quick-log-ready.png)

---

## When you had a follow-up already due

You log an activity on a prospect who has an open Next Action whose date has passed. Before you move on, you get this:

![Close-out prompt](screenshots/quick-log-guide/03-close-out-prompt.png)

Pick one:

| | When to pick it | What happens |
|---|---|---|
| **[D] Done** | The activity you just logged **is** the follow-up. *"Emailed Q3 deck with annotations."* | Old follow-up gets marked done and linked to the activity. Prospect clears off the overdue list. Next Action prompt appears for the next step. |
| **[P] Still pending** | You logged something unrelated. *"CPA called — Robert traveling this week."* | Note gets saved. Old follow-up **stays open**. Prospect **stays on the overdue list** — because the deck still needs sending. No surprises later. |
| **[R] Replace** | The plan changed. *"Robert pushed the Q3 conversation to after his travel."* | Old follow-up is retired. Next Action prompt appears with an **empty date** — pick a new one. |

Keyboard: `D`, `P`, `R`, or `Enter` to confirm.

### When this prompt doesn't appear
- First contact with a fresh prospect
- Your current Next Action is still in the future
- Someone already closed out the follow-up on a previous activity

---

## Dropping a lead — Dead or Nurture

When the right move is **not** another follow-up, use the **Drop lead ▸** link inside the Next Action prompt.

![Drop lead panel](screenshots/quick-log-guide/05-drop-lead-panel.png)

1. Log the activity ("Called — not accredited right now.")
2. Pick **Done / Still pending / Replace** to clear the close-out
3. Click **Drop lead ▸**
4. Pick **[D] Dead** (pick a reason) or **[N] Nurture** (pick a re-engage date)
5. Confirm

The prospect leaves your active pipeline. Every call, note, and relationship stays on the record — you can restore them later from their detail page with full history intact.

---

## What the timeline shows

Next Actions you set appear as inline `◉` markers alongside your activities. When an activity handles a follow-up, a green `✓ Done` line appears under it linking back to the marker.

![Activity timeline with commitment markers and done link](screenshots/quick-log-guide/06-timeline.png)

Status badges on the markers:

- `✓ done (Nd late)` — a later activity handled it
- `↺ replaced` — you changed the plan
- `✕ cancelled` — the lead was dropped
- *no badge* — still open

---

## Cheat sheet

| Situation | Do this |
|---|---|
| Nothing outstanding, just logging | Type → Enter → set Next Action → Enter |
| Old follow-up; this activity handled it | **[D] Done** → set Next Action → Enter |
| Old follow-up; logging something else | **[P] Still pending** — you're done |
| Old follow-up; plan changed | **[R] Replace** → pick new date → Enter |
| Prospect says they're out | Next Action prompt → **Drop lead ▸** → Dead + reason |
| Parking for later | Next Action prompt → **Drop lead ▸** → Nurture + re-engage date |

---

## FAQ

**Will this slow me down?** Only when you actually had something outstanding. If nothing's overdue, you don't see the prompt — you go straight to Next Action like before.

**I picked Still pending but it really did handle the follow-up.** Open the prospect's page and mark the open Next Action done from there. One click.

**How do I bring back a dropped lead?** Open their detail page (search People, filter Dead/Nurture) and move them back via the stage bar. All history is preserved.

**How does the overdue list decide?** It shows prospects with an open Next Action whose date has passed. Logging an activity doesn't by itself clear the flag — you clear it by picking **Done** or **Replace** (or by dropping the lead). This is the point: the list stays honest.

**More than one open follow-up on the same prospect?** Uncommon, but the prompt lists them all at once — pick **Done / Still pending / Replace** for each, then hit Confirm.
