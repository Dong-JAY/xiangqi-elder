#!/usr/bin/env bash
#
# 一键推送到 GitHub 公开仓库 + 开启 Pages
#
# 用法：
#   ./deploy_github.sh              # 交互式（会让你粘贴 token）
#   GH_TOKEN=ghp_xxx ./deploy_github.sh   # 环境变量方式
#
# 前置条件：
#   1. 在 GitHub 上已创建仓库（或本脚本会提示你手动创建）
#   2. 有 personal access token，勾选 repo 权限
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 项目根目录自适应：
#   · 仓库自带这份脚本时，脚本和 index.html 同级 → 直接用脚本所在目录
#   · 在开发工作区里，站点代码在 ./app 子目录 → 用 app/
# 这样同一份脚本在两种布局下都能跑，不用手改路径。
if [ -f "$SCRIPT_DIR/index.html" ]; then
  APP_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/app/index.html" ]; then
  APP_DIR="$SCRIPT_DIR/app"
else
  echo "错误：在 $SCRIPT_DIR 及其 app/ 子目录下都没找到 index.html，无法确定站点根目录。" >&2
  exit 1
fi

REPO_NAME="${REPO_NAME:-xiangqi-elder}"
REPO_DESC="给长辈用的中国象棋对弈软件：无广告、记录战绩、自动难度、复盘反馈"
DOMAIN_PREFIX="${DOMAIN_PREFIX:-xiangqi-elder}"

echo "============================================"
echo "  中国象棋 · 推送 GitHub"
echo "============================================"
echo ""
echo "仓库名：$REPO_NAME"
echo "目录：  $APP_DIR"
echo ""

# ---------------------------------------------------------------- 1. 收集 token
if [ -z "${GH_TOKEN:-}" ]; then
  echo "请提供 GitHub Personal Access Token（需要 repo 权限）。"
  echo "获取地址：https://github.com/settings/tokens/new"
  echo "（粘贴后不回显，属正常现象）"
  read -rs GH_TOKEN
  echo ""
  echo ""
fi

if [ -z "$GH_TOKEN" ]; then
  echo "错误：未提供 token，已中止。" >&2
  exit 1
fi

API="https://api.github.com"

# ---------------------------------------------------------------- 2. 验证身份
echo "→ 验证 GitHub 身份..."
LOGIN=$(curl -s --max-time 20 -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "$API/user" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('login',''))" 2>/dev/null || echo "")
if [ -z "$LOGIN" ]; then
  echo "错误：token 无效或已过期。" >&2
  exit 1
fi
echo "  当前身份：$LOGIN"
echo ""

# ---------------------------------------------------------------- 3. 建仓库
echo "→ 检查仓库是否已存在..."
EXISTS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 \
  -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  "$API/repos/$LOGIN/$REPO_NAME")

if [ "$EXISTS" = "200" ]; then
  echo "  仓库已存在，跳过创建。"
else
  echo "→ 创建公开仓库..."
  RESULT=$(curl -s --max-time 30 -X POST \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "$API/user/repos" \
    -d "{\"name\":\"$REPO_NAME\",\"description\":\"$REPO_DESC\",\"private\":false,\"auto_init\":false,\"has_issues\":true,\"has_wiki\":false}")
  CREATED=$(echo "$RESULT" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('html_url') or d.get('message',''))" 2>/dev/null || echo "")
  if echo "$CREATED" | grep -q "http"; then
    echo "  已创建：$CREATED"
  else
    echo "  创建失败：$CREATED"
    echo "  可手动创建后重跑本脚本：https://github.com/new"
    exit 1
  fi
fi
echo ""

# ---------------------------------------------------------------- 4. 推代码
echo "→ 推送代码..."
cd "$APP_DIR"

# 用临时 remote + header 方式推送，不落盘 token
REMOTE_URL="https://x-access-token:$GH_TOKEN@github.com/$LOGIN/$REPO_NAME.git"
git remote remove deploy-github 2>/dev/null || true
git remote add deploy-github "$REMOTE_URL"
# 无论推送成功与否，都要把带 token 的 remote 摘掉，并从 git 配置里彻底清除
cleanup_remote() {
  git remote remove deploy-github 2>/dev/null || true
  # 兜底：清掉可能残留在 .git/config 里的 token
  if [ -f .git/config ]; then
    python - "$GH_TOKEN" <<'PYEOF' 2>/dev/null || true
import sys, pathlib, re
token = sys.argv[1]
p = pathlib.Path('.git/config')
if p.exists():
    t = p.read_text(encoding='utf-8', errors='ignore')
    t = t.replace(token, '***REMOVED***')
    p.write_text(t, encoding='utf-8')
PYEOF
  fi
}
trap cleanup_remote EXIT

git push -u deploy-github HEAD:main
cleanup_remote
trap - EXIT
echo "  推送完成（临时 remote 已清理）"
echo ""

# ---------------------------------------------------------------- 5. 开启 Pages
echo "→ 开启 GitHub Pages..."
PAGES_RESULT=$(curl -s --max-time 20 -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "$API/repos/$LOGIN/$REPO_NAME/pages" \
  -d '{"source":{"branch":"main","path":"/"}}')

PAGES_URL=$(echo "$PAGES_RESULT" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('html_url') or d.get('message',''))" 2>/dev/null || echo "")
if echo "$PAGES_URL" | grep -q "http"; then
  echo "  Pages 已开启：$PAGES_URL"
else
  echo "  开启返回：$PAGES_URL"
  echo "  若提示已存在，可手动在仓库 Settings → Pages 里选 main 分支 / 根目录"
fi
echo ""

echo "============================================"
echo "  完成"
echo "============================================"
echo ""
echo "仓库地址：https://github.com/$LOGIN/$REPO_NAME"
echo "在线地址：$PAGES_URL"
echo ""
echo "注意：Pages 首次构建需要 1-3 分钟，之后才会可访问。"
echo ""
echo "⚠️  GPL-3.0 提醒：仓库是公开的，源码对所有人可见。"
echo "   这是 GPL-3.0 的要求（Pikafish 是 GPL 传染），不是疏漏。"
echo ""
