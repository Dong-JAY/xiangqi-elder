#!/usr/bin/env bash
# 跑全部测试
cd "$(dirname "$0")"
echo "=== 记谱测试 ==="
node notation.test.js
echo ""
echo "=== 端到端 UI 测试 ==="
node e2e.test.js
