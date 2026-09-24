#!/usr/bin/env bash
# smoke-test.sh — 本番エンドポイントの死活確認
# 使い方: bash scripts/smoke-test.sh [BASE_URL]
# 例:     bash scripts/smoke-test.sh https://11hotel.vip

BASE="${1:-https://11hotel.vip}"
PASS=0
FAIL=0

check() {
  local label="$1" url="$2" expect="$3" method="${4:-GET}" body="${5:-}"

  if [[ "$method" == "POST" ]]; then
    status=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d "${body:-{}}" "$url")
  else
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  fi

  if [[ "$status" == "$expect" ]]; then
    echo "  ✓ $label ($status)"
    ((PASS++))
  else
    echo "  ✗ $label — got $status, want $expect"
    ((FAIL++))
  fi
}

echo "Smoke test: $BASE"
echo ""

echo "[Public pages]"
check "/ (top)"              "$BASE/"              200
check "/gourmet"             "$BASE/gourmet"       200
check "/date"                "$BASE/date"          200
check "/luxury"              "$BASE/luxury"        200
check "/about"               "$BASE/about"         200
check "/stay"                "$BASE/stay"          200
check "/vip"                 "$BASE/vip"           200
check "/hospitality"         "$BASE/hospitality"   200
check "/privacy"             "$BASE/privacy"       200
check "/terms"               "$BASE/terms"         200
check "/pr-policy"           "$BASE/pr-policy"     200

echo ""
echo "[Admin — no auth should get 302 or 401]"
check "/admin (redirect)"    "$BASE/admin"          302
check "/admin/login"         "$BASE/admin/login"    200

echo ""
echo "[Admin APIs — no auth = 401]"
check "upload-photo 401"     "$BASE/api/admin/upload-photo"    401 POST
check "video-upload-url 401" "$BASE/api/admin/video-upload-url" 401 POST
check "save-video-url 401"   "$BASE/api/admin/save-video-url"  401 POST
check "trigger-sync 401"     "$BASE/api/admin/trigger-sync"    401 POST

echo ""
echo "[404 guard]"
check "/nonexistent-page"    "$BASE/nonexistent-page" 404

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "Result: ALL $PASS checks passed"
else
  echo "Result: $PASS passed, $FAIL FAILED"
  exit 1
fi
