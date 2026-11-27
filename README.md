# 老将 · Laojiang

**给家里的老将，一个干净的棋盘。**

[中文](README.md) · [English](README.en.md) · [**在线试玩**](https://dong-jay.github.io/xiangqi-elder/) · GPL-3.0

---

无广告的中国象棋。为不太会用智能手机的长辈设计：字大、按钮大、只说人话。

不说「深度 18 / 节点 2.3M / 评估分 -0.35」，只说「这局你赢了」「这步要是走炮二平五就好了」。

| 19px | 56px | 0 |
|:---:|:---:|:---:|
| 正文字号<br><sub>一般 App 是 14px</sub> | 按钮高度<br><sub>拇指点得准</sub> | 广告 · 注册 · 数据上传<br><sub>三个零</sub> |

---

## 为什么做这个

我爸想下棋。我给他找了五个 App，每个都有开屏广告。

有的要登录、要充会员、要把棋盘缩到屏幕一角、旁边塞一个「残局挑战」的广告位。还有一个每次输棋都弹「再来一局看视频得金币」。

他后来不下了。

所以我自己写了一个。不用注册，不用联网，打开就能下，输了会告诉他哪一步该改。

---

## 它和别的象棋软件不一样在哪

| 维度 | 一般象棋软件 | 老将 |
|---|---|---|
| 配色 | 深色科技风 | 浅色高对比 |
| 字号 | 桌面级 | 正文 ≥ 19px |
| 按钮 | 小图标 | 触控目标 ≥ 56px 高 |
| 布局 | 横屏 + 侧栏技术面板 | 竖屏单列，技术数据折叠起来 |
| 术语 | 深度/节点/NPS/评估分 | 全部藏起来，只说人话 |
| 着法 | `h2e2` | `炮二平五` |
| 结束语 | 「红方胜！」 | 「这局你赢了！」 |
| 反馈 | 视觉 | 视觉 + 触觉震动 + 音效 |
| 复盘 | 棋谱列表 | 一张说人话的点评卡 |

---

## 四条核心功能

| 功能 | 说明 |
|---|---|
| **无广告** | 全部自研实现，不含任何第三方广告 SDK |
| **记录战绩** | 每局自动存档，可看胜率、连胜、近 10 局走势，可导出备份 |
| **难度自适应** | 连赢 3 局自动升档，连输 3 局自动降档，并明确告诉用户为什么变了 |
| **复盘反馈** | 下完给一张「教练卡」：先夸一步做对的，再讲一步最该改的，最后给一条下一步建议 |

还有两个家里人会喜欢的入口：

- **挑战过去的自己** — 用三个月前的你当时的水平跟你下，赢一次特别有成就感
- **和家里人下** — 同一设备双人，不用两台手机

---

## 试一试

| 入口 | 地址 | 说明 |
|---|---|---|
| **在线试玩** | [dong-jay.github.io/xiangqi-elder](https://dong-jay.github.io/xiangqi-elder/) | GitHub Pages，纯静态，打开即玩 |
| 备用线路 | [xiangqi-elder.app.workbuddy.host](https://xiangqi-elder.app.workbuddy.host/?sharecode=26PF7XBRIW) | WorkBuddy 托管，线路较快 |

**加到你手机桌面**：用手机浏览器（不要用微信内置浏览器）打开上面链接 → 菜单里选「添加到主屏幕」。
之后桌面就有图标，点开像 App 一样，**断网也能玩**（前 3 档）。

> ⚠️ 微信内置浏览器缺少多线程 WASM 环境，难度会自动降到 1~3 档。
> 想要完整 6 档，请用系统浏览器打开并添加到桌面。

**玩法**：点「和电脑下棋」→ 选先手 → 选难度 → 点起点再点终点落子 → 下完看教练点评。

---

## 怎么做到的

### 双引擎，前 3 档零下载

| 档位 | 引擎 | 首次加载 |
|---|---|---|
| 1 入门 | Wukong（纯 JS，57KB，MIT） | **0 字节** |
| 2 初级 | 同上 | 0 字节 |
| 3 中级 | 同上 | 0 字节 |
| 4 高级 | Pikafish WASM + NNUE（GPL-3.0） | 49 MB |
| 5 大师 | 同上 | 已缓存 |
| 6 宗师 | 同上 | 已缓存 |

前 3 档用纯 JS 引擎，靠限制搜索深度 + 随机失误概率调弱；后 3 档用 Pikafish，
靠 MultiPV 取多个候选着法再按 softmax 温度采样调弱。

**为什么不直接用引擎自带的难度选项**：Pikafish 源自 Stockfish，但没有 `Skill Level` /
`UCI_Elo` / `UCI_LimitStrength`，弱棋力只能由应用自己造。

### 技术栈

- 纯静态，无构建步骤，无后端
- Web Worker 跑引擎，主线程始终流畅
- IndexedDB 存战绩（**本地，不上传**）
- Service Worker 同时负责跨源隔离头（COOP/COEP）与离线缓存

---

## 项目结构

```
app/
├── index.html              页面结构（首屏菜单在棋盘下方独立显示）
├── manifest.json           PWA 清单
├── sw.js                   Service Worker：跨源隔离头（COOP/COEP）+ 离线缓存
├── styles/
│   ├── main.css            底座样式（深色科技风）
│   ├── elder.css           适老化主题层（浅色高对比）← 改造核心
│   └── components/         底座的模块化样式
├── js/
│   ├── app.js              主应用装配（已接入适老层）
│   ├── elder.js            适老化行为层 ← 新增
│   ├── notation.js         中文记谱转换 ← 新增
│   ├── review.js           复盘反馈引擎 ← 新增
│   ├── difficulty.js       六档难度表（底座自带，参数经实测标定）
│   ├── xiangqi.js          规则引擎（底座自带）
│   ├── xiangqiboard.js     棋盘渲染（底座自带，已改造）
│   ├── engines/bridge.js   引擎桥接（底座自带）
│   ├── worker/             Pikafish WASM 产物（未改动）
│   └── engines/wukong/     纯 JS 引擎（未改动）
├── nnue/                   49MB 神经网络权重（未改动）
├── icons/                  PWA 图标
├── scripts/
│   ├── build_wasm.sh       引擎 WASM 构建脚本
│   └── sync_github.py      走 REST API 的增量同步（git push 失败时的备用通道）
├── deploy_github.sh        一键建公开仓库 + 推代码 + 开 Pages
├── test/                   测试（54 项，见下方「开发」）
└── docs/
    ├── upstream/           底座上游的原始文档（PRD/UI规范/CLAUDE.md）
    └── design/             本项目的方案、使用说明与曝光策划
        ├── 象棋软件方案_v1.md / .html     初版方案（三种形态对比选型）
        ├── 象棋软件方案_v2.md / .html     落地版方案
        ├── 给爸爸的使用说明.md            给长辈看的操作说明
        └── GitHub曝光与上架策划.md        命名、定位与推广路线
```

---

## 开发

```bash
# 本地起服务（必须走 HTTP，file:// 拿不到跨源隔离环境）
python server.py
# 打开 http://127.0.0.1:6324/

# 跑测试（首次需要装 jsdom）
cd test && npm install
cd .. && bash test/run_tests.sh
```

**改代码后注意**：静态资源都带 `?v4` 版本参数。改完记得把版本号往上加一位
（`index.html`），否则浏览器可能还在用旧缓存。

**动 Service Worker 前必读**：`sw.js` 同时负责跨源隔离（COOP/COEP）和离线缓存，
两者必须在**同一个** Worker 里——浏览器同一 scope 只能有一个 active Service Worker，
拆成两个会互相顶掉，症状是 `crossOriginIsolated` 变 false、4~6 档引擎不可用。
另外 `activate` 里清理缓存只能删 `xiangqi-elder-*` 前缀，
删到 `pikafish-nnue-v1` 会让用户重下 49MB。这两点都有测试守着（见 `test/e2e.test.js` 第 8 节）。

### 运维脚本

| 文件 | 用途 |
|---|---|
| `deploy_github.sh` | 一键部署：建公开仓库 → 推 main → 开 Pages。目录结构自适应，在仓库里或开发工作区都能跑 |
| `scripts/sync_github.py` | 备用同步通道：按 blob 哈希增量 PUT/DELETE。当 `git push` 因网络或大包问题失败时用它 |

```bash
# 首次部署（需要一个勾了 repo 权限的 token）
GH_TOKEN=ghp_xxx ./deploy_github.sh

# 日常增量同步（git push 不通时）
GH_TOKEN=ghp_xxx python scripts/sync_github.py
```

> 注意：超过 40MB 的文件（`nnue/*.nnue`）Contents API 传不了，
> 首次入库请用 `git clone` + `git push`，脚本会跳过它并保持远端原样。

---

## 致谢与许可

本项目基于 [justa-cai/chess](https://github.com/justa-cai/chess) 改造（原作者的
《中文象棋 AI · 六档难度 · 双引擎》），核心引擎与规则层来自该开源项目。

**本项目整体许可为 GNU General Public License v3.0** —— 因为核心算力引擎 Pikafish
采用 GPL-3.0，编译成 WebAssembly 后随本项目一起分发，GPL-3.0 的传染性会覆盖整个分发产物。

第三方组件与完整许可声明见 [`NOTICE.md`](NOTICE.md) 与 [`LICENSE`](LICENSE)。

---

<p align="center">
  <sub>给自己家里的长辈做的。<br>如果你也有一位想下棋却总被广告打断的长辈，希望它好用。</sub>
</p>
