# OwnEZ Capital — HNW Investor CRM
## Design Specification

**Version:** 1.2
**Date:** 2026-03-19
**Author:** Eric Gewirtzman + Claude
**Status:** Draft — pending review

---

## 1. Overview

OwnEZ Capital ($60M AUM, targeting $105M) needs a purpose-built CRM for managing high-net-worth investor relationships from first contact through funded status. The capital-raising team (Chad Cormier — Investment Relationship Manager, Ken Warsaw — Marketing Manager) requires a system that is fast, intuitive, and barrier-free for daily use.

### 1.1 Why Not Zoho's UI

The Zoho CRM backend is already configured with the required modules and automations. However, Zoho's native interface is cumbersome and creates friction that discourages consistent data entry. This project builds a **custom frontend** that uses Zoho as the database via API, giving the sales team an interface designed specifically for their workflow.

### 1.2 Architecture

```
Custom Frontend (Next.js on Vercel)
        │
        ▼
  Data Service Layer (lib/data.ts)
        │
        ├── Provider: Mock (lib/providers/mock.ts) ← dev/testing
        ├── Provider: Neon (lib/providers/neon/)   ← production interim
        └── Provider: Zoho (lib/providers/zoho.ts) ← future
                │
                ▼
          Zoho CRM REST API
```

- **Next.js** — server-side API routes act as the API proxy (tokens never exposed to browser)
- **Data Service Layer** — single abstraction point. One env var (`DATA_PROVIDER=mock|neon|zoho`) switches providers. Zero UI code changes.
- **Neon Postgres** — interim production database via Drizzle ORM + @neondatabase/serverless. Data will be migrated to Zoho when the Zoho provider is ready.
- **Vercel deployment** — push to git, live in 60 seconds

### 1.3 Success Criteria

- Chad can log all investor contacts, pipeline stages, next actions, and activity notes within 30 minutes of going live
- Eric can open the Leadership Dashboard and see total pipeline value, AUM progress toward $105M, source attribution, and red flags in under 60 seconds
- Stale/overdue indicators are always accurate (computed live, not batch)
- System is usable without any training beyond a 10-minute walkthrough
- Chad can log an activity from his phone in under 15 seconds
- Chad can complete his entire morning routine — check dashboard, make 5 calls, log all of them with next actions, advance 2 stages — in under 10 minutes without feeling like "data entry"
- On desktop, Chad can do a full activity log + next action update without touching the mouse
- System ships with mock data; IT team can switch to live Zoho by implementing one provider file

---

## 2. Data Model (5 Objects)

### 2.1 Person (Unified — replaces Prospect + External Contact)

Every individual in the system exists once. A person can have multiple roles: Prospect, Referrer, Related Contact, Funded Investor. This eliminates duplicates and surfaces the full relationship network.

| Field | Type | Required | Notes |
|---|---|---|---|
| Full Name | Text | Yes | |
| Created Date | Date | Auto | Auto-set on record creation. Not editable. |
| Email | Email | No | |
| Phone | Phone | No | |
| Organization | Lookup: Organization | No | Link to parent org |
| Roles | Multi-select | Yes | Prospect, Referrer, Related Contact, Funded Investor |
| **Prospect-role fields (visible when role includes Prospect):** | | | |
| Pipeline Stage | Picklist | Yes | 11 values — see Section 3 |
| Initial Investment Target ($) | Currency | No | Dollar amount prospect has indicated |
| Growth Target ($) | Currency | No | Longer-term target if they scale up |
| Committed Amount ($) | Currency | No | Verbal commitment — populate at Soft Commit+ |
| Commitment Date | Date | Auto | Auto-set when Committed Amount is first entered or changed |
| Next Action Type | Picklist | Yes | Follow Up, Schedule Meeting, Send Document, Request Info, Make Introduction, Internal Review, Other |
| Next Action Detail | Text (250 chars) | Yes | Specific context: "Q3 performance deck" |
| Next Action Date | Date | Yes | Date the next action is due |
| Stage Changed Date | Date | Auto | Auto-updated on every stage change. Enables pipeline velocity reporting without scanning activity log. |
| Days Since Last Touch | Auto-calculated | Auto | Computed live from latest Activity date. Excludes Stage Change and Reassignment activity types — only real interactions count (calls, emails, meetings, notes, texts, LinkedIn, WhatsApp, documents). |
| Lead Source | Picklist | Yes | 10 values — see Section 4.2 |
| Assigned Rep | Lookup: User | Yes | Primary owner of the relationship. Admin-only to change after creation (see Section 5.6). |
| Collaborators | Multi-select: User | No | Other team members involved |
| Notes | Long Text | No | Freeform context |
| Lost/Dead Reason | Picklist | Conditional | Required when stage = Dead. Values: Not Accredited, Not Interested, Ghosted, Timing, Went Elsewhere, Other |
| Stale Flag | Auto-calculated | Auto | Computed live — see Section 5.1 |
| Re-engage Date | Date | Conditional | Required when stage = Nurture. Surfaces prospect in Today's Actions on this date. |
| **External Contact-role fields (visible when role includes Referrer or Related Contact):** | | | |
| Contact Type | Picklist | No | CPA, Attorney, Wealth Advisor, Spouse, Existing Investor, Other |
| Contact Company | Text | No | Where this person works (distinct from Organization) |

**Referrer relationship:** When a Person is a Referrer, a separate link record connects them to the Prospect(s) they referred. This allows the same person to be both a Referrer and a Prospect.

**Related Contact relationship:** A link record connects a Person (as Related Contact) to a Prospect, with a Role description (e.g., "CPA — managing entity structure").

### 2.2 Organization

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | Text | Yes | "Calloway Family Office" |
| Type | Picklist | No | Family Office, Wealth Management, Corporate, Individual/None |
| Notes | Long Text | No | |

### 2.3 Funding Entity

| Field | Type | Required | Notes |
|---|---|---|---|
| Entity Name | Text | Yes | "Calloway Family Trust", "RJC Holdings LLC" |
| Entity Type | Picklist | Yes | LLC, LLP, Trust, Individual, Corporation, Other |
| Person | Lookup: Person | Yes | The prospect behind this entity |
| Status | Picklist | Yes | Active, Pending Setup, Inactive |
| EIN / Tax ID | Text | No | For reference only |
| Notes | Long Text | No | Attorney info, setup status |

**Timing:** Funding Entities can be added at any point in the pipeline. Not required until the Funded transition. A gentle nudge (not a blocker) appears at Commitment Processing and KYC stages if no entity is linked.

### 2.4 Activity Log (Child of Person)

| Field | Type | Required | Notes |
|---|---|---|---|
| Person | Lookup: Person | Yes | Parent record |
| Activity Type | Picklist | Yes | See Section 4.3 |
| Source | Auto | Auto | Manual, Zoho Telephony, O365 Sync |
| Date | Date | Yes | Default: today |
| Time | Time | No | |
| Outcome | Toggle | Yes | Connected (default) or Attempted. Attempted = no meaningful two-way exchange (voicemail, no-show, no reply). |
| Detail / Summary | Long Text | Yes | What happened |
| Documents Attached | File Upload | No | PDFs, decks, etc. |
| Logged By | Lookup: User | Auto | Auto-populated from logged-in user |
| Annotation | Long Text | No | For adding notes to auto-synced activities |
| Fulfills Commitment | Lookup: Activity | No | When this activity fulfills a prior Commitment Set entry, links to that entry's ID. See Section 5.9. |
| **Commitment-only fields (populated only when Activity Type = Commitment Set):** | | | |
| Commitment Type | Picklist | Conditional | Snapshot of Next Action Type at the moment the commitment was made (Follow Up, Schedule Meeting, etc.) |
| Commitment Detail | Text (250 chars) | Conditional | Snapshot of Next Action Detail |
| Commitment Due Date | Date | Conditional | Snapshot of Next Action Date |
| Commitment Status | Picklist | Conditional | `open`, `fulfilled`, `superseded`, `cancelled`. Terminal states are set by the close-out flow (Section 5.9). |
| Commitment Closed Date | Date | Conditional | Date the commitment moved to a terminal state. Null while `open`. |

### 2.5 Funded Investment (Child of Funding Entity)

| Field | Type | Required | Notes |
|---|---|---|---|
| Funding Entity | Lookup: Entity | Yes | Which LLC/Trust funded |
| Person | Lookup: Person | Yes | Denormalized for querying |
| Amount Invested ($) | Currency | Yes | Actual funded amount |
| Investment Date | Date | Yes | |
| Track | Picklist | Yes | Maintain / Grow |
| Growth Target ($) | Currency | Conditional | Required if Track = Grow |
| Next Check-in Date | Date | Yes | |
| Notes | Long Text | No | |

**Important:** Committed Amount (on Person) is the verbal/target number. Actual funded amount is always the rollup from Funded Investment records. These are intentionally separate — the gap between committed and funded is useful information.

---

## 3. Pipeline Stages

11 values: 9 active stages + 2 parking lots.

| Stage | Definition | Idle Threshold | Stale Alert |
|---|---|---|---|
| Prospect | Identified but not yet contacted. Research phase. | 10 days | Yes |
| Initial Contact | First outreach made. Awaiting response. | 5 days | Yes |
| Discovery | Discovery meeting scheduled or completed. | 5 days | Yes |
| Pitch | Full deck presented. Waiting for response. | 7 days | Yes |
| Active Engagement | Post-pitch dialogue. Investor doing diligence. | 14 days | Yes |
| Soft Commit | Verbal commitment received with dollar amount. | 5 days | Yes |
| Commitment Processing | Sub docs in progress. Entity/attorney review. | 5 days | Yes |
| KYC / Docs | Moved to Agora for KYC. Waiting on docs. | 3 days | Yes |
| Funded | Wire received. Active LP. | None — creates Funded Investment | No |
| Nurture | Parked — not dead, not active. Re-engage Date required. | No auto-alert | No |
| Dead / Lost | Disqualified or withdrew. Lost/Dead Reason required. | No alert | No |

Stage thresholds and labels are configurable via the admin panel.

---

## 4. Picklist Values

### 4.1 Next Action Types

Follow Up, Schedule Meeting, Send Document, Request Info, Make Introduction, Internal Review, Other

### 4.2 Lead Sources

Velocis Network, CPA Referral, Legacy Event, LinkedIn, Ken — DBJ List, Ken — Event Follow-up, Tolleson WM, M&A Attorney, Cold Outreach, Other

**UI:** Visual chip picker (not a dropdown). Chips are categorized for legibility:
- **Referral:** CPA Referral, Velocis Network, Tolleson WM, M&A Attorney
- **Network:** Ken — DBJ List, Ken — Event Follow-up
- **Event:** Legacy Event
- **Direct:** LinkedIn, Cold Outreach, Other

