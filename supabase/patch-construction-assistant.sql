-- ============================================================================
-- CONSTRUCTION ASSISTANT - a plain AI chatbot for architecture & construction
-- questions. Text only (no photos). Run once in the Supabase SQL Editor; safe
-- to re-run. Already folded into schema.sql for a from-scratch build.
--
-- Cost control is part of the design, because every answer is a paid AI call:
--   * 12 questions per user per day (database-enforced, not just the UI)
--   * 200 questions per day across ALL users - a hard ceiling on the bill
--   * questions limited to 2,000 characters, answers to 8,000
--   * the server (not the browser) writes the AI's answers, so nobody can
--     plant fake "assistant" messages or fill the table with junk
-- To change a limit, edit the two numbers in enforce_construction_chat_limit()
-- below and run the file again.
-- ============================================================================

do $$
begin
  if to_regprocedure('public.current_user_is_admin()') is null
     or to_regprocedure('public.enforce_daily_insert_cap()') is null then
    raise exception 'STOPPED BEFORE CHANGING ANYTHING - run patch-security-review-4.sql and patch-security-review-5.sql first, then run this file again.';
  end if;
end $$;

create table if not exists construction_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

alter table construction_chat_conversations enable row level security;

drop policy if exists "users can view their own construction chats" on construction_chat_conversations;
drop policy if exists "users can start their own construction chats" on construction_chat_conversations;

create policy "users can view their own construction chats"
  on construction_chat_conversations for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

create policy "users can start their own construction chats"
  on construction_chat_conversations for insert
  to authenticated
  with check (user_id = auth.uid());

create table if not exists construction_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references construction_chat_conversations (id) on delete cascade,
  user_id uuid not null references profiles (id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  constraint construction_chat_content_len check (
    (role = 'user' and length(content) between 1 and 2000)
    or (role = 'assistant' and length(content) between 1 and 8000)
  )
);

alter table construction_chat_messages enable row level security;

drop policy if exists "users can view their own construction chat messages" on construction_chat_messages;
drop policy if exists "users can ask in their own construction chats" on construction_chat_messages;

create policy "users can view their own construction chat messages"
  on construction_chat_messages for select
  to authenticated
  using (user_id = auth.uid() or current_user_is_admin());

-- Signed-in users may only add QUESTIONS, and only to their own conversation.
-- Answers are written by the server with its service key (which bypasses this).
create policy "users can ask in their own construction chats"
  on construction_chat_messages for insert
  to authenticated
  with check (
    role = 'user'
    and user_id = auth.uid()
    and exists (
      select 1 from construction_chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );
-- No update/delete policy for users: a conversation is a record, not editable.

create index if not exists idx_construction_chat_messages_convo on construction_chat_messages (conversation_id, created_at);
create index if not exists idx_construction_chat_messages_day on construction_chat_messages (created_at) where role = 'user';

create or replace function enforce_construction_chat_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  per_user_cap constant int := 12;     -- questions per user per day
  global_cap   constant int := 200;    -- questions per day, everyone combined
  mine int;
  everyone int;
begin
  if new.role <> 'user' then
    return new;
  end if;

  -- One lock for the whole feature, so two simultaneous questions can't both
  -- slip under the global ceiling before either is counted.
  perform pg_advisory_xact_lock(hashtext('construction_chat_global'));

  select count(*) into mine from construction_chat_messages
    where user_id = new.user_id and role = 'user' and created_at >= date_trunc('day', now());
  if mine >= per_user_cap then
    raise exception 'Daily message limit (%) reached for the Construction Assistant - please try again tomorrow.', per_user_cap;
  end if;

  select count(*) into everyone from construction_chat_messages
    where role = 'user' and created_at >= date_trunc('day', now());
  if everyone >= global_cap then
    raise exception 'The Construction Assistant has reached its free daily capacity - please try again tomorrow.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_construction_chat_limit_trigger on construction_chat_messages;
create trigger enforce_construction_chat_limit_trigger
  before insert on construction_chat_messages
  for each row execute function enforce_construction_chat_limit();

drop trigger if exists daily_cap_trigger on construction_chat_conversations;
create trigger daily_cap_trigger
  before insert on construction_chat_conversations
  for each row execute function enforce_daily_insert_cap('20', 'user_id');
