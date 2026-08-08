-- ============================================================================
--  収入の種別に「部品売却」を足す
--  0003_recurring_expenses.sql を実行した後に、SQL Editor で実行してください。
--  既存の収入には影響しません。
--
--  チームの部品や備品を売ったお金は、チーム口座への入金としてそのまま数えます
--  （誰かの立替や会費ではないので、納入者は空欄のままで構いません）。
-- ============================================================================

-- ----------------------------------------------------------------------------
--  種別の許可リストを差し替える
--
--  制約は 0001 で名前を付けずに作ったので、環境によって名前が違う可能性がある。
--  incomes に付いている check 制約のうち 'membership_fee' を含むものを探して
--  落としてから、新しい許可リストを付け直す。
--  こうしておけば、このファイルを何度実行しても同じ結果になる。
-- ----------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.incomes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%membership_fee%'
  loop
    execute format('alter table public.incomes drop constraint %I', c.conname);
  end loop;

  alter table public.incomes
    add constraint incomes_category_check
    check (category in ('membership_fee','sponsor','parts_sale','carryover','refund','other'));
end $$;

comment on column public.incomes.category is
  'membership_fee = 会費 / sponsor = スポンサー / parts_sale = 部品売却 / '
  'carryover = 繰越金 / refund = 返金・払戻 / other = その他';

-- PostgREST に変更を読み直させる（これを忘れると API 側が古い定義を使い続ける）
notify pgrst, 'reload schema';
