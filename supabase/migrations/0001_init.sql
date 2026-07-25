-- ============================================================================
--  耐久レースチーム運営プラットフォーム — 初期スキーマ
--  Supabase (PostgreSQL) 用。Supabase ダッシュボードの SQL Editor に
--  このファイルの内容をそのまま貼り付けて実行してください。
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
--  メンバー
-- ----------------------------------------------------------------------------
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  name       text    not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.members is 'チームメンバー。支出の立替者や整備の作業者として参照される';

-- ----------------------------------------------------------------------------
--  レース（機能③）
-- ----------------------------------------------------------------------------
create table if not exists public.races (
  id             uuid primary key default gen_random_uuid(),
  name           text    not null,
  circuit        text,
  starts_on      date    not null,                 -- 決勝日 / 開催初日
  ends_on        date,                             -- 複数日開催の最終日（単日なら null）
  entry_fee      integer not null default 0 check (entry_fee >= 0),
  entry_opens_on date,                             -- 申込開始日
  entry_deadline date,                             -- 申込締切日
  applied_on     date,                             -- 実際に申し込んだ日
  status         text    not null default 'considering'
                 check (status in ('considering','planned','applied','accepted','declined','finished','cancelled')),
  fee_paid       boolean not null default false,   -- 参加費の支払い済みフラグ
  url            text,
  note           text,
  created_at     timestamptz not null default now(),
  constraint races_period_order check (ends_on is null or ends_on >= starts_on),
  constraint races_entry_window check (
    entry_opens_on is null or entry_deadline is null or entry_deadline >= entry_opens_on
  )
);

comment on column public.races.status is
  'considering=検討中 / planned=参加予定 / applied=申込済 / accepted=エントリー受理 / declined=不参加 / finished=終了 / cancelled=中止';

create index if not exists races_starts_on_idx on public.races (starts_on);

-- レース参加メンバー（耐久のドライバーラインナップ）
create table if not exists public.race_participants (
  race_id   uuid not null references public.races(id)   on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  role      text not null default 'driver' check (role in ('driver','pit','support')),
  primary key (race_id, member_id)
);

-- ----------------------------------------------------------------------------
--  整備記録（機能②）
-- ----------------------------------------------------------------------------
create table if not exists public.maintenance_records (
  id           uuid primary key default gen_random_uuid(),
  performed_on date    not null,
  odometer_km  integer check (odometer_km >= 0),    -- 実施時点の走行距離
  category     text    not null default 'other'
               check (category in ('engine','brake','tire','wheel','suspension','drivetrain',
                                   'electrical','cooling','body','fluid','inspection','other')),
  title        text    not null,                    -- 例: フロントブレーキパッド交換
  detail       text,
  performed_by uuid references public.members(id) on delete set null,
  shop         text,                                -- 作業場所 / ショップ名
  next_due_on  date,                                -- 次回交換の目安（日付）
  next_due_km  integer check (next_due_km >= 0),    -- 次回交換の目安（走行距離）
  race_id      uuid references public.races(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists maintenance_performed_on_idx on public.maintenance_records (performed_on desc);

-- ----------------------------------------------------------------------------
--  収入（機能① — 主に会費）
-- ----------------------------------------------------------------------------
create table if not exists public.incomes (
  id          uuid primary key default gen_random_uuid(),
  occurred_on date    not null,
  category    text    not null default 'membership_fee'
              check (category in ('membership_fee','sponsor','carryover','refund','other')),
  member_id   uuid references public.members(id) on delete set null,  -- 会費の納入者
  amount      integer not null check (amount > 0),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists incomes_occurred_on_idx on public.incomes (occurred_on desc);

-- ----------------------------------------------------------------------------
--  支出（機能① — チーム口座払い / 個人立替）
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  occurred_on    date    not null,
  category       text    not null default 'other'
                 check (category in ('parts','consumables','tire','fuel','entry_fee','transport',
                                     'maintenance','insurance','equipment','other')),
  description    text    not null,
  amount         integer not null check (amount > 0),

  -- 支払元: team = チーム口座から直接 / member = メンバーの個人立替
  payer_type     text    not null check (payer_type in ('team','member')),
  paid_by        uuid references public.members(id) on delete restrict,

  -- 立替の精算状況（payer_type = 'member' のときのみ意味を持つ）
  reimbursed     boolean not null default false,
  reimbursed_on  date,

  race_id        uuid references public.races(id) on delete set null,
  maintenance_id uuid references public.maintenance_records(id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),

  -- チーム口座払いに立替者や精算は存在しない / 立替には必ず立替者が要る
  constraint expenses_payer_consistency check (
    (payer_type = 'team'   and paid_by is null and reimbursed = false and reimbursed_on is null)
    or
    (payer_type = 'member' and paid_by is not null)
  ),
  -- 未精算なのに精算日が入っている状態を防ぐ
  constraint expenses_reimbursed_consistency check (reimbursed or reimbursed_on is null)
);

create index if not exists expenses_occurred_on_idx  on public.expenses (occurred_on desc);
create index if not exists expenses_unsettled_idx    on public.expenses (paid_by) where payer_type = 'member' and not reimbursed;

comment on table public.expenses is
  '支出の単一の真実。整備費用も参加費もここに入る（maintenance_id / race_id で紐付け）ため二重計上が起きない';

-- ============================================================================
--  Row Level Security
--  ログイン済み（チーム共有アカウントでサインインした状態）のみ読み書き可能。
--  anon ロールには一切の権限を与えないため、URL を知られただけでは中身は見えない。
-- ============================================================================
alter table public.members             enable row level security;
alter table public.races               enable row level security;
alter table public.race_participants   enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.incomes             enable row level security;
alter table public.expenses            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['members','races','race_participants','maintenance_records','incomes','expenses']
  loop
    execute format('drop policy if exists team_members_full_access on public.%I', t);
    execute format(
      'create policy team_members_full_access on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================================
--  Realtime — 5人が同じ画面を開いていても残高が即座に同期される
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['members','races','race_participants','maintenance_records','incomes','expenses']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
--  PostgREST に列構成の変更を知らせる。
--  これを忘れると、列は増えているのに API が古い定義のままになり
--  「Could not find the 'xxx' column ... in the schema cache」が出る。
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
