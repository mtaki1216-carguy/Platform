-- ============================================================================
--  セットアップ確認用
--  SQL Editor に貼り付けて実行すると、必要なものが揃っているかを一覧で返します。
--  「判定」列がすべて OK なら、あとは環境変数を入れるだけです。
-- ============================================================================

with expected(name) as (
  values ('members'), ('incomes'), ('expenses'),
         ('races'), ('maintenance_records'), ('race_participants')
)
select 項目, 結果, 判定 from (

  -- 6つのテーブルができているか
  select 1 as ord, 'テーブル' as 項目,
         count(*) || ' / 6' as 結果,
         case when count(*) = 6 then 'OK' else '不足（0001_init.sql を実行してください）' end as 判定
  from information_schema.tables t
  where t.table_schema = 'public' and t.table_name in (select name from expected)

  union all

  -- 各テーブルで行レベルセキュリティが有効か（無効だと誰でも読めてしまう）
  select 2, 'RLS 有効',
         count(*) || ' / 6',
         case when count(*) = 6 then 'OK' else '未設定あり（要注意）' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relrowsecurity
    and c.relname in (select name from expected)

  union all

  -- ログイン済みだけ読み書きできるポリシーが貼られているか
  select 3, 'アクセスポリシー',
         count(*) || ' / 6',
         case when count(*) = 6 then 'OK' else '不足' end
  from pg_policies
  where schemaname = 'public'
    and policyname = 'team_members_full_access'
    and tablename in (select name from expected)

  union all

  -- 5人の画面が自動同期するための設定
  select 4, 'Realtime 配信',
         count(*) || ' / 6',
         case when count(*) = 6 then 'OK' else '不足（同期されません）' end
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

  -- 環境変数 VITE_TEAM_EMAIL に入れる値
  select 8, 'VITE_TEAM_EMAIL に入れる値',
         coalesce(string_agg(email, ', '), '（アカウント未作成）'),
         '↑ この値をそのまま使います'
  from auth.users

) checks
order by ord;
