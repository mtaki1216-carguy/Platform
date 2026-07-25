-- ============================================================================
--  スプリント単位の予算管理
--  0001_init.sql を実行した後に、SQL Editor で実行してください。
--  既存の収入・支出はすべて最初のスプリントに割り当てられます。
-- ============================================================================

-- ----------------------------------------------------------------------------
--  スプリント
--  名前は未入力（null）で自動的に始まり、後から付けられる。
--  ended_on が null のものが「進行中」。終了させると次のスプリントが始まる。
-- ----------------------------------------------------------------------------
create table if not exists public.sprints (
  id         uuid primary key default gen_random_uuid(),
  name       text,                                    -- 未入力で始まる
  started_on date not null default current_date,
  ended_on   date,                                    -- null = 進行中
  note       text,
  created_at timestamptz not null default now(),
  constraint sprints_period_order check (ended_on is null or ended_on >= started_on)
);

comment on table public.sprints is
  '予算を区切る単位。精算を終えてチーム残高を確定させたタイミングで終了させる';

-- 進行中のスプリントは常に1つだけ。
-- 5人が同時に操作しても2つ開かないよう DB 側で保証する
-- （式が常に true になる部分ユニークインデックス）。
create unique index if not exists sprints_single_open_idx
  on public.sprints ((ended_on is null))
  where ended_on is null;

create index if not exists sprints_started_on_idx on public.sprints (started_on);

-- ----------------------------------------------------------------------------
--  収入・支出をスプリントに紐付ける
--  スプリントを消しても記録は残す（set null）。金額を失う方が危険。
-- ----------------------------------------------------------------------------
alter table public.incomes
  add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

alter table public.expenses
  add column if not exists sprint_id uuid references public.sprints(id) on delete set null;

create index if not exists incomes_sprint_idx  on public.incomes (sprint_id);
create index if not exists expenses_sprint_idx on public.expenses (sprint_id);

-- ----------------------------------------------------------------------------
--  最初のスプリントを用意し、既存の記録を割り当てる
--  何度実行しても安全（進行中があれば作らない／未割り当てだけ埋める）。
-- ----------------------------------------------------------------------------
do $$
declare
  open_id    uuid;
  first_date date;
begin
  select id into open_id from public.sprints where ended_on is null limit 1;

  if open_id is null then
    -- 記録がすでにあるなら、その最も古い日付を開始日にする
    select least(
             (select min(occurred_on) from public.incomes),
             (select min(occurred_on) from public.expenses)
           )
      into first_date;

    insert into public.sprints (name, started_on)
      values (null, coalesce(first_date, current_date))
      returning id into open_id;
  end if;

  update public.incomes  set sprint_id = open_id where sprint_id is null;
  update public.expenses set sprint_id = open_id where sprint_id is null;
end $$;

-- ============================================================================
--  RLS と Realtime（0001 と同じ方針）
-- ============================================================================
alter table public.sprints enable row level security;

drop policy if exists team_members_full_access on public.sprints;
create policy team_members_full_access on public.sprints
  for all to authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sprints'
  ) then
    alter publication supabase_realtime add table public.sprints;
  end if;
end $$;
