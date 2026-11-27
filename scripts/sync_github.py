#!/usr/bin/env python3
"""把本地站点目录增量同步到 GitHub 仓库（走 REST API）。

用途：当 `git push` 因为网络/大包问题反复失败时，用这个脚本作为备用通道。
它按 git blob hash 比对本地与远端，只 PUT 有变化的文件、DELETE 已移除的文件。

用法：
    GH_TOKEN=ghp_xxx python scripts/sync_github.py
    GH_TOKEN=ghp_xxx REPO_NAME=my-repo python scripts/sync_github.py

说明：
    · 超过 40MB 的文件会被跳过（GitHub Contents API 对请求体有上限）。
      首次上传大文件（如 NNUE 权重）请用 `git clone` + `git push` 的方式，
      见 deploy_github.sh 顶部注释。
    · 脚本不修改 git 状态，纯 API 操作，不会在本地留下凭据。
"""

import base64
import hashlib
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

TOKEN = os.environ.get("GH_TOKEN")
if not TOKEN:
    sys.exit("错误：请通过 GH_TOKEN 环境变量提供 GitHub personal access token（需 repo 权限）")

OWNER = os.environ["GH_OWNER"] if "GH_OWNER" in os.environ else "Dong-JAY"
REPO = os.environ.get("REPO_NAME", "xiangqi-elder")
BRANCH = os.environ.get("GH_BRANCH", "main")
API = "https://api.github.com"

# 站点根目录 = 本脚本所在目录的上一级（scripts/ 的上级就是站点根）
ROOT = pathlib.Path(__file__).resolve().parent.parent

SKIP_DIR_NAMES = {".git", "node_modules"}
LARGE_FILE_LIMIT = 40 * 1024 * 1024


def api(method, path, payload=None, timeout=120):
    url = f"{API}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "xiangqi-sync")
    if data is not None:
        req.add_header("Content-Type", "application/json")

    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8")
                return json.loads(body) if body else {}
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")
            if e.code == 404:
                return {"__status": 404}
            last = f"HTTP {e.code}: {body[:200]}"
            if e.code in (403, 429, 502, 503) and attempt < 3:
                time.sleep(4 * (attempt + 1))
                continue
            raise RuntimeError(last)
        except Exception as e:               # 网络抖动
            last = str(e)
            if attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            raise RuntimeError(last)
    raise RuntimeError(last or "unknown")


def local_files():
    out = {}
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT)
        if any(part in SKIP_DIR_NAMES for part in rel.parts):
            continue
        out[rel.as_posix()] = p
    return out


def remote_files():
    data = api("GET", f"/repos/{OWNER}/{REPO}/git/trees/{BRANCH}?recursive=1")
    return {n["path"]: n["sha"] for n in data.get("tree", []) if n.get("type") == "blob"}


def local_blob_sha(path):
    """按 git 的 blob 哈希算法算本地文件 sha —— 这样能和远端 sha 直接比对，
    不用下载远端内容。"""
    data = path.read_bytes()
    h = hashlib.sha1()
    h.update(b"blob %d\0" % len(data))
    h.update(data)
    return h.hexdigest()


def put_file(rel, path, remote_sha):
    payload = {
        "message": f"sync {rel}",
        "content": base64.b64encode(path.read_bytes()).decode("ascii"),
        "branch": BRANCH,
    }
    if remote_sha:
        payload["sha"] = remote_sha
    api("PUT", f"/repos/{OWNER}/{REPO}/contents/{rel}", payload, timeout=180)


def delete_file(rel, remote_sha):
    api("DELETE", f"/repos/{OWNER}/{REPO}/contents/{rel}",
        {"message": f"remove {rel}", "sha": remote_sha, "branch": BRANCH})


def main():
    loc = local_files()
    rem = remote_files()
    print(f"本地 {len(loc)} 个文件，远端 {len(rem)} 个")

    to_put, skipped = [], []
    for rel, p in loc.items():
        size = p.stat().st_size
        if size > LARGE_FILE_LIMIT:
            skipped.append(rel)
            continue
        if rem.get(rel) != local_blob_sha(p):
            to_put.append(rel)

    to_del = [rel for rel in rem if rel not in loc]

    for rel in skipped:
        print(f"[跳过大文件] {rel}（已存在则保持不动）")
    print(f"需更新 {len(to_put)} 个，需删除 {len(to_del)} 个")

    ok, fail = 0, []
    for rel in to_put:
        try:
            put_file(rel, loc[rel], rem.get(rel))
            print(f"[PUT] {rel}")
            ok += 1
        except Exception as e:
            print(f"[FAIL] {rel}: {str(e)[:150]}")
            fail.append(rel)

    for rel in to_del:
        try:
            delete_file(rel, rem[rel])
            print(f"[DEL] {rel}")
            ok += 1
        except Exception as e:
            print(f"[FAIL-DEL] {rel}: {str(e)[:150]}")
            fail.append(rel)

    print(f"\n完成 {ok} 项")
    if fail:
        print("失败：", fail)
        sys.exit(1)


if __name__ == "__main__":
    main()
