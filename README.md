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

**Also new this session:** `supabase/patch-floor-based-stages-and-permissions.sql`
— replaces the fixed 6-stage list with the real, floor-based construction
sequence, and enforces the finalized permission model (only the project's
designer can judge or sign off; verification required to become one).
Same deal as the earlier patches — already folded into `schema.sql` for a
from-scratch build; run this on top of an existing database that's missing
it. Tested both ways: from scratch, and as a patch applied to a copy of
the actual currently-live database.

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

## Build session — start from any stage, plus PWA install support

**"Start from any stage"** — a project no longer has to begin at Foundation.
Real for a firm joining a build already in progress (the slab's already
poured, say). What changed:

- **New project status:** `not_tracked`, for whichever stages come before
  wherever a project chose to start — deliberately distinct from `locked`
  (which means "will unlock later"; a `not_tracked` stage never will). Shown
  in the UI as a plain dim circle, no border, clearly different from
  `locked`'s dashed one, and correctly excluded from being clickable.
- **Choosing a starting stage is gated, not free-for-all:** if the person
  creating the project is already this project's nominated designer (or a
  platform admin), their chosen starting stage applies immediately. If
  they're not, the project sits with zero checklist stages and
  `start_stage_pending = true` until the designer or an admin confirms it
  from the project page — the same "database is the real boundary, not the
  UI" principle the sign-off fix follows. Both paths, including the two
  rejection cases (wrong person tries to approve; approving something
  already approved), were tested directly against real Postgres, not just
  read over — see `supabase/patch-start-from-any-stage.sql`'s own testing
  before it was written up.
- **Why the old auto-seeding trigger had to go:** it fired the instant a
  project row was inserted — before the client's second, separate insert
  into `project_members` even happens — so it could never correctly check
  whether the creator is this project's designer. Replaced with two
  functions the client calls explicitly, once both inserts have actually
  succeeded: `finalize_project_setup` and `approve_project_start_stage`.

**PWA install support** — "Add to Home Screen" now works: app icon (built
directly from the existing approved logo mark, not a new design), full-
screen with no browser bar, `manifest.json`, and a deliberately minimal
service worker. It does not yet cache anything for offline use — a
considered choice, not an oversight, while the app itself is still actively
changing week to week; a stale cached version serving instead of the real
latest deploy would do more harm than good right now. Worth revisiting once
things settle.

**What I could not do myself, and why:** same as before — this sandbox
can't reach supabase.co directly, so `patch-start-from-any-stage.sql` needs
to be run in the Supabase SQL editor before the new stage-picker will
actually work against real data.

**Superseded note:** the fixed 6-stage list this section describes
(Foundation → Steel → RCC Casting → Brickwork → Plastering → Finishing) no
longer exists — see the next section below. The *mechanism* described here
(not_tracked, the designer/admin approval gate, why the old trigger had to
go) all still applies exactly as written; only the actual list of stages
changed underneath it.

## Build session — the real construction sequence, and the finalized permission model

Everything in this section came directly from the architect using this
platform, narrated stage by stage over several messages, reflected back
and corrected wherever they said so — not written from general
construction knowledge. Two changes, both large, both fully tested.

### The stage list is now the real one, not a simplification

The old placeholder list (Foundation → Steel → RCC Casting → Brickwork →
Plastering → Finishing) is gone. In its place:

**Foundation** (once, whole building — underground work only):
Site Layout → Excavation & Soil Test → PCC → Footing Steel → Footing
Concreting → Plinth Beam Steel → Plinth Beam Concreting.

**Then, per floor** (this whole cycle repeats — Ground Floor exists from
the start, further floors added one at a time via "Add Next Floor" as
construction actually reaches them, never all pre-created upfront):
Column (steel → concrete) → Brickwork → Lintel → Slab & Beam
(steel → concrete) → Plastering (first coat → final coat).

There is no separate "Finishing" stage. Once a floor's final plaster coat
is signed off, this app's involvement with that floor ends — flooring,
painting, fixtures, and everything after are deliberately out of scope,
by design, not an oversight.

"Add Next Floor" only unlocks once the *current* top floor's Slab & Beam
has actually been signed off — matches the real sequence (the next
floor's columns don't start until the floor below is cast and cured), not
just a UI nicety.

Joining a project already several floors into construction is handled at
creation time: specify how many floors already exist, and the starting-
stage picker covers all of them, same "not_tracked before, in_progress at
the chosen point" mechanism as before.

### The finalized permission model

- **Anyone** can create a project, in any role.
- **Only that project's creator** can add other people to it — this was
  already exactly how the database worked, no change needed there.
- **Only the project's nominated designer** — the Engineer or Architect
  actually flagged as designer for that specific project, not just anyone
  holding that role — can mark a checkpoint Pass/Fail/Flag, or sign off.
  This is new: previously only the final sign-off was restricted this way;
  now day-to-day checkpoint judgment is too.
