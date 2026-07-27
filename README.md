# ADRITH — foundation + Civil & RCC Quality Control

This started as just the foundation layer — accounts, login, roles, the
database structure everything else builds on. It now also includes a real,
working version of the first tool: Civil & RCC Quality Control, stage by
stage, Foundation through Finishing.

## ⚠️ Before running this: re-apply the schema

`supabase/schema.sql` has real additions since it was last run — the
automation that seeds each project's six stages and real checkpoints, and
auto-unlocks the next stage on sign-off, plus a Storage bucket for evidence
photos and a couple of access-control fixes. **Open the SQL editor in your
Supabase project and run the full, current `supabase/schema.sql` again**
before testing any of this — none of the new pieces exist in your actual
database yet. (I can't do this step myself: this sandbox's network access
doesn't reach supabase.co.)

## What's actually working right now

- Sign up with a role (Owner / Contractor / Engineer / Architect)
- Log in / log out
- A separate platform-admin layer for you specifically — see every
  project platform-wide, verify anyone's license — distinct from the
  four project-level roles above, which any client or contractor also gets
- **The finalized landing page and tools hub** — black background, the
  approved logo, the ring background, all six tools listed (Civil & RCC
  marked open, the other five honestly marked "Soon"), plus your contact
  section (phone, WhatsApp, YouTube)
- **A real, working Civil & RCC flow:** create a project → six stages and
  their actual IS-code-referenced checkpoints are seeded automatically →
  work through checkpoints with in-app-only camera evidence (no gallery
  picker anywhere) → the project's nominated designer signs off in their
  own words → the next stage unlocks automatically
- **"Your Projects" and "All Platform Projects" shown separately** for
  admin — no longer one blended list
- Routes under `/dashboard` are blocked from anyone not logged in — enforced
  at the routing layer (`proxy.ts`), which itself now documents clearly
  that it's a UX convenience, not the real security boundary
- A complete database schema with security rules already written (see
  `supabase/schema.sql`)

Verified, not just written: `npm run build`, `npm run lint`, and a full
TypeScript check all pass with zero errors, against the real, current
codebase, including everything built this session.

I also spun up a real local Postgres and ran the actual schema against it —
not a read-through, an execution — simulating a contractor, a project
owner, and an admin as separate logged-in sessions:
- Confirmed a contractor genuinely cannot see a project they're not on (0
  rows returned, not just hidden in the UI)
- Confirmed the project owner and the admin can both see it, for different
  reasons (membership vs. platform-wide access)
- Uploaded a photo, then tried to edit and delete it as the same user who
  uploaded it — both attempts were rejected by the database itself
- Tried to self-promote a contractor account to admin — this caught a real
  bug (see below), which is now fixed and re-tested

**The bug that testing caught:** the first version of the admin-lock logic
used a SQL comparison that could silently evaluate to neither true nor
false or under specific missing-data conditions, which would have let the
check pass by accident rather than by design — the opposite of what it was
meant to do. Rewritten to fail closed (block by default when uncertain)
instead of failing open. This is exactly why I test behavior rather than
just reading code back to check it looks right.

## The security decisions worth knowing about

These directly follow from what we discussed earlier in the conversation:

1. **Evidence and sign-offs can never be edited or deleted once created.**
   The database schema has no UPDATE or DELETE rule for those two tables —
   not "we won't build a delete button," but the database itself refuses
   the request even if someone tried directly.
2. **Nobody can grant themselves a role or fake a verified license.** A
   database trigger blocks any update to those two fields unless it comes
   from a trusted server process — not from the logged-in user's own
   session, however the request is shaped.
3. **Every table checks project membership before returning data.** A
   contractor on Project A cannot see Project B's data by guessing an ID —
   the database enforces this on every query, not just the pages we
   remembered to check.
4. This is the exact pattern of mistake flagged when we talked about
   Netlify/Supabase security — open tables and unauthenticated access.
   The rules above are the direct fix, built in from the first line of
   schema rather than patched in later.

## What you need to do (I can't do this part for me)

1. Create a free account at supabase.com and start a new project.
2. In the Supabase dashboard, open the SQL Editor and run everything in
   `supabase/schema.sql` — this creates all the tables and security rules
   in one go.
3. In Project Settings -> API, copy the Project URL and anon public key.
4. Copy `.env.example` to `.env.local` and paste those two values in.
5. Run `npm install` then `npm run dev`, and it should be live at
   localhost:3000.
6. Sign up for your own account through the app, like any user would.
7. Back in the Supabase SQL Editor, open `supabase/make-me-admin.sql`,
   swap in the email you just signed up with, and run it. Log out and back
   in — that's what makes your account the platform admin.

I genuinely can't do steps 1-4 or 6 from here — they require an account or
a live signup only you can create. Everything else is done.

## What's next

Project creation and the first real tool — the RCC/civil quality
checklist, stage by stage — following the same "build it, run it, show
you" process. Nothing further gets built until you've seen this piece
working.

## Security hardening pass (this session)

- **Dependencies re-checked against current CVEs.** Next.js (16.2.11) and
  React (19.2.4) were verified against the December 2025 React Server
  Components RCE (CVE-2025-55182, CVSS 10.0) and the January 2026 DoS
  follow-up (CVE-2026-23864) — both already patched at the versions
  installed here. No upgrade needed.
- **HTTP security headers added** in `next.config.ts` — Content-Security-Policy,
  Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, and Permissions-Policy. Neither Next.js nor Supabase sets
  these by default; this was a real, confirmed gap before this pass.
  The CSP explicitly allows the two things this app actually needs — camera
  access for evidence photos, and talking to Supabase — and blocks
  everything else it doesn't.
