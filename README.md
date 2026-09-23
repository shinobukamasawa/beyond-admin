# 運営の画面（admin/）

運営のスタッフが PC のブラウザで開く画面。静的ファイルだけで、データは Edge Function `admin`（`supabase/functions/admin/`）と往復する。設計は docs/supabase-ikou.md の 7章・13章と「④運営の核の実装」、入力項目と業務ルールは docs/screen-admin.md。

| ファイル | 内容 |
|---|---|
| index.html | 入れ物。supabase-js（CDN。Google ログインとセッションの保持にだけ使う）と app.js を読む |
| app.js | 全画面（ログイン、ホーム、生徒、先生、シフト、予約、設定） |
| style.css | 見た目（PC 幅） |
| config.js | Supabase の URL・anon キー・API の URL（公開されてよい値だけ。anon キーは公開用で、データ API は閉じてある） |

## 置き場と URL

- 開発中：蒲澤の GitHub の公開リポジトリ `beyond-admin` に、このフォルダの中身をそのまま置き、GitHub Pages（main ブランチ／root）で公開する
  - URL：`https://shinobukamasawa.github.io/beyond-admin/`
  - 送り方：`npm run deploy:admin`（git subtree push）。数分で反映。ブラウザのキャッシュが残るときは index.html の `?v=` を進める
- 画面の URL は、Edge Function の秘密情報 `ADMIN_ORIGINS`（CORS）と、Supabase Auth の Redirect URLs の両方に入っていること
- 納品時：beyond.english.system の GitHub アカウントへ移管し、URL を差し替える（web/ と同じ）

## ログイン

- Supabase Auth の Google ログイン。ログインできても、メールが `app.staff` にあって有効でなければ API は 403 を返す（画面に「運営に登録されていません」）
- PC（localhost）で開いたときだけ、開発用のメール＋パスワードの欄が出る（`tools/dev-auth-user.mjs` が作るユーザー。Edge Function の `ADMIN_ALLOW_PASSWORD=1` のプロジェクトだけ通す。本番には置かない）

## 開発中の確認

- `.claude/launch.json` の `admin-web`（`python -m http.server 3000 --directory admin`）→ `http://localhost:3000`
- API だけ確かめる：`node tools/admin-call.mjs call <action> '<JSON>'`、結合テスト：`node tools/dev-seed.mjs --reset && node tools/check-admin.mjs`
