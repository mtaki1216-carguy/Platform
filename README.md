# 耐久レースチーム 運営プラットフォーム

同期5人（秋山・井上・森・長谷川・田村）の耐久レースチームを運営するための Web アプリです。

| 機能 | 内容 |
| --- | --- |
| ① 予算管理 | 収入（会費・スポンサー）と支出（チーム口座払い／個人立替）から、**チーム残高をリアルタイムに表示**。個人立替は精算状況まで管理し、「誰にいくら返すべきか」が一覧で分かります。 |
| ② 整備記録 | 整備内容を実施日・走行距離とあわせてデータベースに保存。次回交換の目安（日付／km）を持たせ、時期が近いものを警告します。費用は支出として①に連動。 |
| ③ レース管理 | 出場予定レースの日程・参加費・申込受付開始日／締切日／申込日を保存。**各レースの申込状況が一覧で一目で分かり**、その場で状況を進められます。 |

構成は **フロントエンド（React）とデータベース（Supabase）を分離**しています。どちらも無料枠のオープンサービスだけで動きます。

```
Platform/
├── supabase/
│   ├── migrations/0001_init.sql   ← テーブル・RLS・Realtime の定義
│   ├── seed.sql                   ← メンバー5名の初期データ
│   └── verify.sql                 ← セットアップが揃っているかの確認用
└── frontend/                      ← React + TypeScript + Vite（Vercel にデプロイ）
    └── src/
        ├── lib/finance.ts         ← 残高計算のすべて（唯一の計算元）
        ├── data/DataProvider.tsx  ← 全データの取得と Realtime 同期
        ├── charts/                ← 残高推移・月次収支のグラフ（自前の SVG）
        ├── forms/                 ← 収入・支出・整備・レースの入力フォーム
        └── pages/                 ← ダッシュボード / 予算 / 整備 / レース / メンバー
```

---

## セットアップ（初回だけ・30分ほど）

### 1. Supabase プロジェクトを作る