- **`proxy.ts` now documents explicitly** that it's a UX redirect layer, not
  the real security boundary — Postgres Row Level Security is, and stays
  enforced independently regardless of what happens at the routing layer.
  This is written down so it's never mistaken for the actual access control
  later.
- **One vulnerability found, and honestly not fully resolved yet:** a fresh
  `npm audit` surfaced a high-severity DoS advisory in `brace-expansion`,
  reached only through ESLint's own dependency chain — not through Next.js,
  React, or Supabase. It only affects the linting tool run during
  development, not the deployed app itself. A direct version override was
  tried and reverted after it broke `npm run lint` — the installed
  `minimatch` needs `brace-expansion`'s older 1.x API, and the patched
  release is a incompatible 5.x. The clean fix is upgrading `eslint-config-next`
  to a newer major version, which needs its own dedicated compatibility pass
  rather than being rushed in here. Confirmed low real-world risk in the
  meantime, since it never runs against live user traffic.
- **Secrets handling re-verified:** `.env.local` (the file with real
  credentials) stays git-ignored; `.env.example` contains only placeholder
  text, never real values.

`npm run build`, `npm run lint`, and `npx tsc --noEmit` all still pass
cleanly after every change above.

## Follow-up verification pass — one real gap found and fixed

Prompted by a direct "check the work you said is done" — re-ran everything
rather than just restating the summary above, and it was worth doing:

- **`npm run build`, `npm run lint`, `npx tsc --noEmit` re-run from a clean
  install** — all still pass. The `brace-expansion` advisory above was
  re-confirmed unchanged: still the same single dev-only issue, still
  correctly deferred, not a new or different problem.
- **Real gap found: sign-off was only designer-restricted in the UI, not
  the database.** `page.tsx` correctly hides the sign-off box from anyone
  who isn't the nominated designer (`canSignOff={Boolean(membership?.is_project_designer)}`),
  but the underlying `sign_offs` INSERT policy never actually checked
  `is_project_designer` — only project membership. Anyone on the project
  could have called the Supabase API directly (bypassing the UI entirely)
  and signed off a stage as a non-designer, which would also have
  triggered the auto-unlock into the next construction stage. This is
  exactly the failure mode the "UI is UX-layer only, RLS is the real
  boundary" principle exists to catch, and this one slipped through it.
- **Fixed and tested, not just patched.** Added `current_user_is_project_designer()`
  (named to avoid colliding with the `is_project_designer` column, same
  reasoning as `current_user_is_admin()` above) and rewrote the insert
  policy to require it. Verified against a real local Postgres instance
  with RLS enabled, not just read by eye: a simulated non-designer project
  member's insert was rejected by the database itself, and the nominated
  designer's insert succeeded. Standalone patch for the already-live
  database: `fix-signoff-designer-check.sql`. Also folded into
  `supabase/schema.sql` so any future fresh setup gets it from the start.

## Build session — finalized branding + Civil & RCC's real workflow

**Design applied to real code, not just previews:** the landing page and
hub now match the finalized design exactly — black background, the
approved logo with its truss lines and node dots, the concentric-ring
background centered on the wordmark (landing) and dimmed near the top
(hub), rust accent, Space Grotesk + IBM Plex Mono. All six tools are shown
in the hub, in the last-confirmed order, with Civil & RCC marked "Open"
and the other five honestly marked "Soon." The contact section (phone,
WhatsApp, YouTube) sits at the bottom of the hub.

**Civil & RCC is now a real, working tool, not just a tested foundation:**

- **Schema extended** with what was missing to make the six-stage workflow
  actually function: a `fee_exempt` column (admin-only to change, for the
  Adrith-Designs-projects-are-free rule), an `is_project_designer` field on
  project membership (whichever of engineer/architect is the actual design
  lead — chosen explicitly, never inferred), a trigger that seeds all six
  stages and their real, IS-code-referenced checkpoints the moment a
  project is created, and a trigger that auto-unlocks the next stage the
  moment a sign-off is inserted for the current one. None of this
  automation existed before — the tables were there, but nothing connected
  them into an actual sequence.
- **A missing UPDATE policy on checkpoints was found and fixed** — without
  it, nobody could have actually marked a checkpoint pass/fail/flagged
  through the app at all.
- **A Storage bucket for evidence photos was created**, with the same
  project-membership access rule as every other table, and no update/delete
  policy — matching the immutability rule already enforced on the
  `checkpoint_evidence` table row itself.
- **Real pages built:** project list (with the "Your Projects" vs. "All
  Platform Projects" split specifically discussed — no longer one blended
  list), project creation (name, location, your role, designer
  nomination), the six-stage progress view, and the stage detail page —
  checkpoints in plain language with the IS-code reference as secondary
  detail, in-app-only camera capture (no gallery picker exists anywhere in
  this flow), and the typed, permanent sign-off.

**Honest limitation carried over from planning, not newly introduced:**
Finishing-stage checkpoints are seeded with only two general placeholders —
this stage was already flagged as needing its own dedicated research pass,
and that's still true; don't treat the two seeded checkpoints as complete.

**What I could not do myself, and why:** this sandbox's network access
does not include supabase.co, so I cannot run the schema changes against
the live project directly. The updated `supabase/schema.sql` needs to be
run in the Supabase SQL editor before any of this will actually work
against real data — see the note at the top of this README.

**Still not built:** the project group/chat feature, the flagged-checkpoint
escalation workflow, and the other five tools — each is its own future
build session, in the order already agreed.
