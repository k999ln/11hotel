# 11hotel

[11hotel.vip](https://11hotel.vip/) のソースコードです。NOT A HOTEL の宿泊キー「THE KEY」の公開出品を、宿泊日・拠点・価格から探せるマーケットを提供しています。表示価格は 11hotel の取扱料を含む総額です。

## 主な画面

| パス | 内容 |
| --- | --- |
| `/` | 出品中の宿泊キー、拠点、参考価格を紹介するトップページ |
| `/vip` | 出品の一覧・絞り込みができるマーケットボード |
| `/stay/[tokenId]` | 宿泊キーごとの詳細と購入フロー |
| `/vip/key/[tokenId]` | 特定の出品を開く共有用 URL（`/vip` に転送） |
| `/vip/keys` | 接続したウォレットが保有するキーの確認 |

公開出品は OpenSea のデータをサーバー側で取得します。取得できない場合、トップページは拠点紹介を表示します。購入、管理画面、一部の API を利用するには、対応する外部サービスと環境変数の設定が必要です。

## 技術構成

- Astro / TypeScript / Tailwind CSS
- Cloudflare Workers（Web アプリと API Worker）
- Supabase（データ保存）
- OpenSea API（出品情報）
- viem / WalletConnect（ウォレット接続と購入フロー）

## ローカルで起動

Node.js と npm を用意し、リポジトリのルートで実行します。

```sh
npm ci
cp .env.example .env
npm run dev
```

`.env.example` を参考に、使う機能に必要な値を `.env` に設定してください。`.env` は Git の対象外です。公開出品の取得には `OPENSEA_API_KEY` が必要です。キーがない状態でも、トップページの拠点紹介は表示できます。

| 設定 | 用途 |
| --- | --- |
| `OPENSEA_API_KEY` | THE KEY の公開出品を取得 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | サーバー側のデータ処理と管理機能 |
| `KEY_CHECKOUT_CONTRACT` / `KEY_COLLECTION_CONTRACT` | 購入フローで参照するコントラクト |
| `KEY_SUPPORT_FEE_BPS` / `KEY_NIGHTLY_FLOOR_ETH` | 取扱料と最低販売価格の設定 |
| `PUBLIC_WALLETCONNECT_PROJECT_ID` | モバイルなどでのウォレット接続 |
| `ADMIN_TOKEN` / `ADMIN_SECRET` | 管理機能の認証 |

`PUBLIC_` が付く値はブラウザから参照できます。それ以外の認証情報はサーバー側で扱い、リポジトリに追加しないでください。

## 開発コマンド

```sh
npm run dev            # 開発サーバー
npm run build          # 本番用ビルド
npm run test:checkout  # 購入フローのテスト
npm run test:security  # 公開 API のセキュリティテスト
```

主なコードは `src/`、公開アセットは `public/`、決済コントラクトは `contracts/`、データベースのマイグレーションは `supabase/migrations/` にあります。Cloudflare の設定は `astro.config.mjs`、`wrangler.toml`、`worker/` を参照してください。

## 利用上の注意

THE KEY は宿泊のためのキーです。出品価格や参考価格は投資助言ではなく、在庫・価格・宿泊条件を保証するものでもありません。購入前に NOT A HOTEL の公式案内と利用条件を確認してください。
