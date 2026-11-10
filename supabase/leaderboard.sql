-- Run once in the Supabase project's SQL Editor. Safe to rerun.
create table if not exists public.high_scores (
  id bigint generated always as identity primary key,
  run_id uuid not null unique,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 24),
  score integer not null check (score between 1 and 1000000),
  created_at timestamptz not null default now()
);
create index if not exists high_scores_ranking on public.high_scores (score desc, id asc);
alter table public.high_scores enable row level security;
-- Clients can only use the two restricted RPC functions, not mutate the table.
revoke all on public.high_scores from anon, authenticated;
revoke all on sequence public.high_scores_id_seq from anon, authenticated;

create or replace function public.get_top_scores()
returns table (player_name text, score integer)
language sql stable security definer set search_path = ''
as $$
  select h.player_name, h.score from public.high_scores h
  order by h.score desc, h.id asc limit 3;
$$;

create or replace function public.submit_score(p_run_id uuid, p_player_name text, p_score integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_run_id is null or p_player_name is null or
     char_length(btrim(p_player_name)) not between 1 and 24 or
     p_score is null or p_score not between 1 and 1000000 then
    raise exception 'Invalid score submission' using errcode = '22023';
  end if;
  insert into public.high_scores (run_id, player_name, score)
  values (p_run_id, btrim(p_player_name), p_score)
  on conflict (run_id) do nothing;
end;
$$;

revoke all on function public.get_top_scores() from public;
revoke all on function public.submit_score(uuid, text, integer) from public;
grant execute on function public.get_top_scores() to anon, authenticated;
grant execute on function public.submit_score(uuid, text, integer) to anon, authenticated;