1. [supabase.com](https://supabase.com) で無料アカウントを作り、新規プロジェクトを作成します。
   リージョンは **Northeast Asia (Tokyo)** が最も速いです。
2. 左メニューの **SQL Editor** を開き、`supabase/migrations/0001_init.sql` の中身を全部貼り付けて **Run**。
3. 同じく `supabase/seed.sql` を貼り付けて **Run**（メンバー5名が登録されます）。
4. 確認として `supabase/verify.sql` を貼り付けて **Run**。
   「判定」列がすべて `OK` になっていれば手順1・2は完了です。
   最下行に `VITE_TEAM_EMAIL` に入れる値も出ます。

### 2. チーム共有アカウントを1つ作る

ログインは「チーム共通パスワード」方式ですが、実体は **Supabase Auth の共有アカウント1つ**です。
こうしておくと、パスワードの判定がサーバー側（RLS）で行われるため、
**URL や anon key を知られただけではデータを1行も読めません。**

1. **Authentication → Users → Add user** を開きます。
2. メールアドレス（例 `team@your-domain.example`）と、5人で共有するパスワードを入力。
3. **Auto Confirm User** を **オン**にして作成（確認メールを踏まずに使えます）。

> パスワードを変えたいときは、同じ画面でこのユーザーのパスワードを更新するだけです。
> アプリ側の変更は要りません。

### 3. 環境変数を設定する

Supabase の **Project Settings → API** から2つの値をコピーします。

```bash
cd frontend
cp .env.example .env.local
```

`.env.local` を編集します。

| 変数 | 値 |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_TEAM_EMAIL` | 手順2で作ったメールアドレス |
| `VITE_TEAM_NAME` | 画面に出すチーム名（任意） |

> `anon key` は公開前提の鍵で、フロントエンドに埋め込んで問題ありません。
> **`service_role` key は絶対に置かないでください**（RLS を無視できてしまいます）。

### 4. 手元で動かす

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

環境変数が未設定のときは白紙にならず、セットアップ手順そのものが画面に出ます。

### 5. Vercel に公開する

1. [vercel.com](https://vercel.com) でこの GitHub リポジトリを **Import**。
2. **Root Directory** に `frontend` を指定します（`frontend/vercel.json` が残りを設定します）。
3. **Environment Variables** に手順3の4つを登録して Deploy。

以降は `main` への push で自動デプロイされます。5人には公開 URL と共通パスワードを共有すれば完了です。

---

## 残高の計算ルール

ここだけは曖昧にしないよう、定義を明記します。実装は `frontend/src/lib/finance.ts` の1か所だけです。

**チーム残高は「チーム口座に今いくらあるか」**です。現金が動いたかどうかで数えます。

| 種類 | いつ口座が動くか |
| --- | --- |
| 収入 | 入金日に **＋** |
| 支出（チーム口座払い） | 支払日に **−** |
| 支出（個人立替） | 立替た日には**動かない**。**精算した日**に **−**（本人へ払い戻すため） |

```
チーム残高       = 収入合計 − チーム口座払い合計 − 精算済み立替の合計
未精算立替       = まだ精算していない立替の合計（メンバーごとに集計）
精算後見込み残高 = チーム残高 − 未精算立替
```

つまり **未精算の立替はチーム残高には現れません**。代わりに「誰にいくら返すべきか」として別枠で表示し、
全部返した後に残る額を「精算後見込み残高」として出します。
精算後がマイナスになる場合は画面上で警告が出ます。

### 費用の二重計上を防ぐ設計

お金は **`expenses` テーブルだけ**が持ちます。整備記録やレースは金額を持たず、
`expenses.maintenance_id` / `expenses.race_id` で支出側から紐付けます。
そのため「整備費用の合計」と「支出の合計」がずれることが構造的に起きません。

整備を登録する画面で「費用も支出として登録する」にチェックを入れると、
整備記録と紐付いた支出が同時に作られます。

---

## データモデル

| テーブル | 役割 | 主な列 |
| --- | --- | --- |
| `members` | メンバー | `name`, `sort_order` |
| `incomes` | 収入 | `occurred_on`, `category`(会費/スポンサー/繰越/返金), `member_id`, `amount` |
| `expenses` | 支出（金額の唯一の置き場） | `occurred_on`, `category`, `amount`, `payer_type`(team/member), `paid_by`, `reimbursed`, `reimbursed_on`, `race_id`, `maintenance_id` |
| `maintenance_records` | 整備記録 | `performed_on`, `odometer_km`, `category`, `title`, `detail`, `performed_by`, `shop`, `next_due_on`, `next_due_km`, `race_id` |
| `races` | レース | `name`, `circuit`, `starts_on`, `ends_on`, `entry_fee`, `entry_opens_on`, `entry_deadline`, `applied_on`, `status`, `fee_paid` |
| `race_participants` | 参加メンバー | `race_id`, `member_id`, `role`(ドライバー/ピット/サポート) |

矛盾したデータが入らないよう、DB 側に制約を置いています。

- チーム口座払いに立替者や精算日は入らない／立替には必ず立替者が要る（`expenses_payer_consistency`）
- 未精算なのに精算日が入っている状態を防ぐ（`expenses_reimbursed_consistency`）
- レースの最終日は開催日以降、申込締切は受付開始日以降

### 申込状況（`races.status`）

`検討中` → `参加予定` → `申込済` → `エントリー受理` → `終了`
（ほかに `不参加` / `中止`）

一覧のプルダウンでそのまま進められます。`申込済` にしたとき申込日が空なら、その日の日付が自動で入ります。

---

## リアルタイム同期

Supabase Realtime を使い、誰かが登録・変更すると**他の人の画面も自動で更新されます**。
5人分のデータは小さいので、変更通知を受けたら全件読み直す方式です（差分適用より単純で取りこぼしがない）。
タブを切り替えて戻ったときも、切断中の変更を取りに行きます。

## メンバー画面の「自分」設定

全員が同じアカウントでログインするため、誰が操作しているかはサーバー側では分かりません。
**メンバー**画面で「自分」を選んでおくと、支出の立替者や整備の作業者の初期値になります
（この設定はそのブラウザにだけ保存されます）。

---

## 開発

```bash
cd frontend
npm run dev        # 開発サーバー
npm run build      # 型チェック + 本番ビルド
npm run typecheck  # 型チェックのみ
```

- 画面はライトモード専用です。
- グラフは外部ライブラリを使わず SVG を直接描いています（`src/charts/`）。
  収入 = 青 `#2a78d6` / 支出 = 橙 `#eb6834` の2色は、色覚特性を含む見分けやすさの検証を通した組み合わせです。
  グラフの数字は「月次の内訳」の表からも読めるようにしてあります。
