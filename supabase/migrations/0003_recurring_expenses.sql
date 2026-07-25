-- ============================================================================
--  固定費（毎月払いの支出）
--  0002_sprints.sql を実行した後に、SQL Editor で実行してください。
--  既存の支出はすべて「単発」（recurrence = 'once'）になります。
-- ============================================================================

-- ----------------------------------------------------------------------------
--  支出に「毎月払い」の情報を足す
--
--  毎月ぶんの行を作るのではなく、1件の記録に「毎月何日に払うか」を持たせ、
--  今日までに何回払ったかをアプリ側で数える。行を自動生成すると、
--  誰の端末がいつ生成するかで重複や抜けが起きるため。
-- ----------------------------------------------------------------------------
alter table public.expenses
  add column if not exists recurrence text not null default 'once',
  add column if not exists payment_day smallint,
  add column if not exists recurrence_ends_on date;

comment on column public.expenses.recurrence is
  'once = 単発 / monthly = 毎月払いの固定費';
comment on column public.expenses.payment_day is
  '毎月の支払日（1〜31）。31日など月末に無い日は、その月の最終日に丸めて数える';
comment on column public.expenses.recurrence_ends_on is
  '固定費を止めた日。null なら継続中。この日を過ぎた分は計上しない';

-- 制約は add constraint if not exists が使えないので、有無を見てから付ける
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_recurrence_values'
  ) then
    alter table public.expenses
      add constraint expenses_recurrence_values
      check (recurrence in ('once', 'monthly'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_payment_day_range'
  ) then
    alter table public.expenses
      add constraint expenses_payment_day_range
      check (payment_day is null or payment_day between 1 and 31);
  end if;

  -- 単発に支払日や終了日は入らない／固定費には必ず支払日が要る
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_recurrence_consistency'
  ) then
    alter table public.expenses
      add constraint expenses_recurrence_consistency
      check (
        (recurrence = 'once'    and payment_day is null and recurrence_ends_on is null)
        or
        (recurrence = 'monthly' and payment_day is not null)
      );
  end if;

  -- 終了日が開始日より前だと1回も計上されず、記録として意味を持たない
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_recurrence_period_order'
  ) then
    alter table public.expenses
      add constraint expenses_recurrence_period_order
      check (recurrence_ends_on is null or recurrence_ends_on >= occurred_on);
  end if;
end $$;

create index if not exists expenses_recurring_idx
  on public.expenses (recurrence) where recurrence = 'monthly';
