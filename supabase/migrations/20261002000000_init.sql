-- CodeBase AI initial schema
-- Requires: pgvector (extension "vector").

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');
create type public.developer_role as enum ('frontend', 'backend', 'fullstack', 'mobile', 'devops', 'other');
create type public.analysis_status as enum ('pending', 'processing', 'completed', 'failed');
create type public.repository_source as enum ('github', 'zip');
create type public.task_status as enum ('todo', 'done');
create type public.message_role as enum ('user', 'assistant');

-- ---------------------------------------------------------------------------
-- Shared trigger for updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  experience_level public.experience_level,
  developer_role public.developer_role,
  learning_style text check (char_length(learning_style) <= 200),
  learning_goal text check (char_length(learning_goal) <= 500),
  weekly_hours smallint check (weekly_hours between 1 and 80),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- repositories
-- ---------------------------------------------------------------------------
create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  owner text check (char_length(owner) <= 200),
  repository_url text check (char_length(repository_url) <= 500),
  source_type public.repository_source not null,
  archive_path text, -- storage object path for zip uploads
  default_branch text,
  latest_commit_sha text,
  description text,
  analysis_status public.analysis_status not null default 'pending',
  analysis_progress smallint not null default 0 check (analysis_progress between 0 and 100),
  analysis_message text,
  analysis_error text,
  analysis_started_at timestamptz,
  analyzed_at timestamptz,
  file_count integer not null default 0,
  chunk_count integer not null default 0,
  languages jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index repositories_user_idx on public.repositories (user_id, updated_at desc);
create unique index repositories_user_github_unique on public.repositories (user_id, lower(repository_url))
  where source_type = 'github';

create trigger repositories_updated_at before update on public.repositories
  for each row execute function public.set_updated_at();

-- Helper used by RLS policies on child tables.
create or replace function public.owns_repository(repo_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.repositories r where r.id = repo_id and r.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- repository_files
-- ---------------------------------------------------------------------------
create table public.repository_files (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  file_path text not null,
  language text not null,
  file_size integer not null,
  line_count integer not null default 0,
  content_hash text not null,
  content text, -- secret-redacted source; null when too large
  symbols jsonb not null default '[]'::jsonb,
  imports jsonb not null default '[]'::jsonb,
  parse_error text,
  created_at timestamptz not null default now(),
  unique (repository_id, file_path)
);

create index repository_files_path_trgm on public.repository_files using gin (file_path extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- code_chunks
-- ---------------------------------------------------------------------------
create table public.code_chunks (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  file_id uuid not null references public.repository_files (id) on delete cascade,
  file_path text not null,
  language text not null,
  symbol_name text,
  symbol_kind text,
  chunk_content text not null,
  start_line integer not null,
  end_line integer not null,
  commit_sha text,
  embedding extensions.vector(1536),
  search_tsv tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(symbol_name, '') || ' ' || replace(replace(file_path, '/', ' '), '.', ' ')), 'A') ||
    setweight(to_tsvector('simple', chunk_content), 'B')
  ) stored,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (end_line >= start_line)
);

create index code_chunks_repo_idx on public.code_chunks (repository_id);
create index code_chunks_file_idx on public.code_chunks (file_id);
create index code_chunks_tsv_idx on public.code_chunks using gin (search_tsv);
create index code_chunks_symbol_trgm on public.code_chunks using gin (symbol_name extensions.gin_trgm_ops);
create index code_chunks_embedding_idx on public.code_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- repository_analyses
-- ---------------------------------------------------------------------------
create table public.repository_analyses (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.repositories (id) on delete cascade,
  summary jsonb not null default '{}'::jsonb,         -- AI inferences (clearly labelled)
  technology_stack jsonb not null default '[]'::jsonb, -- deterministic
  architecture_data jsonb not null default '{}'::jsonb,
  dependency_data jsonb not null default '{}'::jsonb,
  facts jsonb not null default '{}'::jsonb,            -- deterministic: entry points, directories, docs coverage
  analysis_version integer not null default 1,
  commit_sha text,
  created_at timestamptz not null default now()
);

create index repository_analyses_repo_idx on public.repository_analyses (repository_id, created_at desc);

-- ---------------------------------------------------------------------------
-- conversations & messages
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_repo_idx on public.conversations (user_id, repository_id, updated_at desc);
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  ui_id text not null,
  role public.message_role not null,
  content text not null default '',
  parts jsonb not null default '[]'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, ui_id)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- onboarding roadmaps & tasks
