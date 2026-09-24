#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

NPX="/opt/homebrew/bin/npx"

# Astro/Vite の .astro コンパイルキャッシュは大文字小文字を区別するが、このプロジェクトが
# exFAT（大文字小文字を区別しない）外部ボリューム上にあると、PascalCase のコンポーネント名
# （KeyMarketBoard.astro 等）で「No cached compile metadata found」となりビルドが壊れることがある。
# ビルドだけは内蔵ディスク側の使い捨て一時ディレクトリにソースを複製して行い、
# 生成された dist だけを取り出してデプロイする。作業ディレクトリ自体は変更しない。
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/11hotel-deploy.XXXXXX")"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

echo "📦 Copying source to a case-sensitive-safe build directory..."
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude '.git' --exclude '.astro' \
  "$SCRIPT_DIR/" "$BUILD_DIR/"

echo "📥 Installing dependencies..."
(cd "$BUILD_DIR" && npm install --no-audit --no-fund --silent)

echo "🔨 Building Astro..."
(cd "$BUILD_DIR" && $NPX astro build)

echo "🧹 Removing macOS metadata files..."
find "$BUILD_DIR/dist" -name "._*" -delete

echo "⚙️  Patching dist/server/wrangler.json..."
python3 - "$BUILD_DIR" <<'EOF'
import json, sys
base = sys.argv[1]
path = f"{base}/dist/server/wrangler.json"
with open(path) as f:
    c = json.load(f)
c["name"] = "hotel-affiliate-frontend"
# Astro 生成の SESSION を落とし、/ai 用 AI_STATE だけを残す
c["kv_namespaces"] = [{
    "binding": "AI_STATE",
    "id": "c67e1eed77dc46808812c096e84306d9",
}]
with open(path, "w") as f:
    json.dump(c, f)
EOF

echo "🚀 Deploying frontend Worker..."
(cd "$BUILD_DIR/dist/server" && $NPX wrangler deploy --config wrangler.json)

echo "✅ Frontend deployed!"
echo ""

if [ "$1" = "--worker" ]; then
  echo "🚀 Deploying API Worker..."
  cd worker
  $NPX wrangler deploy --config wrangler.toml
  cd "$SCRIPT_DIR"
  echo "✅ API Worker deployed!"
fi
