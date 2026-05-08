# 本番化手順（LINE/LINE WORKS勤怠連携）

## 1. 目的
- LINE/LINE WORKSで「出勤・退勤・休憩開始・休憩終了」を送信
- Webhookで受信し、管理ツールに自動反映
- 紙/物理タイムカード運用を廃止

## 2. 実装済み構成
- `server.js`
  - `POST /line/webhook` LINE Webhook受信（署名検証あり）
  - `POST /api/line-action` Web画面からの打刻API
  - `GET /api/bootstrap` 管理画面同期API
  - `GET /api/health` ヘルスチェック
  - `GET /api/system/persistence-status` 永続化/照合設定の確認API
- `app.v3.js`
  - API優先モード（httpで開いた場合はAPI同期）
  - LINE打刻結果の自動反映（5秒ポーリング）

## 3. ローカル起動
```bash
cd "/Users/souma/営業事業部/SNS事業部決算ツール月次/SellYouPLツール/新規事業デモツール"
npm install
npm run dev
open "http://localhost:3000/index.html"
```

## 4. LINE Developers 側設定
1. Messaging APIチャネル作成
2. チャネルシークレット取得
3. 長期アクセストークン発行
4. Webhook URL設定
   - 例: `https://<your-domain>/line/webhook`
5. Webhook利用をON
6. 応答メッセージ（LINE公式の自動応答）はOFF推奨
7. リッチメニューの「マニュアル確認」は
   - `メッセージ送信`: `マニュアル確認` もしくは
   - `URI`: `https://<your-domain>/manual/index.html`
   のどちらかに設定

## 5. 環境変数
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_USER_MAP_JSON`（任意）
- `MANUAL_PUBLIC_URL`（推奨: `https://<your-domain>/manual/index.html`）
- `MANUAL_PAGE_PATH`（任意: 既定 `/manual/index.html`）

### 5-1. Supabase（DB永続化）
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STATE_TABLE`（任意: 既定 `app_state_snapshots`）
- `SUPABASE_STATE_KEY`（任意: 既定 `liive-primary`）
- `APP_TENANT_ID`（任意: 既定 `default`）

### 5-2. Supabase Storage（証拠画像）
- `SUPABASE_STORAGE_BUCKET`（例: `liive-evidence`）
- `SUPABASE_EVIDENCE_PREFIX`（任意: 既定 `evidence`）
- `EVIDENCE_RETENTION_DAYS`（任意: 既定 `730`）

### 5-3. 顔認識・飲酒値照合
- `EVIDENCE_VERIFICATION_MODE`
  - `off`（既定）
  - `warn`（照合失敗を警告として記録）
  - `strict`（照合失敗/未完了時に打刻を保留）
- `AWS_REKOGNITION_ENABLED=true`
- `AWS_TEXTRACT_ENABLED=true`
- `AWS_REGION`（例: `ap-northeast-1`）
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `FACE_MATCH_THRESHOLD`（任意: 既定 `90`）
- `ALCOHOL_OCR_TOLERANCE`（任意: 既定 `0.02`）

### 5-4. 管理者ログイン
- `ADMIN_AUTH_ENABLED=true`
- `ADMIN_LOGIN_ID`（例: `admin`）
- `ADMIN_LOGIN_PASSWORD`（必須）
- `ADMIN_SESSION_SECRET`（推奨）
- `ADMIN_SESSION_TTL_HOURS`（任意: 既定 `12`）

### 5-5. 日次バックアップ
- `BACKUP_ENABLED=true`
- `BACKUP_HOUR_JST`（任意: 既定 `3`）
- `BACKUP_MINUTE_JST`（任意: 既定 `15`）
- `BACKUP_RETENTION_DAYS`（任意: 既定 `30`）
- `BACKUP_SUPABASE_UPLOAD=true`（任意）
- `BACKUP_SUPABASE_BUCKET`（任意: 未指定なら `SUPABASE_STORAGE_BUCKET` を利用）
- `BACKUP_SUPABASE_PREFIX`（任意: 既定 `backups`）

### LINE_USER_MAP_JSON 例
```json
{
  "Uxxxxxxxxxxxxxxxxxxxx": { "employee": "田中", "site": "品川ヤード" },
  "Uyyyyyyyyyyyyyyyyyyyy": { "employee": "佐藤", "site": "渋谷現場" }
}
```

## 6. Render本番デプロイ（推奨）
1. このフォルダをGitHubへpush
2. Renderで `Web Service` を作成
3. 設定
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`
4. Environment Variablesに上記環境変数を登録
5. デプロイ後のURLをLINE Webhook URLへ設定

### 6-1. Supabase初期化
1. Supabaseを作成
2. SQL Editorで `supabase/init.sql` を実行
3. Storageバケット（例: `liive-evidence`）を作成
4. Render環境変数に `SUPABASE_*` を設定
5. `/api/system/persistence-status` で `supabase.enabled=true` を確認
6. 管理者ログインを有効化する場合は `ADMIN_*` も設定

## 7. 動作確認シナリオ
1. LINEで `出勤` を送る
2. 管理ツール `LINE勤怠` 画面でステータスが更新される
3. `休憩開始` → `休憩終了` を送る
4. `退勤` を送る
5. 月次集計に勤務時間/休憩/残業が反映される
6. LINEで `マニュアル確認` を送って、社員マニュアルURLが返る

## 8. 本番前チェック
- HTTPSドメインで公開されている
- `/api/health` が200で返る
- `/api/system/persistence-status` が200で、設定値が想定どおり
- `/api/system/backup-status` が200で、スケジュール・最終実行が確認できる
- `ADMIN_AUTH_ENABLED=true` の場合:
  - `/api/bootstrap` を未認証で叩くと 401
  - `/api/auth/login` でトークン発行できる
- Webhook署名エラーが出ない
- LINEユーザーIDと社員名マップが正しい
- CSV出力で勤怠データが取得できる
- `/manual/index.html` がスマホで閲覧できる

## 9. 重要
- まずはLINE連携で本番検証
- LINE WORKSは次段で同等Webhook/APIを追加し、同じ `/api/line-action` 処理に流す