Top row shows the 4 most frequently used sources (computed live via `getLeadSourceCounts()`). "More" expands to show all remaining sources plus an "+ Add new" option that creates a new lead source inline (no free-text field — preserves Zoho picklist integrity).

**Data integrity:** All chip values map 1:1 to Zoho picklist values. No free-text input allowed — new sources must be added via "+ Add new" which writes to `LEAD_SOURCES` constant (admin panel manages this in future; for V1 it edits the constant directly).

Configurable via admin panel (planned).

### 4.3 Activity Types

| Type | Manual Log | Auto-Sync (V2) |
|---|---|---|
| Call | Yes | Zoho Telephony |
| Email | Yes | O365 Sync |
| Meeting | Yes | No |
| Note | Yes | No |
| Text Message | Yes | No |
| LinkedIn Message | Yes | No |
| WhatsApp | Yes | No |
| Stage Change | Auto on stage change | N/A |
| Document Sent | Yes | No |
| Document Received | Yes | No |
| Reassignment | Auto on rep change | N/A |
| Prospect Added | Auto on prospect creation | N/A |
| Commitment Set | Auto when Next Action is set or changed | N/A |

"Prospect Added" is a system-generated activity automatically created when a new prospect is saved (`createPerson()` in the data service). It timestamps the start of the relationship and ensures the timeline is never empty. It is never manually creatable.

"Commitment Set" is system-generated whenever a Next Action is created or changed via the post-activity prompt, post-stage-change prompt, or Next Action Bar edit mode. It is never manually creatable. It captures a snapshot of the commitment (Type, Detail, Due Date) and carries the close-out lifecycle defined in Section 5.9. "Commitment Set" is excluded from Days Since Last Touch calculation — it is an audit marker, not an interaction.

Configurable via admin panel.

### 4.4 Other Picklists

- **Entity Type:** LLC, LLP, Trust, Individual, Corporation, Other
- **Lost/Dead Reason:** Not Accredited, Not Interested, Ghosted, Timing, Went Elsewhere, Other
- **Track:** Maintain, Grow
- **Organization Type:** Family Office, Wealth Management, Corporate, Individual/None
- **Contact Type:** CPA, Attorney, Wealth Advisor, Spouse, Existing Investor, Other
- **Funding Entity Status:** Active, Pending Setup, Inactive
- **Related Contact Role:** CPA, Attorney, Wealth Advisor, Spouse, Co-Decision Maker, Other

---

## 5. Business Logic & Automations

### 5.1 Stale Flag & Overdue Flag (Computed Live)

Both flags are computed on every page load from activity and commitment data. No scheduled batch job needed — always accurate.

**Overdue logic:** `EXISTS (open commitment with dueDate <= today) AND stage is active (not Nurture/Dead/Funded)`

A prospect is overdue if and only if there is at least one commitment still in `open` status with a due date on or before today. Commitments in `fulfilled`, `superseded`, or `cancelled` terminal states do not contribute to the overdue flag. This is the key guarantee of Section 5.9: the dashboard tells the truth about what Chad still owes.

**Stale logic:** `daysIdle >= stageThreshold AND NOT hasFutureOpenCommitment AND stage is active (not Nurture/Dead/Funded)`

Where `hasFutureOpenCommitment` = there exists at least one open commitment with `dueDate > today`.

**Key rule:** A future-dated open commitment suppresses the stale flag. Marcus Johnson at 12 days idle with a March 1 open commitment is NOT stale. No open commitment at all does NOT suppress — if there is nothing scheduled and idle time exceeds threshold, the record is stale.

A prospect can be simultaneously stale and overdue (multiple commitments), or touched today and still overdue (touched via an unrelated activity that did not fulfill the open commitment — see Scenario B in Section 5.9).

### 5.2 Days Since Last Touch (Computed Live)

Calculated as the number of days since the most recent *real interaction* Activity Log entry for a prospect. **Excludes** Activity Type = "Stage Change", "Reassignment", "Prospect Added", and "Commitment Set" — these are audit trail entries, not engagement signals. Only calls, emails, meetings, notes, texts, LinkedIn, WhatsApp, and document activities count as touches. Computed on display, not stored.

### 5.3 Stage Change Auto-Log

When a prospect's stage changes, the system automatically creates an Activity Log entry:
- Type: Stage Change
- Detail: "Stage updated from [Old] to [New]"
- Date: today
- Logged By: current user

**Post-stage-change prompt:** After the stage change confirms, a contextual inline prompt appears showing the fields most likely to need updating: Next Action Type, Next Action Detail, Next Action Date, and Investment Target — pre-filled with current values. User can confirm with one click (Enter) if nothing changed, or update inline. This prevents the "advanced the stage but forgot to update the plan" drift that kills CRM data quality within weeks.

### 5.4 Funded Transition Flow

When stage → Funded, an inline form appears within the stage picker (no modal). Always creates a new entity — no "select existing" path.

**Design decision:** Every funding event creates a new Funding Entity record. Existing entities linked to the prospect remain visible in the Relationships section for reference but are not reused in this flow.

**Form fields:**
- Entity Name (required, text)
- Entity Type (required, select: LLC, LLP, Trust, Individual, Corporation, Other)
- Amount Invested (required, currency)
- Investment Date (date, default today)
- Track (Maintain / Grow)
- Growth Target (currency, only shown if Track = Grow)

**On confirm (sequential):**
1. Creates Funding Entity record linked to the prospect
2. Creates Funded Investment record linked to the new entity + prospect (Next Check-In Date auto-set to +90 days)
3. Stage moves to Funded

### 5.5 Nurture Re-engagement

When stage → Nurture, Re-engage Date is required. On that date, the prospect automatically appears in the "Today's Actions" widget: "Re-engage: [Name] — parked since [date]."

### 5.6 Rep Reassignment (Admin Only)

Only Admins (Eric, Efri) can change the Assigned Rep on a prospect. This is intentionally restricted to prevent confusion about ownership.

**When Assigned Rep changes:**
1. System auto-logs an Activity: Type = "Reassignment", Detail = "Reassigned from [Old Rep] to [New Rep]", Logged By = admin who made the change
2. The post-change prompt fires showing Next Action Type, Detail, and Date — admin confirms or updates on behalf of the new rep
3. All existing data stays intact: activity history, next action, stage, relationships — nothing is lost or reset
4. The prospect immediately appears on the new rep's dashboard. The "New" badge shows if the new rep hasn't logged activity on this prospect yet.
5. The old rep loses ownership but can still view the prospect (per their role permissions). If they were a Collaborator, that remains.

**Reassignment does NOT:**
- Reset Days Since Last Touch (Reassignment is excluded from touch calculation)
- Change the pipeline stage
- Remove Collaborators
- Delete or modify any activity history

### 5.8 Auto-Created "Prospect Added" Activity

When a new prospect is created (via `POST /api/persons` → `ds.createPerson()`), the system automatically creates an Activity Log entry:
- **Type:** Prospect Added
- **Detail:** "Prospect added to pipeline"
- **Date:** today
- **Logged By:** current user
- **Source:** Manual

