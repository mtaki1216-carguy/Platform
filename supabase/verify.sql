-- ============================================================================
--  セットアップ確認用
--  SQL Editor に貼り付けて実行すると、必要なものが揃っているかを一覧で返します。
--  「判定」列がすべて OK なら、あとは環境変数を入れるだけです。
--
--  0002_sprints.sql を実行していない状態でも、エラーで止まらずに
--  「実行してください」と表示されます。
-- ============================================================================

-- スプリント関連の確認。sprints テーブルが無くても落ちないよう動的SQLで包む。
-- pg_temp なので接続を閉じれば消え、スキーマには残らない。
create or replace function pg_temp.sprint_checks()
returns table (ord numeric, item text, result text, verdict text)
language plpgsql as $fn$
begin
  if to_regclass('public.sprints') is null then
    return query select 7.5::numeric, '進行中のスプリント'::text, '—'::text,
                        '0002_sprints.sql を実行してください'::text;
    return query select 7.6::numeric, 'スプリント未割り当ての記録'::text, '—'::text,
                        '0002_sprints.sql を実行してください'::text;
    return;
  end if;

  return query execute $q$
    select 7.5::numeric, '進行中のスプリント'::text,
           (count(*) || ' 件')::text,
           (case when count(*) = 1 then 'OK'
                 when count(*) = 0 then '無し（記録を登録すると自動で始まります）'
                 else '複数あります（想定外）' end)::text
    from public.sprints where ended_on is null
  $q$;

  return query execute $q$
    with orphan as (
      select (select count(*) from public.incomes  where sprint_id is null)
           + (select count(*) from public.expenses where sprint_id is null) as n
    )
    -- 集計は日付で行うので、未割り当てでも金額は漏れない。
    -- 0002 のバックフィルが走ったかどうかの確認用。
    select 7.6::numeric, 'sprint_id 未設定の記録'::text,
           (n || ' 件')::text,
           (case when n = 0 then 'OK'
                 else '0002_sprints.sql のバックフィルが未実行（集計は日付で行うため金額は正しく出ます）' end)::text
    from orphan
  $q$;
end $fn$;

with expected(name) as (
  values ('sprints'), ('members'), ('incomes'), ('expenses'),
         ('races'), ('maintenance_records'), ('race_participants')
)
select 項目, 結果, 判定 from (

  -- 7つのテーブルができているか
  select 1::numeric as ord, 'テーブル' as 項目,
         (count(*) || ' / 7')::text as 結果,
         (case when count(*) = 7 then 'OK'
               when count(*) = 6 then 'sprints がありません（0002_sprints.sql を実行してください）'
               else '不足（0001_init.sql を実行してください）' end)::text as 判定
  from information_schema.tables t
  where t.table_schema = 'public' and t.table_name in (select name from expected)

  union all

  -- 各テーブルで行レベルセキュリティが有効か（無効だと誰でも読めてしまう）
  select 2, 'RLS 有効',
         count(*) || ' / 7',
         case when count(*) = 7 then 'OK' else '未設定あり（要注意）' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relrowsecurity
    and c.relname in (select name from expected)

  union all

  -- ログイン済みだけ読み書きできるポリシーが貼られているか
  select 3, 'アクセスポリシー',
         count(*) || ' / 7',
         case when count(*) = 7 then 'OK' else '不足' end
  from pg_policies
  where schemaname = 'public'
    and policyname = 'team_members_full_access'
    and tablename in (select name from expected)

  union all

  -- 5人の画面が自動同期するための設定
  select 4, 'Realtime 配信',
         count(*) || ' / 7',
         case when count(*) = 7 then 'OK' else '不足（同期されません）' end
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
    and tablename in (select name from expected)

  union all

  -- メンバーが登録されているか
  select 5, 'メンバー登録',
         count(*) || ' 名',
         case when count(*) >= 5 then 'OK'
              when count(*) = 0 then '未登録（seed.sql を実行してください）'
              else '5名に足りません' end
  from public.members

  union all

  -- チーム共有アカウントがちょうど1つあるか
  select 6, 'ログイン用アカウント',
         count(*) || ' 件',
         case when count(*) = 1 then 'OK'
              when count(*) = 0 then '未作成（Authentication → Users → Add user）'
              else '複数あります（共有アカウントは1つに）' end
  from auth.users

  union all

  -- メール未確認だとログインできない
  select 7, 'メール確認済み',
         count(*) || ' 件',
         case when count(*) >= 1 then 'OK'
              else '未確認（Users で該当ユーザーを Confirm してください）' end
  from auth.users where email_confirmed_at is not null

  union all

  -- テーブルがあっても列が足りていないことがあるので、列の有無も見る。
  -- 足りないと「Could not find the 'xxx' column」で登録に失敗する。
  select 7.2, '列: sprint_id（収入・支出）',
         count(*) || ' / 2',
         case when count(*) = 2 then 'OK'
              else '0002_sprints.sql を実行してください' end
  from information_schema.columns
  where table_schema = 'public' and column_name = 'sprint_id'
    and table_name in ('incomes', 'expenses')

  union all

  select 7.3, '列: 固定費（支出）',
         count(*) || ' / 3',
         case when count(*) = 3 then 'OK'
              else '0003_recurring_expenses.sql を実行してください' end
  from information_schema.columns
  where table_schema = 'public' and table_name = 'expenses'
    and column_name in ('recurrence', 'payment_day', 'recurrence_ends_on')

  union all

  -- 列ではなく制約で弾かれるものは、許可リストの中身を見て判定する
  select 7.4, '収入の種別: 部品売却',
         case when count(*) = 1 then '許可あり' else '許可なし' end,
         case when count(*) = 1 then 'OK'
              else '0004_income_parts_sale.sql を実行してください' end
  from pg_constraint
  where conrelid = 'public.incomes'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%parts_sale%'

  union all

  -- 進行中スプリントの有無と、未割り当ての記録がないか
  select * from pg_temp.sprint_checks()

  union all

  -- 環境変数 VITE_TEAM_EMAIL に入れる値
  select 8, 'VITE_TEAM_EMAIL に入れる値',
         coalesce(string_agg(email, ', '), '（アカウント未作成）'),
         '↑ この値をそのまま使います'
  from auth.users

) checks
order by ord;