- **Everyone else** — Contractor, Owner, and even a second Engineer or
  Architect who isn't the nominated designer — can still attach photos
  freely. This was always a separate table (`checkpoint_evidence`) from
  checkpoint status, so restricting one didn't require touching the other.
- **Becoming eligible to be nominated as designer at all** now requires
  the right role *and* `license_verified = true` on that account — not
  role alone. Granting that verification remains a direct-database action
  for now (same situation as granting admin status itself already was),
  by explicit choice rather than building an approval screen just yet.
- An **Add Member** form now exists on each project's page — looks up an
  existing registered account by email (they must already have signed up;
  there's no invite-a-stranger flow) and confirms their role before
  adding them.

### Tested rigorously, including three bugs caught in the testing itself, not the code

Every piece above was checked against real Postgres with row-level
security genuinely enforced — not read over and assumed correct. Getting
there required catching and fixing three real problems in the *test
setup*, each one worth naming honestly:

1. The first test run showed a Contractor successfully updating a
   checkpoint's status — which looked like the whole permission model had
   failed. It turned out the test was connecting as the Postgres
   superuser, which **bypasses row-level security entirely by default**.
   Fixed by granting proper privileges to a non-superuser `authenticated`
   role and switching to it for every test assertion.
2. A project-creation test then failed with a real RLS violation — but
   for a boring reason: the test set which user it was acting as *after*
   trying to create that user's project, not before.
3. After both fixes, one test still looked like a failure — until
   checking the actual row directly showed the checkpoint's status hadn't
   changed at all. The test script's own error-handling was rolling back
   a result and misreporting it, not the permission check failing. Fixed
   by checking real before/after state directly instead of relying on
   whether an exception was thrown, which is the wrong signal for an
   UPDATE silently filtered by a security policy.

With all three fixed, nine scenarios were run twice — once against a
fresh database, once as the actual incremental patch applied on top of a
copy of the real, currently-live database — and both came back completely
clean, including the negative cases: an unverified engineer cannot become
a designer even if asked to; a Contractor cannot update checkpoint status
but can still upload evidence; a Contractor cannot add the next floor; a
floor cannot be added before its predecessor's Slab & Beam is approved.

**What I could not do myself, and why:** same as every time before — this
sandbox can't reach supabase.co directly, so
`supabase/patch-floor-based-stages-and-permissions.sql` needs to be run in
the Supabase SQL editor before any of this works against real data.

## Build session — gallery upload, 2-photo limit, AI precheck

Three changes, requested together, all landing in the checklist's photo
flow specifically.

**Gallery upload, alongside the existing camera capture, not replacing
it.** The live camera view (`getUserMedia`) still works exactly as before,
for anyone who wants the guarantee that a photo was taken right now. A new
"Choose from Gallery" button sits next to it for picking an existing
photo instead. Both feed the same upload path.

**2 photos per checkpoint, enforced at the database level.** A trigger on
`checkpoint_evidence` rejects a third insert for the same checkpoint with
a plain-language error, not a raw one. The UI also hides both photo
buttons once a checkpoint already has two, so this is normally never even
reached — the trigger is the backstop, not the primary control.

**AI precheck, deliberately scoped to what a vision model can honestly
assess.** After a photo uploads (and only after — nothing here can ever
block or delay the upload itself, which is already permanent by the time
this runs), a server-side route sends it to Claude with one narrow
question: is this photo clear and usable, and does it plausibly show what
the checkpoint is asking about? It does not attempt to judge structural
correctness, code compliance, or measurements — that stays entirely the
designer's call, exactly as already built. The result is advisory only,
shown next to the photo; it never touches Pass/Fail/Flag.

Storing that result required exactly one new capability:
`record_ai_precheck`, a function that can only ever write the two new
`ai_precheck_*` columns — nothing else on that row can be changed through
it or any other path. Everything that already made evidence permanent
(the storage path, who uploaded it, when) still can never change, by
construction, not by convention.

**What genuinely needs your action before the AI piece runs for real:**
unlike everything else built so far, this needs a live connection to an
outside AI service, which means a real API key from
console.anthropic.com — a different kind of credential from GitHub or
Supabase, and one with actual small ongoing cost per photo. Without that
key set, the app doesn't break — photos still upload and work completely
normally, the precheck step is simply skipped. Setting `ANTHROPIC_API_KEY`
as an environment variable in Netlify (Project configuration → Environment
variables, same place the Supabase keys already live) is what turns it on.

Tested against real Postgres, RLS genuinely enforced: two photos succeed,
a third on the same checkpoint is rejected with the intended message,
`record_ai_precheck` correctly updates only what it should, and someone
outside the project is correctly blocked from calling it at all. Tested
twice against a copy of the actual live database — fresh, and applied a
second time immediately after — both clean.

## Build session — delete project

Only this project's creator can delete it — not the designer, not a
platform admin, deliberately narrower than every other authority already
in this app. Blocked entirely, for everyone with no exception, the moment
any stage has been signed off — that's the line between cleaning up
something that shouldn't exist and erasing a confirmed record, and it
isn't negotiable once crossed.

The app shows a two-step confirmation before anything happens, and
explains plainly when deletion is no longer available rather than just
hiding the option with no context.

Tested directly against real Postgres: an outsider is blocked outright;
the creator successfully deletes a project with no sign-offs, and every
related row — stages, checkpoints, members — genuinely disappears with
it; that same creator is blocked the instant even one sign-off exists;
and a platform admin has no override in that case either, confirmed
directly rather than assumed. Tested against a copy of the real live
database too, applied twice in a row, both clean.

## Build session — Isometric View, the platform's second real tool

Open to any logged-in user — no role restriction, unlike Civil & RCC.
Two bases, both fully specified in direct conversation before any code
was written, same process as RCC's stage sequence.

**Base 1 — Actual Top View.** Accepts CAD-exported vector PDFs only. A
scanned or flattened PDF is rejected outright, before any generation
happens, with a message to export directly from AutoCAD instead. This
isn't a soft preference — it's the one thing this base exists to
guarantee: the output is *exact*, nothing altered from the input.

Getting that distinction right took real testing, not just reasoning
about it: two actual PDFs were generated — one with genuine vector
drawing operations, one a simulated scan (a flat image wrapped in a PDF
shell) — and the detection logic was run against both directly. The
result was clean and decisive: the real one showed genuine line/shape
operations and extractable text; the scanned one showed neither, just
one embedded image.

The output itself is a direct, high-resolution rasterization of the
original PDF page — deliberately *not* a reconstruction from the
extracted lines and text. Reconstructing risks subtle differences
creeping in; rendering the original page directly does not. That's what
makes "exact" an honest claim here rather than an approximation.

**Base 2 — Furniture Layout.** Accepts a PDF, room photo, or 3D plan
photo. One honest limitation worth stating plainly: there's no
image-generation model available here — Claude can genuinely *see* and
reason about a room's shape, doors, and windows, but it cannot paint a
new photorealistic picture the way some consumer apps do. So this base
works differently: AI analyzes the space and reasons out one specific,
workable furniture arrangement — required to keep every door's swing
clear and a walkable path through the room, not left as a decorative
nice-to-have — and that arrangement gets rendered as a clean, labeled,
top-down 2D diagram. Arguably more genuinely useful for real furniture
planning than a stylized render, and consistent with Base 1's top-down
visual language.

Both bases track a separate 5-generations-per-day allowance each —
confirmed directly, not assumed: using up Top View's daily limit leaves
Furniture Layout's completely untouched, and a rejected (non-vector) Top
View attempt never counts against that limit at all.

**A few real things caught and fixed along the way, worth naming
honestly:** a wrong PDF.js constant name caught by the type checker; the
rate-limit function was initially written to only handle Top View, which
would have silently made Furniture Layout share Top View's counter
instead of tracking its own — caught before shipping, by writing a test
specifically checking the two stayed independent; and the same
re-run-safety gap found a few times earlier this session (a `CREATE
TABLE` without `IF NOT EXISTS`) turned up here too and got the same fix.

Tested against a copy of the real live database, applied twice in a row,
both clean.

**What genuinely still needs your action, same as the AI precheck
before:** Furniture Layout's analysis step needs `ANTHROPIC_API_KEY` set
in Netlify to actually run — without it, the tool tells the person
plainly that analysis isn't configured yet, rather than failing
silently or pretending to work.

### Follow-up refinement — questions-first, real standards, any room, SketchUp styling

Four real gaps caught and fixed after the first pass above, all before
any of it went live:

Furniture Layout now studies the room and asks up to 3 genuinely
necessary questions — room size if not visible, whether existing
furniture stays, intended use if unclear — before generating anything,
matching Base 1's pattern exactly. It generates nothing on a first
guess.

It's explicitly general-purpose now, not implicitly bedroom-shaped: the
prompt identifies the actual room type from what's visible (kitchen,
living room, study, anywhere), and furniture type/label are free-form
rather than a fixed list, so it isn't boxed into vocabulary from one
room type.

Real clearance numbers are baked into the generation prompt as hard
requirements, not left as a vague "keep it workable": 36" main walkway,
36" kept clear at every door approach, 18-24" general furniture
spacing — sourced from NKBA/ASID-aligned residential circulation
standards. Room-specific judgment beyond that (a kitchen's work
triangle, dining chair pull-out space) is left to Claude's own real
architectural knowledge, applied to whatever room was actually
identified.

The output rendering was rebuilt for a proper SketchUp-style look:
directional face shading (top/front/side of each piece at different
lightness, not flat single-tone boxes), a soft ground shadow under the
model, and real height estimates per piece rather than uniform blocks.
