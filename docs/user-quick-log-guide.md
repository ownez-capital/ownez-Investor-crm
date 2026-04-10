# Quick Log Guide

**Audience:** anyone using OwnEZ CRM to log activities with prospects
**What it covers:** the updated Quick Log flow — logging activities, handling open follow-ups, dropping leads

---

## What's new

Two small upgrades to make Quick Log faster and more useful:

- **Your Next Actions now have a clean close-out.** When you log an activity, you can mark the previous Next Action as done, still pending, or replaced — so your follow-up list stays accurate and you never lose track of what's still on your plate.
- **You can drop a lead straight from Quick Log.** No more navigating away to mark a prospect Dead or Nurture — it's one click inside the flow.

Nothing you already know how to do went away. The fast path for logging an activity is still the same.

---

## The normal flow — nothing outstanding

This is what you'll see the majority of the time. No change from how you've worked before:

1. Open Quick Log (on Dashboard, Pipeline, or a prospect's page)
2. Type what happened. Example: *"Called Robert, walked through the Q3 deck, he wants to bring in his CPA"*
3. Hit Enter
4. A **Next Action** prompt appears. Type a new follow-up (or press Enter to keep the old one), pick a date, hit Enter.
5. Done. Green success banner.

Total: 2 Enters and one sentence. Same as today.

---

## When you have an outstanding Next Action from before

This is the change you should know about.

Imagine this: you told yourself *"Follow up with Robert about Q3 deck by Mar 5"* a few days ago. Mar 5 has come and gone. Today it's Mar 7, and you're about to log a new activity on Robert.

When you hit Enter after typing your activity, you'll see a small prompt:

> ⚠ **Outstanding:** Follow up — Q3 deck — due Mar 5 (2d overdue)
>
> **[F] Fulfilled** — this activity handled it
> **[P] Still pending** — logging something unrelated
> **[R] Replace** — drop this, set a new one

You pick one before you continue. Three real-life examples:

### Example 1 — The activity you just logged is the follow-up

You log: *"Emailed Robert the Q3 deck with annotations."*

Pick **[F] Fulfilled**. The Mar 5 follow-up gets marked done and linked to the email. The normal Next Action prompt then appears so you can set the next step.

Robert clears off the overdue list on the dashboard.

### Example 2 — You're logging something different

You log: *"Robert's CPA called — Robert is traveling this week, back Monday."*

Useful to capture, but it's not the Q3 deck follow-up. Pick **[P] Still pending**. The note gets saved and the Q3 follow-up stays on your list.

Robert stays on the overdue list on the dashboard — which is probably what you want, since you still have a Q3 deck to send. No surprises later.

### Example 3 — Your plan just changed

You log: *"Called Robert, he asked to push the Q3 conversation to after his travel."*

The Mar 5 follow-up isn't the plan anymore. Pick **[R] Replace**. The Next Action prompt appears with an empty date — pick a new one (e.g., Mar 14) and you're set.

### When does this prompt appear?

Only when you have an outstanding Next Action whose date was **today or earlier**. If your last Next Action is still in the future (e.g., you set it for next week), the prompt skips — you just get the normal Next Action prompt and you can keep that future date or change it.

### When you don't see the prompt at all

- First contact with a prospect (nothing scheduled yet)
- Your last Next Action is in the future
- You already closed out the Next Action on a previous activity

---

## Dropping a lead — moving a prospect to Dead or Nurture

Sometimes the right next step isn't another follow-up — it's moving the prospect to Dead or Nurture. You can now do that directly from Quick Log instead of navigating to the stage bar on the detail page.

Inside the Next Action prompt, you'll see a small **"Drop lead ▸"** link.

1. Log the activity as usual ("Called Robert — not accredited right now.")
2. Hit Enter → Next Action prompt appears
3. Click **Drop lead ▸**
4. Pick **Dead** or **Nurture**
5. For Dead: pick a reason (Not Accredited, Not Interested, Ghosted, Timing, Went Elsewhere, Other) — optional note if you want to add color
6. For Nurture: pick a re-engage date (e.g., 6 months from now)
7. Hit Enter

The prospect drops off your dashboard and out of your active pipeline. Everything on the record — every call, email, note, relationship — stays exactly where it is, so if circumstances change later you can move them back to an active stage with full context still intact.

**Keyboard shortcut:** Press `D` while in the Next Action prompt to jump straight to Drop mode.

---

## What you'll see on the prospect's timeline

The timeline now includes markers for the Next Actions you set, alongside your logged activities. It's easier to scan and recall the story of the relationship.

A typical timeline looks like:

```
Mar 3   📞  Called Robert
            "Walked through overview. He asked for Q3 numbers."

Mar 3   ◉  Next action set · Follow up · Q3 deck · due Mar 5

Mar 7   ✉  Email
            "Sent Q3 deck with annotations."
            ✓ Handled: Follow up — Q3 deck (2 days late)

Mar 7   ◉  Next action set · Schedule meeting · due Mar 14
```

The ◉ markers show what you planned. The ✓ lines show what was handled. Easy to scan, easy to pick up where you left off after a weekend.

If you picked "Still pending" on a close-out, the marker stays open:

```
Mar 3   ◉  Next action set · Follow up · Q3 deck · due Mar 5
            ⚠ Still open (2 days overdue)

Mar 7   📝  Note
            "CPA called — Robert traveling this week."
```

If you dropped the lead, the open follow-up gets marked cancelled:

```
Mar 3   ◉  Next action set · Follow up · Q3 deck · due Mar 5 · ✕ cancelled

Mar 7   📞  Call
            "Robert said not interested right now."

Mar 7   ─── Stage changed: Active Engagement → Dead (reason: Not Interested) ───
```

---

## FAQ

**Q: Will the close-out prompt slow me down?**
A: Only when you actually have an outstanding follow-up. If there's nothing overdue, the prompt doesn't appear — you go straight to the normal Next Action prompt, same as today. On a typical busy morning most of your logs never trigger it.

**Q: I picked "Still pending" but I realized the activity I logged actually did handle the follow-up. Can I fix it?**
A: Yes. Open the prospect's detail page — the open Next Action will still be there. Click into it (or use the Next Action Bar's edit mode) to mark it Fulfilled after the fact.

