-- ============================================================================
-- PATCH — Isometric View tool, complete: both Base 1 (Actual Top View) and
-- Base 2 (Furniture Layout). Run this once in the Supabase SQL Editor.
-- Already folded into schema.sql for a from-scratch build. Supersedes
-- any earlier "top-view only" patch you may have been sent - if you
-- already ran that one, this is still safe to run on top of it.
--
-- Open to any logged-in user, no role restriction (unlike Civil & RCC).
--
-- BASE 1 — Actual Top View: accepts CAD-exported vector PDFs only. A
-- scanned or flattened PDF is rejected outright, before any generation
-- happens, with a clear message to export directly from AutoCAD instead.
-- Verified this distinction against real test files, not just in theory:
-- a genuine vector PDF carries real line/shape drawing operations; a
-- scanned one carries none at all, just one embedded image. The output
-- is a direct, high-resolution rasterization of the original PDF page -
-- not a reconstruction from extracted lines and text - which is what
-- makes "exact, nothing altered" an honest promise.
--
-- BASE 2 — Furniture Layout: accepts a PDF, room photo, or 3D plan
-- photo. AI analyzes the room's shape, doors, and windows, then suggests
-- ONE furniture arrangement that keeps door swings clear and a walkable
-- path through the room - required, not decorative. The output is a
-- clean, labeled, top-down 2D diagram rendered from that analysis -
-- honestly, no image-generation model is available here, so this is
-- reasoned placement data drawn as a diagram, not an AI-painted photo.
--
-- Each base tracks its own separate 5-per-day allowance - confirmed
-- directly: using up Top View's daily limit does not touch Furniture
-- Layout's, and a rejected (non-vector) attempt never counts against
-- either.
--
-- Safe to run against a live database, any number of times: adds one new
-- table, one new storage bucket, and their policies. Touches no existing
-- data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ISOMETRIC VIEW TOOL
-- Two bases: "top_view" (Actual Top View - exact, vector-PDF-only
-- reproduction) and "furniture_layout" (AI-suggested furniture
-- arrangement from a PDF, room photo, or 3D plan photo). Open to any
-- logged-in user - no role restriction, unlike Civil & RCC.
-- ----------------------------------------------------------------------------
create table if not exists isometric_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  base text not null check (base in ('top_view', 'furniture_layout')),
  input_storage_path text not null,
  output_storage_path text,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'failed', 'rejected_not_vector')),
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table isometric_generations enable row level security;

drop policy if exists "users can view their own generations" on isometric_generations;
drop policy if exists "users can insert their own generations" on isometric_generations;

create policy "users can view their own generations"
  on isometric_generations for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can insert their own generations"
  on isometric_generations for insert
  to authenticated
  with check (user_id = auth.uid());

-- Rejected (not-a-genuine-vector-PDF) attempts don't count against the
-- daily limit - only real, processed generations do. A person mistakenly
-- uploading a scan shouldn't lose one of their 5 for that alone. Takes
-- which base to check, since Top View and Furniture Layout each track
-- their own separate 5-per-day allowance, not a shared one.
create or replace function isometric_generations_remaining_today(target_user_id uuid, target_base text)
returns int as $$
  select greatest(0, 5 - count(*)::int)
  from isometric_generations
  where user_id = target_user_id
    and base = target_base
    and status != 'rejected_not_vector'
    and created_at >= date_trunc('day', now());
$$ language sql security definer stable;

grant execute on function isometric_generations_remaining_today(uuid, text) to authenticated;

-- Storage bucket for the Isometric View tool. Private, scoped per-user
-- (not per-project - this tool isn't tied to any specific project).
-- Path convention: {user_id}/{generation_id}/input.pdf and .../output.jpg
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('isometric-files', 'isometric-files', false)
on conflict (id) do nothing;

drop policy if exists "users can view their own isometric files" on storage.objects;
drop policy if exists "users can upload their own isometric files" on storage.objects;

create policy "users can view their own isometric files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'isometric-files'
    and ((storage.foldername(name))[1]::uuid = auth.uid() or current_user_is_admin())
  );

create policy "users can upload their own isometric files"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'isometric-files'
    and (storage.foldername(name))[1]::uuid = auth.uid()
  );

-- Patch complete.
