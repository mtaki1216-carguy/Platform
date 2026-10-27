-- ============================================================================
--  車両の現在の状態（タイヤなど）
--  0005_shared_expenses.sql を実行した後に、SQL Editor で実行してください。
--
--  チームの車は1台なので、行は1つだけ（id は常に true）。
--  ダッシュボードの「車両の状態」から編集します。
-- ============================================================================

create table if not exists public.vehicle_status (
  id          boolean primary key default true,
  -- タイヤのサイズは書式を縛らず、書いたとおりに保存する（例: 195/55/15）
  tire_front  text,
  tire_rear   text,
  -- タイヤ以外の状態（ホイール、ブレーキパッド、気になっていることなど）
  note        text,
  updated_at  timestamptz not null default now(),

  -- 2行目を作れないようにして、常に1行だけにする
  constraint vehicle_status_singleton check (id)
);

comment on table public.vehicle_status is
  '車両の現在の状態。常に1行だけ。タイヤのサイズなどをダッシュボードに表示する';

-- 最初の1行を用意しておく（空のまま）
insert into public.vehicle_status (id) values (true) on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
--  Row Level Security（他のテーブルと同じ：ログイン済みだけ読み書きできる）
-- ----------------------------------------------------------------------------
alter table public.vehicle_status enable row level security;

drop policy if exists team_members_full_access on public.vehicle_status;
create policy team_members_full_access on public.vehicle_status
  for all to authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
--  Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vehicle_status'
  ) then
    alter publication supabase_realtime add table public.vehicle_status;
  end if;
end $$;

-- ----------------------------------------------------------------------------
--  PostgREST に新しいテーブルを知らせる（忘れると schema cache のエラーになる）
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
