-- Esquema de Ruta a 1000. Un usuario = sus propias filas (RLS en todas las tablas).

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  chesscom_username text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ext_id text not null,                       -- URL de Chess.com, "seed:…" o "pgn:<hash>"
  source text not null check (source in ('chesscom','pgn','seed')),
  played_at timestamptz not null,
  time_control text,
  color char(1) not null check (color in ('w','b')),
  result char(1) not null check (result in ('W','D','L')),
  termination text,
  my_elo int,
  opp_elo int,
  opening text,
  pgn text not null,
  analysis jsonb,                             -- {v, evals[], pv[][]} del motor
  stats jsonb,                                -- métricas por partida (src/analysis/core.ts)
  created_at timestamptz not null default now(),
  unique (user_id, ext_id)
);
create index games_user_played_idx on public.games (user_id, played_at desc);

create table public.puzzles (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  game_id uuid references public.games(id) on delete cascade,
  phase text not null,
  motif text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index puzzles_game_idx on public.puzzles (game_id);

create table public.reviews (                 -- repetición espaciada (Leitner)
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id text not null,
  kind text not null check (kind in ('line','puzzle','endgame')),
  box int not null default 0,
  due date not null default current_date,
  seen int not null default 0,
  ok int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.attempts (                -- historial de intentos (racha y % de aciertos)
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id text not null,
  kind text not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index attempts_user_at_idx on public.attempts (user_id, at desc);

alter table public.settings enable row level security;
alter table public.games enable row level security;
alter table public.puzzles enable row level security;
alter table public.reviews enable row level security;
alter table public.attempts enable row level security;

create policy "own settings" on public.settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own games" on public.games for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own puzzles" on public.puzzles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own reviews" on public.reviews for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own attempts" on public.attempts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