-- ---------------------------------------------------------------------------
create table public.onboarding_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  title text not null,
  summary text,
  experience_level public.experience_level,
  developer_role public.developer_role,
  learning_goal text,
  generated_by text not null default 'ai' check (generated_by in ('ai', 'deterministic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_roadmaps_user_repo_idx on public.onboarding_roadmaps (user_id, repository_id, created_at desc);
create trigger onboarding_roadmaps_updated_at before update on public.onboarding_roadmaps
  for each row execute function public.set_updated_at();

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.onboarding_roadmaps (id) on delete cascade,
  title text not null,
  description text not null,
  why_it_matters text,
  relevant_files jsonb not null default '[]'::jsonb,
  suggested_questions jsonb not null default '[]'::jsonb,
  estimated_minutes integer not null default 30 check (estimated_minutes between 1 and 1440),
  status public.task_status not null default 'todo',
  sort_order integer not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_tasks_roadmap_idx on public.onboarding_tasks (roadmap_id, sort_order);
create trigger onboarding_tasks_updated_at before update on public.onboarding_tasks
  for each row execute function public.set_updated_at();

create or replace function public.owns_roadmap(p_roadmap_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.onboarding_roadmaps r where r.id = p_roadmap_id and r.user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c where c.id = p_conversation_id and c.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting
-- ---------------------------------------------------------------------------
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup on public.rate_limit_events (user_id, bucket, created_at desc);

-- Returns true when the call is allowed (and records it). Identity comes from auth.uid().
create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    return false;
  end if;
  delete from public.rate_limit_events
    where user_id = v_uid and bucket = p_bucket and created_at < now() - make_interval(secs => p_window_seconds * 2);
  select count(*) into v_count from public.rate_limit_events
    where user_id = v_uid and bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_events (user_id, bucket) values (v_uid, p_bucket);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Retrieval RPCs (security invoker => RLS applies; ownership re-checked explicitly)
-- ---------------------------------------------------------------------------
create or replace function public.match_code_chunks(
  p_repository_id uuid,
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8,
  p_min_similarity double precision default 0.2
)
returns table (
  id uuid, file_path text, language text, symbol_name text, symbol_kind text,
  chunk_content text, start_line integer, end_line integer, similarity double precision
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.file_path, c.language, c.symbol_name, c.symbol_kind, c.chunk_content,
         c.start_line, c.end_line,
         1 - (c.embedding operator(extensions.<=>) p_query_embedding) as similarity
  from public.code_chunks c
  where c.repository_id = p_repository_id
    and public.owns_repository(p_repository_id)
    and c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) p_query_embedding) >= p_min_similarity
  order by c.embedding operator(extensions.<=>) p_query_embedding
  limit least(greatest(p_match_count, 1), 30);
$$;

create or replace function public.search_code_chunks(
  p_repository_id uuid,
  p_query text,
  p_match_count integer default 8
)
returns table (
  id uuid, file_path text, language text, symbol_name text, symbol_kind text,
  chunk_content text, start_line integer, end_line integer, rank double precision
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select websearch_to_tsquery('simple', p_query) as tsq,
           regexp_replace(p_query, '[^A-Za-z0-9_$]', '', 'g') as ident
  )
  select c.id, c.file_path, c.language, c.symbol_name, c.symbol_kind, c.chunk_content,
         c.start_line, c.end_line,
         (ts_rank(c.search_tsv, q.tsq)
          + case when q.ident <> '' and c.symbol_name ilike q.ident then 1.0 else 0 end
          + case when q.ident <> '' and c.symbol_name ilike '%' || q.ident || '%' then 0.3 else 0 end
         )::double precision as rank
  from public.code_chunks c, q
  where c.repository_id = p_repository_id
    and public.owns_repository(p_repository_id)
    and (c.search_tsv @@ q.tsq or (q.ident <> '' and c.symbol_name ilike '%' || q.ident || '%'))
  order by rank desc
  limit least(greatest(p_match_count, 1), 30);
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.repositories enable row level security;
alter table public.repository_files enable row level security;
alter table public.code_chunks enable row level security;
alter table public.repository_analyses enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.onboarding_roadmaps enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.rate_limit_events enable row level security;

create policy "profiles: own row" on public.profiles
  for all using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "repositories: owner" on public.repositories
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Files, chunks and analyses are written by the server-side ingestion worker (service role).
-- Users may read them for repositories they own.
create policy "repository_files: owner read" on public.repository_files
  for select using (public.owns_repository(repository_id));
create policy "code_chunks: owner read" on public.code_chunks
  for select using (public.owns_repository(repository_id));
create policy "repository_analyses: owner read" on public.repository_analyses
  for select using (public.owns_repository(repository_id));

create policy "conversations: owner" on public.conversations
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_repository(repository_id));

create policy "messages: via conversation" on public.messages
  for all using (public.owns_conversation(conversation_id))
  with check (public.owns_conversation(conversation_id));

create policy "roadmaps: owner" on public.onboarding_roadmaps
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_repository(repository_id));

create policy "tasks: via roadmap" on public.onboarding_tasks
  for all using (public.owns_roadmap(roadmap_id))
  with check (public.owns_roadmap(roadmap_id));

-- rate_limit_events: no policies => only security definer functions touch it.

-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded ZIP archives (private). Objects live under "<user id>/...".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('repo-archives', 'repo-archives', false, 52428800,
        array['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])
on conflict (id) do nothing;

create policy "repo-archives: upload own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'repo-archives' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "repo-archives: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'repo-archives' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "repo-archives: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'repo-archives' and (storage.foldername(name))[1] = (select auth.uid())::text);