This guarantees every prospect has at least one activity from day one. It means:
1. The timeline is never empty
2. "Days Since Last Touch" starts from creation, not null
3. The post-creation "What's Next?" prompt has context without being fed stale data
4. Next Action prompt always makes sense (there's always a preceding event to reference)

### 5.9 Commitments & Close-out Lifecycle

**Problem being solved:** Historically, the Next Action fields on Person were a forecast — they told you what Chad *said* he'd do next, but not whether he actually did it. If Chad logged a new activity and hit Enter through the prompt, the old Next Action would be silently overwritten with no record of whether the prior commitment was fulfilled, forgotten, or superseded. Dashboard overdue flags could clear simply because Chad logged a note, even if the note had nothing to do with the outstanding commitment.

**The model:** A commitment is a first-class, auditable event. Every time a Next Action is set or changed, the system writes a `Commitment Set` activity that carries a snapshot of the Type, Detail, and Due Date. This activity starts in `open` status and moves to a terminal state (`fulfilled`, `superseded`, `cancelled`) through explicit user action.

**When Commitment Set entries are written (auto):**
- After the Quick Log post-activity Next Action prompt is confirmed (any path that results in a new or replaced commitment)
- After the post-stage-change prompt is confirmed
- When Next Action is edited via the Next Action Bar (EditNextAction component)
- When a prospect is created with a Next Action already set (Create Prospect flow)

**When Commitment Set entries are NOT written:**
- When Chad hits Enter through the post-activity prompt *without changing anything* — this is a no-op. The existing open commitment stays open.
- When the close-out path is `P Still pending` (see close-out flow below) — no new commitment, the old one stays open.

**Commitment status lifecycle:**

| Status | Meaning | How it's set |
|---|---|---|
| `open` | Active commitment, still owed | Initial state when Commitment Set is created |
| `fulfilled` | Completed by a specific activity | User picks `F Fulfilled` in close-out prompt; the fulfilling activity's `fulfillsCommitmentId` is set to this commitment |
| `superseded` | Explicitly replaced without being fulfilled | User picks `R Replace` in close-out prompt, or edits Next Action via the Bar while an open commitment exists |
| `cancelled` | Lead dropped before commitment was completed | Stage changes to Dead or Nurture while this commitment is open |

Every status transition stamps `Commitment Closed Date` to today.

**Close-out prompt (triggers after Quick Log save if there is an open commitment with `dueDate <= today`):**

Before the standard Next Action prompt, a close-out step appears:

```
⚠ Outstanding: Follow up — Q3 deck — due Mar 5 (2d overdue)

   [F] Fulfilled — this activity handled it
   [P] Still pending — logging something unrelated, commitment stays open
   [R] Replace — drop this, set a new one
```

- **F Fulfilled:** the just-saved activity's `fulfillsCommitmentId` is set to the open commitment; commitment → `fulfilled`; flow proceeds to standard Next Action prompt (set the next commitment).
- **P Still pending:** no link, no status change; flow skips the Next Action prompt entirely and goes straight to the success banner. The open commitment stays open and the prospect remains overdue on the dashboard — this is the honest representation of "Chad logged a side note but still owes the prior commitment."
- **R Replace:** open commitment → `superseded`; flow proceeds to the Next Action prompt with the Date field empty and required (user must actively choose a new due date — no carrying over an already-abandoned date).

**When the close-out prompt does NOT fire:**
- No open commitment exists (fresh prospect, or every commitment is already terminal) → straight to standard Next Action prompt
- Open commitment exists but `dueDate > today` → straight to standard Next Action prompt (no need to close out a commitment that isn't due yet; confirming through the Next Action prompt with no changes is a no-op and the commitment stays open and future-dated)

**Multiple open commitments:** Rare but possible (e.g., admin reassignment without close-out, or historical data). If more than one open commitment exists at close-out time, the prompt lists them all and the F/P/R choice applies per commitment in a single step (stacked list, keyboard-navigable). Default: all → P Still pending. This stays a degenerate edge case; the normal working pattern is one open commitment at a time.

**Commitment Set is hidden from Days Since Last Touch** — it's an audit marker, not an interaction. Days Idle is still driven by real outreach activities.

**Commitment Set appears on the timeline** as a small inline event with a ◉ glyph, styled like Stage Change markers (de-emphasized but always visible). Activities that fulfill a commitment render an explicit link underneath: *"✓ Fulfilled: [Commitment Type] — [Detail] (Nd late/on time)"*. Still-open and cancelled/superseded commitments also render their current status inline.

**Interaction with Drop Lead (Section 5.10):** When a lead is dropped from the post-activity prompt, any open commitments are automatically marked `cancelled` (not `superseded` — cancelled conveys "the whole relationship ended," superseded conveys "I chose a different next action"). On resurrection, cancelled commitments stay cancelled — they do not come back to `open`.

### 5.10 Drop Lead from Post-Activity Prompt

**Problem being solved:** Today, marking a lead Dead (or Nurture) requires abandoning the Quick Log flow, navigating to Person Detail, using the stage bar, picking a Lost Reason, and then dismissing a second post-stage-change prompt. For a lead that said "not interested" during the call Chad just logged, this is ~8 clicks and two separate prompts.

**The flow:** Inside the post-activity Next Action prompt, a small secondary link is always visible: *"Drop lead ▸"*. Clicking it expands an inline panel in place (no modal, no navigation):

```
Drop lead:  [ Dead ]  [ Nurture ]
```

- **Dead path:** click opens inline Lost/Dead Reason chips (6 values from §4.4) plus an optional note field → Confirm.
- **Nurture path:** click opens a Re-engage Date quick-pick (§6.9 date chips) → Confirm.

**On confirm:**
1. Stage changes to Dead or Nurture (auto-logs Stage Change activity — existing behavior from §5.3)
2. `nextActionType`, `nextActionDetail`, `nextActionDate` are cleared on the Person record
3. Any open commitments for this person are marked `cancelled` (see §5.9)
4. The post-stage-change prompt is **suppressed** on this path — Chad already knows there is no next action because the whole point of dropping the lead is that there is nothing next
5. Success banner: *"Marked Dead — history preserved. Resurrect anytime from the stage bar."*
6. Page reloads to the dashboard or pipeline view (not Person Detail — the lead is gone from the active view, no reason to stay on it)

**Resurrection:** Unchanged from today. Navigate to Person Detail via the People Directory (filtered for Dead/Nurture) and use the stage bar to move back to an active stage. All activity history, including cancelled commitments, remains intact for context.

**Keyboard:** On the Next Action prompt, `Esc` or `Tab → D` enters Drop mode. Reason chips are keyboard-navigable. Full flow from "finished logging activity" to "lead marked Dead" should be achievable in under 5 keystrokes.

### 5.7 Zoho-Side Automations (IT Checklist)

These run in Zoho, not in the frontend:
- Daily overdue email to Chad (7 AM CT) — prospects where Next Action Date < today
- Funded alert email to Eric — triggered when stage changes to Funded

---

## 6. Views & Screens

### 6.1 Routes

| Route | View | Users | Purpose | Status |
|---|---|---|---|---|
| `/` | Chad's Daily Dashboard | Chad, Ken | Morning briefing | ✅ Built |
| `/pipeline` | Pipeline View | Chad, Ken | Full workhorse table | ✅ Built |
| `/person/[id]` | Person Detail | Chad, Ken | Edit record, log activity | ✅ Built |
| `/people` | People Directory | All | Search all people (prospects, contacts, referrers) | ✅ Built |
| `/leadership` | Leadership Dashboard | Eric, Efri, Ken (partial) | AUM, funnel, source ROI. Ken sees Source Attribution + Top Referrers only. | ✅ Built |
| `/admin` | Admin Panel | Eric, Efri | System configuration | ✅ Built (Users, Lead Sources, Stages, Activity Types, Settings tabs) |
| `/login` | Login | All | Auth gate | ✅ Built |

**Mobile "Search" tab** maps to `/people` — a global search overlay that searches across all People regardless of role.

### 6.2 Chad's Daily Dashboard (`/`)

> **Implemented design:** Cockpit redesign (2026-03-17). See `docs/superpowers/specs/2026-03-17-dashboard-cockpit-redesign.md` for full rationale.

**Last Viewed Bar (persistent, all screens):**
Compact bar at the top of every screen: `Last: Robert Calloway · Active Engagement · 📞 Quick log...`
Shows the most recently viewed prospect. Tapping the Quick Log area focuses the text field — Chad can log an activity without navigating back to the prospect's detail page. Tapping the name opens Person Detail. On mobile, this bar is especially critical — it eliminates the "find the prospect I just called" step. Resets when Chad views a different prospect. (Implemented separately at layout level — not part of Dashboard component.)

**Header Bar:**
- Page title "Dashboard" on the left
- Two action buttons on the right:
  - **"+ Prospect"** — outlined/secondary pill button, opens Create Prospect slide-out sheet
  - **"Log Activity"** — gold pill button (primary CTA), opens Quick Log slide-out sheet with prospect search/autocomplete as first field. Once a prospect is selected, their activity timeline (reverse-chronological, with relative timestamps matching Person Detail style) appears in the lower half of the sheet — so Chad has full context before logging. Timestamps shown as "Today at 2:30 PM", "Yesterday at 10:15 AM", etc.
- On small screens, button labels condense to compact text
- Keyboard shortcuts: `N` for new prospect, `L` for quick log

**Hero Card (Zone 1 — #1 priority):**
The single most important action Chad needs to take right now, determined by priority logic (see below).
- **Name**: large, semibold, navy — most prominent element
- **Context line**: company, stage badge, dollar amount — secondary, muted
- **Next action detail**: displayed as a clear instruction
- **Urgency tag**: bottom-left — red "Overdue Xd" pill or neutral "Due today" pill
- **"Open →"**: bottom-right, links to `/person/[id]`
- **"New" badge**: gold "New" pill if prospect was created by someone other than assigned rep within 24h and rep hasn't logged activity yet
- **Empty state**: calm green — "All caught up. Next action is [Name] on [date]."

**Action Items Queue (Zone 2 — everything else, ranked):**
Unified list replacing the former "Today's Actions" and "Needs Attention" sections. Compact ranked rows — no table headers.

Each row shows:
- Rank number (left anchor)
- Name — semibold, navy, clickable → `/person/[id]`
- Stage badge (small)
- Dollar amount (tabular nums)
- Urgency tag — red "Overdue Xd" or neutral "Due today"
- Next action detail — muted, truncated
- "New" badge if applicable

**Overflow:** shows first 8 rows. "Show N more" link expands full list.

**Priority logic (deduplicated by person ID):**
1. Overdue items first — most overdue first, dollar value as tiebreaker
2. Stale-but-not-overdue — days idle descending
3. Due today — dollar value descending
4. Nurture re-engage — prospects in Nurture where Re-engage Date = today

**What was dropped vs. original spec:**
- "Today's Momentum" bar (felt like surveillance) — removed entirely
- "Today's Actions" / "Needs Attention" as separate sections — merged into unified Action Items queue
- Today/Tomorrow/This Week date toggle — cockpit shows overdue + today only; upcoming days accessible via Pipeline view
- Collaborating section — cockpit is owner-only action list; collaborating prospects remain in Pipeline view

**Stats Footer (Zone 3):**
Single horizontal bar at the bottom — 4-column grid, label stacked above value:
```
Pipeline: 10  │  Value: $3.4M  │  Committed: $1.1M  │  Funded YTD: $850K
```
- Stats definitions unchanged: Active Pipeline Count, Pipeline Value, Committed (Soft Commit → KYC stages), Funded YTD (from Funded Investment records)

**Recent Activity (future release — collapsible, collapsed by default):**
> Deferred to a future release.
- Reverse-chronological feed of all activities across all prospects, last 7 days
- Columns: Date/Time, Person (linked), Activity Type, Outcome, Detail (truncated), Logged By
- Filterable by rep (Admin sees all, rep defaults to own)
- Serves three purposes: Chad's end-of-day "did I miss anyone?" check, Eric's lightweight oversight without micromanaging, and onboarding context for a new rep inheriting relationships

### 6.3 Pipeline View (`/pipeline`)

Full sortable table of all active pipeline records (excluding Nurture and Dead).

**Columns:** Name, Company, Stage, Initial Investment ($), Growth Target ($), Lead Source, Touches (activity count), Days Idle, Next Action, Next Action Date, Stale Flag (icon)

**Filters (bar above table):** Stage dropdown, Source dropdown, Stale Only toggle, Rep filter

**Default sort:** Next Action Date ascending (most urgent first)

**Sorting:** Click any column header to sort. Visual indicator for active sort column + direction.

**Row click:** Opens `/person/[id]`

**Pinned Prospects (future release):**
Considered for a future release. Chad can pin up to 10 prospects to the top of Pipeline View (star icon on each row). Pinned prospects always appear above the separator line regardless of sort order or filters. One click to pin/unpin. Pin state is per-user (stored in user preferences, not on the prospect record).

**Inline row actions (✅ Built 2026-03-19)** — appear on hover (desktop):
1. **Quick Log** — compact inline text input opens directly below the row. Type, Enter, confirm Next Action, done. User never leaves Pipeline View. Identical behavior to Person Detail Quick Log (including smart prefix detection, outcome detection, and the Next Action prompt). Component: `components/pipeline/inline-quick-log.tsx`.
2. **Advance Stage** — one-click to move to the next sequential stage (e.g., Pitch → Active Engagement). Fires confirmation dialog. For non-sequential moves (Nurture, Dead, skip stages), user must open Person Detail.

**Design notes:**
- Dollar amounts right-aligned, formatted with $ and K/M abbreviation
- Next Action and Next Action Date must be visible on every row — these are Chad's primary navigation tool
- Stale/overdue indicators visually prominent (red dot or highlight)

### 6.4 Person Detail (`/person/[id]`)

Two-zone layout: a fixed **Cockpit** (always visible, never scrolls off) and a scrollable **Detail Zone** below it. Chad lives in the cockpit — it contains everything he needs for a call. The detail zone is the filing cabinet for occasional reference and editing.

**Responsive two-column layout (✅ Built 2026-03-19):** On desktop/tablet (`lg+`), the Detail Zone splits into two columns:
- **Left column** (flex): Profile Card + Activity Timeline — the working data Chad actively uses
- **Right column** (300–340px): Relationships + Background Notes — reference data visible at a glance without scrolling

On mobile, the layout collapses to a single column (Profile → Timeline → Relationships → Notes) to keep the one-handed experience clean.

#### Cockpit (Fixed Top Zone) — order of sections

**6.4.1 Identity Bar**
Name (large, semibold), Organization (linked, muted), Stage badge (color-coded), Investment Target, Stale indicator (red dot if stale).

**Phone and email are prominently shown in the Identity Bar** — not buried in a scrollable profile section. Chad needs this information to act immediately when he opens a prospect. Format: phone number with click-to-call icon, email address with click-to-email icon.

**Click-to-call (📞):** Next to phone number. With Zoho provider: triggers Zoho PhoneBridge API to place the call (see Section 13 Phase 3). With mock provider: opens `tel:` link (native phone dialer on mobile, system default on desktop). Both create a Call activity entry.

**Click-to-email (✉️):** Next to email. Opens `mailto:` link. User manually logs the activity or it's captured via O365 sync (Zoho provider).

**Inline editing:** Phone and email are editable inline — tap the field → edit → save. No separate edit page.

**6.4.2 Quick Log** *(primary action zone — moved up, directly after Identity)*
Prominent area with gold border and "LOG ACTIVITY" label. Single text input, type and hit Enter:

```
💬 Called [Name], discussed... [↵ Enter]
```

Placeholder uses the person's name so it feels contextual, not generic.

- **Smart prefix detection** (`lib/smart-detection.ts`) — activity type auto-detected from first word of text:
  - `Called...` / `Spoke with...` → Call
  - `Emailed...` / `Sent email...` → Email
  - `Met with...` / `Meeting...` → Meeting
  - `Texted...` → Text Message
  - `LinkedIn...` → LinkedIn Message
  - `Sent deck...` / `Sent doc...` → Document Sent
  - Anything else → Note (default)
  - Type badge updates in real-time. One tap to override if wrong.
- **Smart outcome detection:** Auto-sets Outcome to "Attempted" if text contains "voicemail," "no answer," or "no response." Connected is default.
- Date defaults to today (auto-captured — time input not shown in quick log)
- **"More options"** expands 3 fields only: Activity Type (override), Outcome (Connected/Attempted — only shown for outreach types: Call, Email, Text, LinkedIn), Date. Time is always auto-captured. Outcome toggle is hidden for Note, Meeting, Document types.
- After submit: Days Since Last Touch resets, Next Action prompt appears

**Post-activity flow (continuous, no navigation):**

After Quick Log submit, a sequence of up to three inline steps replaces the Quick Log area. The fast path is unchanged from before — Enter through — for the common case of no outstanding commitment.

**Step 1 — Close-out prompt (conditional, only fires if there is an open commitment with `dueDate <= today` — see §5.9):**

```
⚠ Outstanding: Follow up — Q3 deck — due Mar 5 (2d overdue)

   [F] Fulfilled — this activity handled it
   [P] Still pending — logging something unrelated, commitment stays open
   [R] Replace — drop this, set a new one
```

- `F` links the just-saved activity to the commitment and marks the commitment `fulfilled`, then continues to Step 2
- `P` leaves the commitment untouched and open (dashboard stays honestly overdue), then skips straight to Step 3 (success banner) — no new commitment is set
- `R` marks the commitment `superseded`, then continues to Step 2 with the Date field cleared

**Step 2 — Next Action prompt (skipped only if user chose `P Still pending` in Step 1):**

```
Next action? [Follow Up ▾] [                    ] [Tomorrow ▾]  [✓ Confirm]
                                          [↑ Advance to Active Engagement?]   [Drop lead ▸]
```

1. **Next Action prompt:** Detail field starts *empty* with the old value as gray placeholder text (not pre-filled as editable text). Cursor begins at the start of the field. If user confirms without typing, the old value is preserved as-is (and a new `Commitment Set` activity is written — the old commitment was already closed out in Step 1, or there was no open commitment to begin with). If the user arrived via `R Replace` in Step 1, the Date field is empty and required.
2. **Advance Stage shortcut:** "Advance to [Next Stage]?" — styled as a clearly clickable gold underline link, `text-sm` (not tiny). One tap → stage advances.
3. **Drop lead shortcut:** "Drop lead ▸" link opens the inline Drop panel (see §5.10). Dead or Nurture, inline Lost Reason or Re-engage Date, Confirm. Skips Step 3's standard banner in favor of a "Marked Dead" banner.

**Step 3 — Success state:** After confirming (or after Step 1 `P Still pending`), a green "Activity logged" success banner shows for 1.5 seconds, then the page reloads to reflect the new state (updated timeline, updated next action, updated commitment statuses, updated stage if changed).

4. **Post-confirm state summary:** Shown briefly in the success banner area: stage, next action (or "No next action — lead dropped"), days since last touch, outstanding commitments count. Gives visual reassurance that the update worked.

**6.4.3 Next Action Bar** *(after Quick Log)*
Displays current Next Action Type + Detail + Date. When overdue or stale, a red urgency banner appears *above* the gold Next Action card. Editable via a separate edit mode component (EditNextAction) that uses a muted background container so white inputs contrast clearly. Date input uses quick-pick chips (see Section 6.9). "Advance to next stage?" shown as text-xs link.

*Note: "Recent Snapshot" (last 3 activities) was removed — it duplicated the timeline and added visual clutter. The full timeline is immediately below the cockpit.*

#### Detail Zone (Scrollable Below Cockpit)

**6.4.5 Activity Timeline**
Full reverse-chronological list of all Activity Log entries. Vertical 2px timeline line connects all activity dots.

**Entry anatomy (3 layers):**
1. Activity type + date (bold)
2. Detail text
3. Metadata: who logged it, outcome (if Attempted), source (if auto), documents

Colored dot communicates type — no badges on entries.

**Stage changes** render as small inline markers on the timeline line (not full-width dividers):
```
─── Pitch → Active Engagement · Feb 5, 2026 ───
```

**Reassignments** render as small inline markers:
```
─── Reassigned: Chad → New Rep · Mar 15, 2026 ───
```

**Commitment Set entries** (see §5.9) render as small inline markers with a ◉ glyph. They always show the commitment type, detail, and due date, and — once terminal — the status badge:
```
◉ Commitment set · Follow up · Q3 deck · due Mar 5
◉ Commitment set · Follow up · Q3 deck · due Mar 5 · ✓ fulfilled (2d late)
◉ Commitment set · Follow up · Q3 deck · due Mar 5 · ↺ superseded
◉ Commitment set · Follow up · Q3 deck · due Mar 5 · ✕ cancelled
```

**Fulfillment links on activities** — when an activity was used to fulfill a commitment, its entry shows a small green fulfillment line directly underneath:
```
📧 Email · Mar 7
   "Sent Q3 deck with annotations."
   ✓ Fulfilled: Follow up — Q3 deck (2d late)
```

**Still-open commitments** that have become overdue render with an additional urgency line below the Commitment Set entry when viewed in the timeline on the date they go past due:
```
◉ Commitment set · Follow up · Q3 deck · due Mar 5
   ⚠ Still open as of today (Nd overdue)
```

Stage changes, reassignments, and commitment events always show regardless of active filter — they form the backbone of the relationship narrative. Only the interaction filter pills (Calls, Emails, Meetings, Notes) hide non-matching interaction entries.

**Filter pills above timeline (5 pills, reduced from 8):**
```
[All] [Calls] [Emails] [Meetings] [Notes]
```

**Documents:** Shown inline as paperclip icon + "N files" count. Click to expand document list. Document names are clickable — Zoho provider returns attachment URLs from Zoho attachment API. Mock provider shows file names without URLs.

**6.4.6 Stage Progression Bar**
Visual 9-step pill selector, current stage highlighted in gold. Each stage pill is equal width — symmetric layout, no wrapping grid (which creates misaligned rows). Scrollable horizontally on mobile. Click a stage → confirmation dialog → auto-logs Stage Change activity → fires post-stage-change prompt. Nurture and Dead shown as separate actions (not in the bar).

**Design rule:** All 9 active stage pills must be visually identical except for the active highlight. Equal-width, same height, same border-radius. The current stage gets gold background + navy text; all others are muted outline pills.

**6.4.7 Organization Section**
Linked Organization (if any). Fully editable inline:
- If no org linked: shows search input with autocomplete-or-create. Pressing Enter on a typed name creates a new organization instantly.
- If org is linked: shows org name with an "×" remove link. Remove link shows the org name ("Remove [Org Name]") so Chad knows what he's unlinking.
- Shows other prospects in the same org for context.

**6.4.8 Funding Entities Panel**
List of linked entities (name, type, status). Fully editable inline:
- Add button opens inline form (Entity Name, Entity Type) — no modal.
- Each entity shows name + remove link.
- Funding entities are 1:1 per person — two different prospects may have entities with the same name (they are separate records, not shared). The Zoho module stores `Person` as a lookup field, making them distinct records.
- Nudge message at Commitment Processing / KYC if empty. Not required until Funded transition.

**6.4.9 Related Contacts Panel**
List of related people (name, role, company, phone/email). Add uses autocomplete-or-create from the unified People pool. Same person can appear as Related Contact on multiple prospects.

**6.4.10 Referrer**
Single field showing who referred this prospect. Fully editable inline:
- If no referrer: shows people search input (autocomplete from all People in the system). Selecting a person links them as referrer — if they don't exist yet, "Create new contact" option adds them.
- If referrer linked: shows referrer name with a remove link.
- Shows referrer's other referrals for context.
- Same person can be both a Referrer and a Prospect (unified People model).

**6.4.11 Background Notes**
Collapsible section, visually de-emphasized. For static context only: accreditation details, personal interests, family situation, preferences. Placeholder text: *"Background context — use Quick Log for activities."* Intentionally positioned and styled to prevent misuse as an activity log substitute.

**6.4.12 Prospect Fields (Editable)**
All prospect fields available for inline editing. Fields editable directly on Person Detail:
- **Phone** — inline edit, tap to edit (also shown in Identity Bar)
- **Email** — inline edit, tap to edit (also shown in Identity Bar)
- **Investment Target** — inline currency edit
- **Growth Target** — inline currency edit
- **Committed Amount** — inline currency edit
- **Lead Source** — chip picker (see Section 4.2)
- **Organization** — see Section 6.4.7
- **Referrer** — see Section 6.4.10
- **Funding Entities** — see Section 6.4.8

Assigned Rep is visible but only editable by Admins (see Section 5.6). Collaborators and Lost/Dead Reason are visible but editing is lower priority (may require separate form).

### 6.5 Leadership Dashboard (`/leadership`)

> **Status: ✅ Implemented** (2026-03-18). See `docs/superpowers/specs/2026-03-18-leadership-admin-design.md` for the approved design spec.

Eric's view. Read-only. Roles allowed: `marketing`, `admin`, or any user with `canViewLeadership` permission override.

**Layout:** Two-column grid — 115px stat column on the left, right panel occupying the rest. Max-width 720px, centered.

#### Stat Column (left)

Six stacked KPI cards, each clickable to open a drill-down slide-out sheet (right side):

| Card | Value | Drill-down |
|---|---|---|
| AUM Raised | Sum of all FundedInvestment.amountInvested | All funded investors (all-time): name, funded amount, sorted by most recent investment date |
| Fund Target | Progress bar toward fund target (configurable in Admin → System Settings, default $10.5M) | Same as AUM Raised (all funded investors) |
| Funded YTD | Count of FundedInvestments in current calendar year | Funded investors this year only, sorted by most recent investment date |
| Active | Count of prospects in active pipeline stages | Active prospects grouped by stage in reverse funnel order (KYC/Docs first → Prospect last), with stage headers and counts |
| Pipeline Value | Sum of initialInvestmentTarget for active prospects | Same grouped list as Active |
| Meetings | Count of meeting-type activities (7d/14d/30d toggle) | Meeting list: prospect name, date, detail |

The Meetings card has a `7d / 14d / 30d` pill toggle; selected period highlighted in gold, default 30d. **The count updates live** when toggling periods — client-side fetch to `/api/leadership/meetings?days=N`.

**Drill-down amount display:** Funded investor drill-downs show actual `fundedAmount` (sum of FundedInvestment records) with a "funded" label. Active pipeline drill-downs show `initialInvestmentTarget` with a "target" label. This prevents confusion between verbal targets and actual funded amounts.

#### Right Panel: Pipeline Funnel

Tapering funnel. One row per active pipeline stage (in order) plus Funded row at the bottom.

- Each row: gold background (fading lighter per stage), stage label + count + sum of targets
- Width narrows per stage: 100% → 90% → 78% → ... → 30%; Funded row is green
- Chevron separators between rows
- All rows clickable → drill-down sheet with prospects in that stage

#### Right Panel: Source ROI Table

Columns: Source, Prospects, Funded, AUM, Conv%. Sorted by AUM descending. Click a row → drill-down sheet with all prospects from that source.

#### Drill-down Sheet

Standard `Sheet` component slides in from the right. Shows header context label ("Pitch · 2 prospects") and a list of prospects or activities with clickable links to `/person/[id]`.

**Active Pipeline drill-down** groups prospects by stage in reverse funnel order (bottom-of-funnel first: KYC/Docs → Commitment Processing → ... → Prospect). Each group has a stage header with count. **Funded drill-downs** sort by most recent investment date (newest first) and show actual funded amounts.

**All original spec intent now implemented (2026-03-19):**
- ✅ Fund target configurable via Admin → System Settings (default $10.5M)
- ✅ Top Referrers panel (`components/leadership/top-referrers.tsx`)
- ✅ Red Flags panel — stale/overdue prospects at a glance (`components/leadership/red-flags.tsx`)
- ✅ Ken partial-access view — marketing role sees Source Attribution + Top Referrers only

### 6.6 People Directory (`/people`)

Global search and browse for all people in the system — prospects, referrers, related contacts, funded investors.

**Back to Dashboard link** at top of page — "← Dashboard" link returns to `/`.

**Search bar** at top — fuzzy search by name, company, email, phone.

**Results** show: Name, Roles (badges), Organization, Contact Type/Company (if external contact), Stage (if prospect). Click → `/person/[id]`. **Sorted alphabetically by name.**

**Filters:** Role (Prospect, Referrer, Related Contact, Funded Investor). **Default filter: Prospects** (most commonly used view — Chad primarily works with prospects). Organization filter deferred to future release.

On mobile, this is the "Search" tab in the bottom navigation. Opens as a full-screen search with large tap targets.

### 6.7 Create Prospect Flow

**Entry points:**
- Dashboard header "**+ Prospect**" button → opens slide-out sheet (not a separate page)
- Pipeline View (top-right of filter bar)
- Keyboard shortcut `N` from Dashboard or Pipeline View

Visible only to users with "Create new prospect" permission.

**Implementation:** Slide-out sheet (`Sheet` component from shadcn/ui), not a separate route. Sheet opens from the right side of the screen.

**API:** `POST /api/persons` → `ds.createPerson()` — goes through data service layer.

**After creation:** A success screen appears within the sheet (does not auto-navigate). The success screen shows:
- "Prospect created!" confirmation
- Two clear options:
  1. **"Back to Dashboard"** — closes sheet, stays on dashboard
  2. **"Open Profile →"** — navigates to the new person's detail page

This gives Chad control: if he has more prospects to add, he stays on the dashboard; if he wants to flesh out the profile immediately, he jumps to it.

**Auto-created activity:** On creation, `ds.createPerson()` automatically logs a "Prospect Added" activity (see Section 5.8). This means the timeline is never empty and next action context is immediately available.

**Lead Source field:** Uses the chip picker UI (see Section 4.2) — visual chips, not a dropdown.

**Minimum viable form (one screen, no tabs):**

| Field | Required | Default |
|---|---|---|
| Full Name | Yes | — |
| Phone | No | — |
| Email | No | — |
| Lead Source | Yes | — |
| Next Action Type | Yes | "Follow Up" |
| Next Action Detail | Yes | — |
| Next Action Date | Yes | Tomorrow |
| Assigned Rep | Yes | Current user |

Pipeline Stage auto-sets to "Prospect." All other fields (Organization, Investment Target, etc.) are filled in later on Person Detail.

**Autocomplete-or-create fires on Full Name** — if a matching Person already exists, the system shows the match with a badge: "Already exists as [Referrer/Contact]" → selecting adds the Prospect role. This prevents duplicates at the point of entry.

If the creator is not the Assigned Rep (e.g., Ken creates and assigns to Chad), the "New" badge appears on Chad's dashboard immediately.

### 6.8 Admin Panel (`/admin`)

> **Status: ✅ Fully Implemented** (2026-03-19). Five tabs: Users, Lead Sources, Stages, Activity Types, Settings.

Role: `admin` only, or any user with `canAccessAdmin` permission override.

**Layout:** Page header "Admin", five tabs: **Users** | **Lead Sources** | **Stages** | **Activity Types** | **Settings**.

#### Users Tab (✅ Built)

Table columns: Name/username, Role badge, Status (Active/Inactive). Clicking a row opens an inline edit panel below (gold border highlight).

**Inline Edit Panel:**
- **Role Template** — pill selector: Rep / Marketing / Admin
- **Permission Overrides** — toggle switches with "Role default: on/off" label per permission:
  - Pages: Leadership Dashboard (`canViewLeadership`), Admin Panel (`canAccessAdmin`)
  - Actions: Reassign Prospects, View All Prospects, Mark Prospect Dead
- **Deactivate** — button at bottom; shows a "Reassign open prospects to:" picker before confirming if user has active prospects

#### Lead Sources Tab (✅ Built)

List of all current lead sources. Per-row controls:
- Inline label editing (click to edit, Enter to save)
- Active/Inactive toggle (hides from picker UI when inactive)
- Drag-to-reorder (persistent order used in chip picker)
- **+ New Lead Source** button at bottom: inline add form

#### Pipeline Stages Tab (✅ Built 2026-03-19)

Edit pipeline stage labels and idle thresholds. Each row: stage name, idle threshold (days), Edit button. Inline edit with Save/Cancel. Component: `components/admin/pipeline-stages-tab.tsx`.

#### Activity Types Tab (✅ Built 2026-03-19)

Manage activity types available in Quick Log. Each row: type name, active toggle, Edit button. System types (Stage Change, Reassignment) are locked. "+ Add" inline form at bottom. Component: `components/admin/activity-types-tab.tsx`.

#### System Settings Tab (✅ Built 2026-03-19)

- **Fund Target ($M)** — configurable, default $10.5M. Displayed on Leadership Dashboard progress bar.
- **Company Name** — configurable, default "OwnEZ Capital".
- Save button persists via `PATCH /api/admin/system-config`. Component: `components/admin/system-settings-tab.tsx`.

**Sections not yet built (planned):**
- Role Templates — define permission sets at the template level
- Data Hygiene — merge duplicates

### 6.9 Date Quick-Pick Chips

Everywhere a Next Action Date is entered — Quick Log prompt, post-stage-change prompt, Create Prospect form, inline pipeline edit, Person Detail — the date input shows quick-pick chips before the calendar:

```
[Today] [Tomorrow] [+3d] [Mon] [Fri] [+1w] [+2w]  📅
```

One tap, done. The calendar icon (📅) opens a full date picker for specific dates, but most of the time Chad never needs it. "Mon" and "Fri" resolve to the next upcoming Monday/Friday. Chips are contextual to CT timezone.

### 6.10 Keyboard Shortcuts (Desktop) — Future Release

> **Deferred to a future release.** The core loop below is the target design for when keyboard shortcuts are implemented.

The core loop — find, log, update, advance — should be achievable without touching the mouse.

| Shortcut | Action | Context |
|---|---|---|
| `/` | Focus global search | Any screen |
| `L` | Focus Quick Log input | Person Detail, Pipeline View (selected row) |
| `Enter` | Submit Quick Log → auto-focuses Next Action prompt | Quick Log |
| `Enter` | Confirm Next Action | Next Action prompt |
| `S` | Advance to next stage (opens confirmation) | Person Detail |
| `P` | Pin/unpin prospect | Pipeline View (selected row) |
| `↑` `↓` | Navigate rows | Pipeline View, Dashboard lists |
| `Enter` | Open selected row | Pipeline View, Dashboard lists |
| `Esc` | Back / dismiss prompt / close dialog | Any screen |
| `N` | Open Create Prospect form | Dashboard, Pipeline View |

**Full keyboard loop example:** `/ → robert → Enter → L → Called Robert, reviewed Q3 numbers → Enter → Enter → done.` Full activity log + next action update, zero mouse.

Shortcuts are discoverable via a `?` overlay (press `?` on any screen to see available shortcuts).

### 6.11 Last Viewed Bar (Global) — ✅ Built 2026-03-19

See Section 6.2 — the Last Viewed Bar is defined there as it appears on every screen. It persists across navigation: if Chad views Robert Calloway, then goes to Pipeline View, the bar still shows Robert with Quick Log access. This is the critical "I just hung up the phone" optimization.

**Implementation:** `components/last-viewed-bar.tsx` (renders the bar with inline Quick Log), `components/set-last-viewed.tsx` (sets localStorage on person detail visit). Integrated into `app/layout.tsx` above `{children}`. Persists via `localStorage` with `last-viewed-changed` event for cross-component sync.

---

## 7. Roles & Permissions

### 7.1 Role Templates

| Capability | Rep | Marketing | Admin |
|---|---|---|---|
| View all prospects/pipeline | Yes | Yes | Yes |
| Create new prospect | Yes | No | Yes |
| Edit prospect fields | Yes | No | Yes |
| Change pipeline stage | Yes | No | Yes |
| Reassign prospect rep | No | No | Yes |
| Log activity (all types) | Yes | Note + Doc Received only | Yes |
| Attach documents | Yes | Yes | Yes |
| Edit Next Action | Yes | No | Yes |
| View leadership dashboard | No | No | Yes |
| View Source Attribution & Referrer reports | No | Yes | Yes |
| Admin panel access | No | No | Yes |
| Manage users & roles | No | No | Yes |

### 7.2 Per-User Overrides

Admin can override any permission for a specific user. Example: Ken gets "Create new prospect" enabled because he's sourcing leads at events, even though the Marketing template defaults to No.

Overridden permissions show a visual indicator in the admin panel so Eric knows what's custom vs. inherited.

### 7.3 Collaborator Behavior

The Assigned Rep is the primary owner — responsible for Next Action. Collaborators are team members also involved in the relationship.

- **Dashboard:** Prospects where a user is a collaborator appear in a separate "Collaborating" section below Today's Actions (collapsed by default). They do NOT appear in the main Today's Actions or Needs Attention widgets — those are owner-only.
- **Pipeline View:** Filterable by "My Prospects" (owner), "Collaborating", or "All". Default is "All".
- **Permissions:** Collaborators have the same edit permissions as their role allows — being a collaborator does not grant or restrict anything beyond their role template + overrides.
- **Notifications:** Collaborators see stage changes and stale flags for their shared prospects, but are not responsible for resolving them.

### 7.4 Permission Storage

V1: User authentication (username/password/role) lives in the `USERS` env var. Permission overrides and role template definitions live in the **data layer** (mock provider stores them in memory alongside other data; Zoho provider stores them in a Zoho custom module or settings). This separation ensures:
- Auth concerns (who can log in) are in env config
- Authorization concerns (what they can do) are in the data layer where the admin panel can read/write them

---

## 8. Authentication

### 8.1 V1: Simple Login

- Users stored in environment variable: `USERS=chad:hashedpassword:rep,ken:hashedpassword:marketing,eric:hashedpassword:admin`
- Login screen: email/username + password
- Session: httpOnly encrypted cookie
- Middleware checks session on every route, redirects to `/login` if missing
- Role from session determines UI capabilities

### 8.3 User Menu & Logout (✅ Implemented 2026-03-19)

The session user is identified at the bottom of every screen — never hidden.

**Desktop sidebar (all screen widths ≥ md):**
Avatar row at the bottom of the sidebar. Shows initials circle + first name + chevron. Clicking opens a Base UI `Popover` above the row with full name, role badge, and "Sign out" button.

**Mobile bottom nav:**
A 4th tab in the mobile bottom navigation bar shows the user's initials. Tapping opens a `Sheet` from the bottom with full name, role badge, and "Sign out" button.

**Logout flow:** Both paths call `POST /api/auth/logout`, then redirect to `/login`.

**Components:**
- `components/sidebar-user-menu.tsx` — desktop avatar row + popover
- `components/sidebar-nav.tsx` — mobile MobileNav includes the 4th user tab + sheet
- Deleted: `components/logout-button.tsx` (logic inlined into the above)

### 8.2 V2 Migration: Zoho OAuth

**Prerequisites:**
- All users must have Zoho accounts
- Zoho OAuth application registered in Zoho API Console

**Migration steps:**
1. Register OAuth app in Zoho API Console (Server-based Application)
2. Configure redirect URI: `https://[production-domain]/api/auth/callback/zoho`
3. Set scopes: `ZohoCRM.modules.ALL`, `ZohoCRM.users.READ`
4. Implement NextAuth.js with custom Zoho provider:
   - Authorization URL: `https://accounts.zoho.com/oauth/v2/auth`
   - Token URL: `https://accounts.zoho.com/oauth/v2/token`
   - User info: `https://accounts.zoho.com/oauth/v2/userinfo` (OpenID)
5. Map Zoho user email to app user record → assign role
6. Store Zoho access token in session — reuse for API calls (no separate API credentials)
7. Implement refresh token rotation for automatic token renewal
8. Remove `USERS` env var and simple login route
9. Update middleware to check Zoho session validity

**Rollback plan:** Keep simple login code behind a feature flag during migration. If Zoho OAuth has issues, revert via env var `AUTH_PROVIDER=simple|zoho`.

---

## 9. Design Language

### 9.1 Aesthetic Direction

"Jony Ive meets Bloomberg Terminal" — institutional trust with radical simplicity.

Loosely derived from the OwnEZ brand (www.ownez.com):
- **Navy** (`#0b2049`) — sidebar/nav, headers
- **Gold** (`#e8ba30`) — sole accent color. If it's gold, you can interact with it. CTAs, active states, badges.
- **White/light gray** — workspace background
- **Red** (`#ef4444`) — exclusively for stale/overdue alerts
- **Green** — exclusively for "healthy" / funded indicators
- No other colors. Discipline.

### 9.2 Typography

One clean sans-serif (system or loaded). Tight, functional.
- Tabular/monospaced numbers for dollar columns — perfect alignment
- Tight tracking on large headings
- Generous line-height on body text

### 9.3 Principles

- **Whitespace creates hierarchy.** No borders where spacing alone works.
- **Every element earns its place.** If Chad can't tell what to do next in 2 seconds, the design has failed.
- **Gold = action.** Buttons, links, interactive elements. Everything else is informational.
- **Pill-shaped buttons.** Generous border-radius, matching OwnEZ website.
- **No hover-only information.** Everything critical is visible by default (touch-friendly).

---

## 10. Mobile Experience

### 10.1 Mobile-First Views

Two workflows are primary on mobile:

**1. Quick Log** — Chad logs an activity from his phone in <15 seconds:
- Open app → Last Viewed bar shows the prospect he just called → tap Quick Log
- Type note (smart prefix detects activity type) → Enter
- Confirm/update Next Action (date quick-pick chips for thumb-friendly selection) → Enter
- Done — 2 taps + 2 Enters, no searching required
- **Alternate path** if Last Viewed isn't the right prospect: Dashboard → tap prospect (or People tab → find prospect) → Quick Log

**2. Daily Cockpit** — Morning briefing on the go:
- Hero card — #1 priority prospect
- Action Items queue — who to call, in order
- Tap prospect → Person Detail: Quick Log is the first visible action zone

### 10.2 Mobile Layout

| Desktop | Mobile |
|---|---|
| Sidebar nav (180px left) | Bottom tab bar: Dashboard, Pipeline, People |
| Sidebar hidden | Main content full-width (no left margin) |
| Last Viewed bar (top) | Last Viewed bar (top, same behavior) |
| Pipeline table (10 columns) | Card list (name, stage, next action, stale dot, pin star) |
| Person Detail: 2-column cockpit grid | Single column on mobile |
| Person Detail: detail zone = 2 columns (left: profile+timeline, right: relationships+notes) | Single column on mobile (profile → timeline → relationships → notes) |
| Person Detail: cockpit + detail zone | Cockpit zone fills viewport, detail zone scrolls below |
| Dashboard header buttons: full text | Compact text on small screens |
| Dashboard action queue: single-row | Two-line layout on mobile (name+stage on line 1, urgency+detail on line 2) |
| Stats bar: horizontal | 4-column grid, label stacked above value |
| Date picker | Quick-pick chips (large tap targets) + calendar fallback |
| Full activity form | Quick log always visible, "More options" expands 3 fields |
| `px-8` page padding | `px-3 md:px-8` responsive padding on all pages |

**Global CSS:** Horizontal scroll disabled (`overflow-x: hidden` on body). All form inputs (input, select, textarea) forced to white background via `!important`. `--ring` CSS variable overridden to navy for form focus rings.

**Bottom tab bar:** Appears only on mobile (`md:hidden`). Three tabs: Dashboard (`/`), Pipeline (`/pipeline`), People (`/people`). Includes bottom padding on main content to prevent content hiding behind tab bar.

### 10.3 Not Mobile-Optimized

- Leadership Dashboard (desktop use case)
- Admin Panel (desktop only)
- Full prospect field editing (complex forms)

---

## 11. Autocomplete-or-Create Pattern

### 11.1 Where It Applies

| Entity | Autocomplete-or-Create | Admin Merge |
|---|---|---|
| Person (as Referrer) | Yes — searches all People | Yes |
| Person (as Related Contact) | Yes — searches all People | Yes |
| Person (as new Prospect) | Yes — if exists, offers "convert to prospect" | Yes |
| Organization | Yes — fuzzy match by name | Yes |
| Funding Entity | Yes — scoped to prospect's entities | Yes |

### 11.2 Behavior

1. **User types 2+ characters** → system shows matching existing entries (fuzzy match)
2. **Existing match:** click to select. Contact info pre-populated. Done.
3. **No match:** "Create new [entity]" option at bottom → inline form (name + key fields)
4. **Person already exists in different role:** system shows badge "Already exists as [Prospect/Contact]" → selecting adds the new role without duplicating

### 11.3 Fuzzy Matching

- Levenshtein distance for typo tolerance
- Case-insensitive
- Ignores common suffixes (LLC, Inc, Trust, LLP)
- Matches on first name, last name, or company

### 11.4 Admin Merge (Data Hygiene)

- Auto-detection of similar entries flagged in admin panel
- One-click merge: select canonical name, all linked records update
- Rename: global update cascades everywhere
- Merge history logged for audit

---

## 11.5 Smart Activity Detection (`lib/smart-detection.ts`)

Auto-detection reduces friction in Quick Log — Chad types naturally and the system infers type and outcome.

### Activity Type Detection (from first word/phrase of log text)

| Text starts with | Detected Type |
|---|---|
| "Called...", "Spoke with..." | Call |
| "Emailed...", "Sent email..." | Email |
| "Met with...", "Meeting..." | Meeting |
| "Texted..." | Text Message |
| "LinkedIn..." | LinkedIn Message |
| "Sent deck...", "Sent doc..." | Document Sent |
| Anything else | Note (default) |

Type badge updates in real-time as Chad types. One tap to override.

### Outcome Detection (from keywords anywhere in text)

| Keywords found | Detected Outcome |
|---|---|
| "voicemail", "no answer", "no response" | Attempted |
| Anything else | Connected (default) |

---

## 12. Data Service Interface

Both providers (mock and Zoho) implement this interface:

```typescript
interface DataService {
  // People
  getPeople(filters?: PeopleFilters): Promise<PaginatedResult<Person>>
  getPerson(id: string): Promise<Person>
  createPerson(data: CreatePersonInput): Promise<Person>
  updatePerson(id: string, data: UpdatePersonInput): Promise<Person>
  deactivatePerson(id: string): Promise<void>
  searchPeople(query: string): Promise<Person[]> // fuzzy search for autocomplete
  findDuplicatePeople(): Promise<DuplicateGroup[]>

  // Referrer relationships
  addReferrer(prospectId: string, referrerId: string): Promise<void>
  removeReferrer(prospectId: string, referrerId: string): Promise<void>
  getReferrals(referrerId: string): Promise<Person[]> // prospects this person referred

  // Related Contact relationships
  addRelatedContact(prospectId: string, contactId: string, role: string): Promise<void>
  removeRelatedContact(prospectId: string, contactId: string): Promise<void>
  getRelatedContacts(prospectId: string): Promise<RelatedContactLink[]>

  // Organizations
  getOrganizations(): Promise<Organization[]>
  getOrganization(id: string): Promise<Organization>
  createOrganization(data: CreateOrgInput): Promise<Organization>
  updateOrganization(id: string, data: UpdateOrgInput): Promise<Organization>
  searchOrganizations(query: string): Promise<Organization[]>
  findDuplicateOrgs(): Promise<DuplicateGroup[]>

  // Funding Entities
  getFundingEntities(personId: string): Promise<FundingEntity[]>
  createFundingEntity(data: CreateEntityInput): Promise<FundingEntity>
  updateFundingEntity(id: string, data: UpdateEntityInput): Promise<FundingEntity>

  // Activities
  getActivities(personId: string, filters?: ActivityFilters): Promise<Activity[]>
  getRecentActivities(filters?: RecentActivityFilters): Promise<Activity[]> // cross-prospect feed, filterable by rep and date range
  createActivity(personId: string, data: CreateActivityInput): Promise<Activity>
  annotateActivity(activityId: string, note: string): Promise<Activity>

  // Commitments (see §5.9) — commitments ARE activities (Activity Type = Commitment Set) so they share storage
  // with the Activity Log. These methods are convenience wrappers around the underlying activity operations.
  getOpenCommitments(personId: string): Promise<Activity[]> // Activity Type = Commitment Set AND status = 'open'
  createCommitment(personId: string, data: CreateCommitmentInput): Promise<Activity> // writes a Commitment Set activity
  closeOutCommitment(
    commitmentId: string,
    resolution: { status: 'fulfilled' | 'superseded' | 'cancelled'; fulfilledByActivityId?: string }
  ): Promise<Activity> // stamps terminal state + closedDate; sets fulfillsCommitmentId on the fulfilling activity when status='fulfilled'

  // Funded Investments
  getFundedInvestments(filters?: FundedFilters): Promise<FundedInvestment[]>
  createFundedInvestment(data: CreateFundedInput): Promise<FundedInvestment>
  updateFundedInvestment(id: string, data: UpdateFundedInput): Promise<FundedInvestment>

  // UI support
  getLeadSourceCounts(): Promise<Record<string, number>> // count of people per lead source, for chip frequency ordering

  // Dashboard aggregations
  getDashboardStats(): Promise<DashboardStats>

  // Leadership Dashboard
  getLeadershipStats(): Promise<LeadershipStats>
  // Returns: { aumRaised, fundTarget, fundedYTDCount, activeCount, pipelineValue }
  getMeetingsCount(days: number): Promise<number>
  // Count of meeting-type activities in past N days
  getFunnelData(): Promise<FunnelStage[]>
  // Per active stage: { stage, label, count, totalValue }
  getSourceROI(): Promise<SourceROIRow[]>
  // Per lead source: { source, label, prospectCount, fundedCount, aum, conversionPct }
  getDrilldownProspects(filter: DrilldownProspectFilter): Promise<PersonWithComputed[]>
  // filter: { stage?, leadSource?, fundedYTD?, fundedAll?, active? }
  getDrilldownActivities(filter: DrilldownActivityFilter): Promise<RecentActivityEntry[]>
  // filter: { activityType, days }
  getTopReferrers(limit?: number): Promise<ReferrerStats[]>

  // Lead Source management (Admin panel)
  getLeadSources(): Promise<LeadSource[]>
  // Returns full list including order, active flag, label
  updateLeadSource(key: string, data: UpdateLeadSourceInput): Promise<LeadSource>
  reorderLeadSources(keys: string[]): Promise<void>

  // Reports
  getPipelineSummary(filters?: ReportFilters): Promise<PipelineReportRow[]>
  getActivityExport(filters?: ActivityReportFilters): Promise<Activity[]>
  getLostAnalysis(): Promise<LostAnalysisRow[]>
  getSourceROI(): Promise<SourceROIRow[]>
  exportToCsv(reportName: string, filters?: ReportFilters): Promise<string> // returns CSV string

  // Users & Auth
  getUsers(): Promise<User[]>
  // Returns all users with role, status, permissions (extended for Admin panel)
  createUser(data: CreateUserInput): Promise<User>
  updateUser(id: string, data: UpdateUserInput): Promise<User>
  // data: { role?, permissions?: Partial<UserPermissions> }
  deactivateUser(id: string, reassignToId?: string): Promise<void>
  // reassignToId: if provided, reassigns all open prospects to this user before deactivating
  getUserPermissions(userId: string): Promise<ResolvedPermissions> // role + overrides merged

  // Picklist administration
  getPicklistValues(field: string): Promise<PicklistValue[]>
  updatePicklistValues(field: string, values: PicklistValue[]): Promise<void>

  // System config
  getSystemConfig(): Promise<SystemConfig>
  updateSystemConfig(data: UpdateConfigInput): Promise<SystemConfig>

  // Data hygiene
  mergePeople(keepId: string, mergeIds: string[]): Promise<Person>
  mergeOrganizations(keepId: string, mergeIds: string[]): Promise<Organization>
}

// Pagination support (mock provider can ignore, Zoho provider must implement)
interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
```

### 12.1 Mock Provider

Ships with V1. Contains all sample data from the reference JSX prototype:
- 12 prospects with full stage histories
- 3 funded investors with maintain/grow tracks
- 30+ timeline entries (calls, emails, meetings, stage changes)
- Sample organizations, funding entities, referrer relationships
- Sample auto-synced activities (with ⚡AUTO badge and Source = "Zoho Telephony" or "O365 Sync") demonstrating the full integration appearance
- Activity entries include Outcome field (mix of Connected and Attempted) to demonstrate the distinction
- Commitment Date populated on prospects with Committed Amounts

**Mock integration behavior:** The mock provider simulates the Zoho integrations so the full UI is reviewable without a Zoho connection:
- **Click-to-call (📞):** Opens `tel:` link (native dialer on mobile). After returning to the app, a mock Call activity is pre-populated in Quick Log with type = Call. On Zoho provider, this would trigger PhoneBridge instead.
- **Auto-synced entries:** Mock data includes sample telephony call logs and O365 email entries that display identically to how real Zoho-synced entries would appear — ⚡AUTO badge, Source field, Outcome, annotation prompt.
- All UI elements (badges, filters, timeline rendering) work identically on mock and Zoho providers. The provider switch is invisible to the user.

Data persists in memory during session. Resets on page reload (acceptable for demo/review purposes).

**Singleton pattern (important for Next.js dev mode):** The data service singleton is stored on `globalThis` rather than a module-level variable. This ensures API routes and page renders share the same mock provider instance during development (Next.js can run multiple module instances in dev mode). The Zoho provider is stateless per-request, so this only matters for mock.

> ⚠️ **Known HMR caveat:** During active development, if you save a file while the app is running, Next.js HMR can re-evaluate the mock module. The `globalThis` singleton preserves the reference to the old closure, but the module-scope arrays inside may reset. This causes "Prospect not found" errors for dynamically created records. Workaround: don't save files immediately after creating a test prospect, or restart the dev server to get a fresh state.

**`getLeadSourceCounts()` method:** Returns a map of `leadSource → count` computed from all people records. Used by the LeadSourcePicker chip component to order chips by frequency of use. Computed once on mount, single-pass over the people array.

**API route conventions:**
- All mutation API routes call `revalidatePath()` after writing, so server components pick up the change on next render.
- Client components use `window.location.reload()` after mutations instead of `router.refresh()` — more reliable state reset with the mock provider's in-memory store.

### 12.2 Zoho Provider

IT team implements against the same interface. See Section 13 for the full integration checklist.

---

## 13. Zoho Integration Checklist (for IT Team)

> **Context for IT:** This frontend is the *only* interface the sales team uses. Zoho is the database and automation engine — users never log into Zoho's UI. Every field listed below must be exposed via API so the frontend can read/write it. The frontend handles all display, workflow prompts, and computed fields (stale flags, days idle) — Zoho just stores and syncs.

### Phase 1: Zoho Backend Setup

- [ ] Confirm Zoho CRM edition (Professional+ required for custom modules and API access)
- [ ] Confirm existing org status — fresh or existing? Check for field name conflicts
- [ ] Create/verify user accounts: Chad Cormier, Ken Warsaw, Eric Gewirtzman, Efri Argaman

**Custom Modules:**
- [ ] Create "People" module (or repurpose Contacts) with all fields from Section 2.1
  - [ ] Include `Commitment Date` field (Date type) — auto-set by frontend when Committed Amount changes, but Zoho must store it
  - [ ] Include `Committed Amount` (Currency) — verbal target, distinct from funded rollup
- [ ] Create "Organizations" module with fields from Section 2.2
- [ ] Create "Funding Entities" module with fields from Section 2.3
- [ ] Create "Activity Log" custom related list under People with fields from Section 2.4
  - [ ] Include `Outcome` field (picklist: Connected, Attempted) — new field, tracks whether two-way exchange occurred
  - [ ] Include `Source` field (picklist: Manual, Zoho Telephony, O365 Sync) — distinguishes user-logged vs. auto-captured entries
  - [ ] Include `Fulfills Commitment` lookup field (self-referencing to Activity Log) — links a fulfilling activity to the Commitment Set entry it closes out (see §5.9)
  - [ ] Include `Commitment Type`, `Commitment Detail`, `Commitment Due Date`, `Commitment Status`, `Commitment Closed Date` — populated only on Activity Type = Commitment Set (see §5.9)
- [ ] Create "Funded Investments" module with fields from Section 2.5

**Relationships:**
- [ ] People → Organization (lookup)
- [ ] Funding Entity → People (lookup)
- [ ] Activity Log → People (lookup)
- [ ] Funded Investment → Funding Entity (lookup)
- [ ] Funded Investment → People (denormalized lookup)
- [ ] Referrer relationship: People → People (many-to-many via junction module or multi-select)
- [ ] Related Contact relationship: People → People with role field

**Picklists:**
- [ ] Pipeline Stage — 11 values from Section 3
- [ ] Lead Source — 10 values from Section 4.2 (**must match exactly** — the UI chip picker maps directly to these picklist API keys. No extra values, no renamed values.)
- [ ] Activity Type — 12 values from Section 4.3 (including "Prospect Added" and "Commitment Set" — system-only, never manually selected, but must exist as valid picklist values so auto-created activities can be written)
- [ ] Next Action Type — 7 values from Section 4.1
- [ ] Activity Outcome — 2 values (Connected, Attempted)
- [ ] Commitment Status — 4 values (open, fulfilled, superseded, cancelled)
- [ ] Entity Type — 6 values (LLC, LLP, Trust, Individual, Corporation, Other)
- [ ] Lost/Dead Reason — 6 values
- [ ] Track — 2 values (Maintain, Grow)
- [ ] Organization Type — 4 values
- [ ] Contact Type — 6 values
- [ ] Funding Entity Status — 3 values

### Phase 2: API Integration

**New inline editing endpoints required:**
The frontend now edits many fields directly on the Person Detail page without navigating away. The Zoho provider must support PATCH for all of these:
- `PATCH /api/persons/[id]` — Phone, Email, Investment Target, Growth Target, Committed Amount, Lead Source
- `PATCH /api/persons/[id]/stage` — Stage changes (already planned)
- `PATCH /api/persons/[id]/next-action` — Next Action (already planned)
- `POST /api/organizations` — Create org inline
- `PATCH /api/persons/[id]` with `organizationId` — Link org to person
- `POST /api/persons/[id]/funding-entities` — Create funding entity inline
- `DELETE /api/persons/[id]/funding-entities/[entityId]` — Remove funding entity
- `POST /api/persons/[id]/referrer` — Link referrer
- `DELETE /api/persons/[id]/referrer` — Remove referrer

**`getLeadSourceCounts()` method:** New method on the DataService interface. Returns `Record<string, number>` — a map of lead source key to count of people with that lead source. Powers the chip frequency ordering on the frontend. For Zoho: a single COQL query `SELECT Lead_Source, COUNT(id) FROM People GROUP BY Lead_Source`.

- [ ] Generate Zoho API OAuth client (Self Client type for server-to-server)
- [ ] Record Client ID, Client Secret, Refresh Token
- [ ] Set required scopes: `ZohoCRM.modules.ALL`, `ZohoCRM.settings.ALL`, `ZohoCRM.users.READ`
- [ ] Implement `lib/providers/zoho.ts` matching the DataService interface (Section 12)
- [ ] Map Zoho module API names to interface methods
- [ ] Handle Zoho pagination (200 records per page)
- [ ] Handle Zoho rate limits (API credits per day based on edition)
- [ ] Implement `getRecentActivities()` — cross-prospect query sorted by date descending, filterable by user and date range (powers the Dashboard Recent Activity feed)
- [ ] Set environment variables: `DATA_PROVIDER=zoho`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`
- [ ] Test each endpoint: CRUD people, activities, funded investments, dashboard stats

### Phase 3: Communication Integrations

**Zoho Telephony (Click-to-Call):**

> **Flow:** Chad taps 📞 on a prospect → frontend calls `/api/call/initiate` → backend triggers Zoho PhoneBridge API with prospect's phone number → Zoho places the call via configured telephony provider → call happens → Zoho auto-captures call log → frontend reads it as an Activity Log entry on next load.

- [ ] Confirm Zoho PhoneBridge is active and configured with telephony provider (RingCentral, Twilio, etc.)
- [ ] Implement click-to-call API endpoint: frontend sends prospect ID + phone number → backend calls Zoho PhoneBridge `make_call` API
- [ ] Confirm Zoho auto-captures call logs (direction, duration, recording URL, timestamp, linked contact)
- [ ] Expose call logs via API as Activity Log entries with Source = "Zoho Telephony"
- [ ] Auto-set Outcome field on telephony entries: Connected if duration > 30s, Attempted if ≤ 30s (configurable threshold)
- [ ] Map call recording URL to the Activity Log so it's playable/downloadable from the frontend timeline

**Office 365 Email Sync:**

> **Flow:** Zoho's native O365 integration syncs emails bidirectionally. Emails matched to a prospect by email address appear as Activity Log entries in the frontend. The frontend only *reads* these — Zoho handles all sync logic.

- [ ] Configure Zoho ↔ O365 email integration (Zoho Mail Integration or Zoho SalesInbox)
- [ ] Confirm email matching: incoming/outgoing emails matched to People records by email address
- [ ] Expose matched emails via API as Activity Log entries with Source = "O365 Sync"
- [ ] Include: email subject, body preview (first 500 chars), direction (inbound/outbound), attachments
- [ ] Auto-set Outcome field: Connected if email is a reply in a thread (indicates two-way), Attempted if outbound with no reply within 48h
- [ ] Ensure email activities include timestamp (sent/received time) mapped to Activity Log Date + Time fields

**Deduplication:**
- [ ] If Chad manually logs a call AND Zoho captures it automatically, prevent duplicate entries (match by timestamp ±5 min + same prospect)
- [ ] Same for emails: if Chad manually logs "Sent Q3 deck" and O365 sync captures the same email, deduplicate (match by timestamp ±5 min + same prospect + Source differs)

### Phase 4: Zoho-Side Automations

- [ ] Daily overdue email to Chad (7 AM CT) — prospects with at least one **open** commitment (Activity Type = Commitment Set, Status = open) due on or before today, where stage is active. Note: this is not `Next Action Date < today`; the overdue source of truth is now the commitments lifecycle (see §5.9).
- [ ] Funded alert email to Eric — triggered when stage field changes to Funded
- [ ] (Optional) Weekly pipeline summary email to Eric

### Phase 5: Auth Migration (Zoho OAuth)

See Section 8.2 for detailed migration steps.

### IT Team Notes: Fields Computed by Frontend (Not Stored in Zoho)

The following are calculated live by the frontend and do **not** need corresponding Zoho fields:

- **Days Since Last Touch** — computed from latest Activity Log date (excluding Commitment Set, Stage Change, Reassignment, Prospect Added)
- **Stale Flag & Overdue Flag** — computed from idle days, stage threshold, and open-commitment state (see §5.1, §5.9). Zoho does not store these; the frontend derives them per request from Activity Log rows where Activity Type = Commitment Set.
- **Pipeline Value, Committed total, Funded YTD** — aggregated from stored fields at query time
- **Commitment Date** — *is* stored in Zoho (set by frontend when Committed Amount changes), but the *trigger logic* lives in the frontend, not a Zoho workflow

The following **are** stored in Zoho and written by the frontend:
- **Commitment Date** — Date field, written whenever Committed Amount changes
- **Activity Outcome** — Picklist (Connected/Attempted), written on every activity creation
- **Activity Source** — Picklist (Manual/Zoho Telephony/O365 Sync), auto-set based on origin

---

## 14. Reports

Accessible from the Leadership Dashboard via a "Reports" tab/section. Reports are derived from existing data service methods and rendered as filterable tables with a **CSV export button** (browser-side generation). No separate `/reports` route — reports live within the Leadership Dashboard to keep navigation simple.

| Report | Description | Access |
|---|---|---|
| Pipeline Summary | All active prospects by stage with dollar values and next actions | Eric, Chad |
| Activity Log Export | Full activity history, filterable by date range and type | Eric |
| Funded Investors | All funded investments with amounts, dates, entities, track status | Eric |
| Lost Analysis | Dead/Lost records with reason codes and dollar value lost | Eric |
| Source ROI | Source attribution by count and dollar value — pipeline and funded | Eric |
| Referrer Network | Top referrers by referral count, pipeline value, and funded value | Eric |

---

## 15. Error & Loading States

Every view must handle three states consistently:

| State | Treatment |
|---|---|
| **Loading** | Skeleton placeholders matching the layout shape. No spinners. Stat cards show animated pulse bars, table rows show gray blocks. |
| **Error** | Inline error message with retry button. "Something went wrong — try again." Never a blank screen. Dashboard stat cards show "—" on individual failures without blocking the rest. |
| **Empty** | Contextual empty state with direction. Pipeline with no prospects: "No active prospects yet — add your first one." Needs Attention with no flags: green "Pipeline Healthy" indicator. Today's Actions complete: "All caught up" + link to next priority (see 6.2). Timeline with no activities: "No activity logged yet." Every empty state answers "what should I do now?" — never just a dead end. |

**Zoho token expiry (V2):** If an API call returns 401, silently refresh the token and retry once. If refresh fails, redirect to login with message: "Your session expired — please sign in again."

---

## 16. Timezone Handling

All date comparisons (Next Action Date vs. "today", Re-engage Date, stale flag calculations) use **Central Time (CT)** — the team's operating timezone. This is configurable in System Settings (admin panel) for future multi-timezone support.

Dates are stored as date-only values (no time component) in the data layer. "Today" is always resolved in the configured timezone, not UTC or the browser's local timezone.

Activity Log timestamps (date + time) are stored in CT and displayed in CT. If multi-timezone support is needed later, store as UTC and convert on display.

---

## 17. Fund / Opportunity Tracking

The Funded Investment record (Section 2.5) does not include a field for which OwnEZ fund or opportunity the investment is allocated to. This is intentional for V1 — fund/opportunity tracking is handled in Agora (the compliance system of record).

If this needs to change in the future, add a "Fund" picklist to the Funded Investment record (e.g., "Fund IV", "Fund V", "Fund VI") managed via admin panel. The Leadership Dashboard's AUM progress bar would then support per-fund filtering.

---

## 18. Out of Scope (V1)

- Agora API integration (deferred)
- Investor portal / investor-facing access
- DocuSign or subscription document workflow
- Payment processing
- Zoho Books or accounting integration
- Native mobile app (responsive web handles mobile use cases)
- Post-funded investor management workflows (re-investment, track management — to be decided: Zoho native or future module)
- Pinned Prospects (pipeline star/pin feature — see §6.3)
- Keyboard Shortcuts (full keyboard navigation — see §6.10)
- Dashboard Recent Activity feed (cross-prospect activity log — see §6.2)

**In scope (full UI ships with mock V1, live integration via Zoho provider):**
- **O365 email sync display** — Zoho handles the sync, frontend displays synced emails as Activity Log entries with Source = "O365 Sync". Mock V1 ships with realistic sample entries showing the full UI: ⚡AUTO badge, email subject/preview, Outcome, annotation prompt. Switching to Zoho provider activates live sync — zero UI changes.
- **Zoho telephony click-to-call** — Frontend shows 📞 button on all prospects. Mock V1 opens native dialer (`tel:` link) and pre-populates a Call activity. Zoho provider triggers PhoneBridge API instead, and call logs flow back automatically. The UI is identical in both modes.

---

## 19. Mock Data Inventory (Ships with V1)

The following sample data ships with the application for demo and review purposes, derived from the reference JSX prototype:

- **12 Prospects** across all pipeline stages (including Nurture and Dead)
- **3 Funded Investors** (1 Maintain track, 2 Grow track)
- **4 Organizations** (Calloway Family Office, Kim Holdings, etc.)
- **6 Funding Entities** (various LLCs and Trusts)
- **30+ Activity Log entries** (calls, emails, meetings, stage changes, documents)
- **5 External Contacts** (referrers and related contacts — CPAs, attorneys, spouses)
- **3 Auto-synced sample activities** (demonstrating telephony and email integration appearance)
- **Representative referrer relationships** showing the network effect

All data is realistic and internally consistent with the pipeline stages, dates, and relationships described in the original PRD.
