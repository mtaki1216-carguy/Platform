-- ============================================================================
--  割り勘（メンバーを限定した支出）
--  0004_income_parts_sale.sql を実行した後に、SQL Editor で実行してください。
--
--  割り勘はチーム口座を通らない「メンバー間の貸し借り」です。
--  そのため expenses には入れず、専用の2テーブルに分けています。
--  チーム残高・未精算の立替・費目別の集計には一切影響しません。
--
--    shared_expenses       … 1回の割り勘（誰が・いくら立て替えたか）
--    shared_expense_shares … 対象メンバーごとの負担額と、返済済みかどうか
-- ============================================================================

create table if not exists public.shared_expenses (
  id           uuid primary key default gen_random_uuid(),
  occurred_on  date not null default current_date,
  category     text,
  description  text not null,
  amount       integer not null,
  -- 立て替えた人。割り勘の記録が残っている間は削除できない
  paid_by      uuid not null references public.members(id) on delete restrict,
  race_id      uuid references public.races(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now(),

  constraint shared_expenses_amount_positive check (amount > 0)
);

comment on table public.shared_expenses is
  '割り勘の支出。チーム口座を通らないメンバー間の貸し借りで、チーム残高には含めない';

create table if not exists public.shared_expense_shares (
  id                 uuid primary key default gen_random_uuid(),
  shared_expense_id  uuid not null references public.shared_expenses(id) on delete cascade,
  member_id          uuid not null references public.members(id) on delete restrict,
  -- この人の負担額。立て替えた本人の分も入れる（本人の分は最初から返済済み）
  amount             integer not null,
  settled            boolean not null default false,
  settled_on         date,
  created_at         timestamptz not null default now(),

  constraint shared_expense_shares_amount_nonneg check (amount >= 0),
  -- 未返済なのに返済日が入っている状態を防ぐ
  constraint shared_expense_shares_settled_consistency check (settled or settled_on is null),
  -- 同じ割り勘に同じ人を2回入れない
  constraint shared_expense_shares_unique_member unique (shared_expense_id, member_id)
);

create index if not exists shared_expenses_occurred_on_idx
  on public.shared_expenses (occurred_on desc);
create index if not exists shared_expense_shares_open_idx
  on public.shared_expense_shares (member_id) where not settled;

-- ----------------------------------------------------------------------------
--  Row Level Security（他のテーブルと同じ：ログイン済みだけ読み書きできる）
-- ----------------------------------------------------------------------------
alter table public.shared_expenses       enable row level security;
alter table public.shared_expense_shares enable row level security;

do $$
declare t text;
begin
  foreach t in array array['shared_expenses','shared_expense_shares']
  loop
    execute format('drop policy if exists team_members_full_access on public.%I', t);
    execute format(
      'create policy team_members_full_access on public.%I
         for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
--  Realtime
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shared_expenses','shared_expense_shares']
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
--  PostgREST に新しいテーブルを知らせる。
--  これを忘れると「Could not find the table ... in the schema cache」が出る。
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
