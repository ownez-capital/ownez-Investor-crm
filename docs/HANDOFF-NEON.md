# OwnEZ CRM — Neon Handoff Checklist

**For:** Eric Gewirtzman
**Purpose:** Steps to go from mock demo → live system with real data

---

## Part 1: Demo Today (Mock Data)

No changes needed. The app works as-is with mock data.

1. Run `npm run dev` locally, or use the current Vercel preview deployment
2. Log in as any user (username: `chad`, `ken`, `eric`, or `efri` / password: `password123`)
3. Walk the team through the full workflow:
   - Dashboard → Pipeline View → Person Detail → Quick Log → Activity History
   - Show Lead Source management: **Settings > Lead Sources** (add, edit, reorder)
   - Show the Leadership Dashboard (log in as `eric` to see admin views)
4. Remind the team: "Everything you see is mock data. When we go live, you start with a clean slate."

---

## Part 2: Go Live (One-Time Setup)

### Prerequisites

Install the Vercel CLI (one-time):
```bash
npm i -g vercel
```

### Step 1: Add Neon Database

```bash
vercel integration add neon
```

Follow the prompts to create a Neon Postgres database. This auto-provisions the `DATABASE_URL` environment variable in Vercel.

### Step 2: Set Passwords

In the Vercel dashboard (or via CLI), add these environment variables for **Production** environment:

| Variable | Value |
|----------|-------|
| `SEED_PASSWORD_CHAD` | Chad's real password |
| `SEED_PASSWORD_KEN` | Ken's real password |
| `SEED_PASSWORD_ERIC` | Your real password |
| `SEED_PASSWORD_EFRI` | Efri's real password |

Via CLI:
```bash
vercel env add SEED_PASSWORD_CHAD production
vercel env add SEED_PASSWORD_KEN production
vercel env add SEED_PASSWORD_ERIC production
vercel env add SEED_PASSWORD_EFRI production
```

### Step 3: Set Data Provider

Add one more environment variable:

| Variable | Value |
|----------|-------|
| `DATA_PROVIDER` | `neon` |

```bash
vercel env add DATA_PROVIDER production
```

### Step 4: Deploy

```bash
vercel --prod
```

The first deployment will automatically:
- Run database migrations (create all tables)
- Seed users with the passwords you set
- Seed pipeline stages, activity types, and system config
- Leave lead sources and all business data empty

### Step 5: Verify

1. Go to the production URL
2. Log in as yourself (`eric` + your password)
3. Confirm the dashboard loads (it will be empty — that's correct)
4. Go to **Settings > Lead Sources** and add at least one source

---

## Part 3: Tell the Team

Send Chad and Ken this message:

> **The CRM is live.** Here's what you need to do:
>
> 1. Go to [production URL]
> 2. Log in with your username and the password I gave you
> 3. First thing: go to **Settings > Lead Sources** and add the lead sources we use (e.g., "CPA/Advisor Referral", "LinkedIn", etc.)
> 4. Start adding prospects — everything you enter is real data now
>
> The system is empty on purpose. There's no demo data. Everything you create from now on is the real pipeline.

---

## Troubleshooting

**"Cannot connect to database"** — Run `vercel env pull` locally to verify `DATABASE_URL` is set. Check the Neon dashboard to confirm the database exists.

**"Invalid credentials"** — The seed passwords are only read on first run. If you need to change a password after setup, you'll need to update it directly (ask Claude to help).

**"Lead Sources is empty"** — That's by design. Production starts blank so the team defines their own taxonomy.