**Q: I dropped a lead and want to bring them back. How?**
A: Open the People directory, filter by "Dead" or "Nurture," find the lead, open their detail page, and use the stage bar to move them back to an active stage. Everything on the record is preserved — activities, notes, relationships — including the old cancelled follow-ups, so you have full context.

**Q: How does this change my overdue list on the dashboard?**
A: A prospect shows as overdue when there's an open Next Action with a past-due date. Logging an activity alone doesn't clear the overdue flag — you clear it by picking Fulfilled, Replace, or Drop lead in the close-out prompt. This means your overdue list reflects what's actually still on your plate, which makes morning triage faster.

**Q: What if a prospect has more than one outstanding Next Action?**
A: Uncommon, but it can happen — for example if a prospect was reassigned to you with existing follow-ups. The close-out prompt will list all of them at once and you can resolve each one in a single step.

---

## Summary cheat sheet

| Situation | What to do |
|---|---|
| Just logging an activity, nothing outstanding | Type → Enter → Next Action → Enter. Done. |
| You had an old Next Action, and this activity handled it | Pick **Fulfilled** → set next action → Enter |
| You had an old Next Action, and this activity is unrelated | Pick **Still pending** — you're done, no new next action needed |
| You had an old Next Action, and you want to change your plan | Pick **Replace** → set new next action → Enter |
| Prospect said they're out | Next Action prompt → **Drop lead ▸** → Dead + reason → Enter |
| Prospect wants to park it for later | Next Action prompt → **Drop lead ▸** → Nurture + re-engage date → Enter |
