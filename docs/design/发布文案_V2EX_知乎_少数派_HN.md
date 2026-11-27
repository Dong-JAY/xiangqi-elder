# 各渠道发布文案

> 2026-11-28 · 按渠道特性分别撰写，不是同一篇复制到五个地方
> 发布纪律：每个渠道只发一次，不刷屏；标题带场景关键词，不写"我的新作品"

---

## 一、V2EX（分享创造节点）· 首选

**为什么首选**：中文开发者聚集，对"给家人做东西"这类帖子反应最好，且技术细节能被看懂、被追问——追问就是流量。

### 标题

```
我爸想下棋，我给他装了五个 App 都有开屏广告。后来我自己写了一个
```

### 正文

```
先说结论：https://dong-jay.github.io/xiangqi-elder/

事情很小。我爸今年六十多，退休后想下象棋。我给他手机装了五个 App，
每一个都有开屏广告。

有的要手机号登录。有一个要充会员才能用"悔棋"。有一个把棋盘缩到屏幕
上半部分，下半部分是"残局挑战"和"看视频得金币"。还有一个更离谱——
每输一局弹一次"再来一局看视频领奖励"。

他后来不下了。我问他怎么不下了，他说"太麻烦"。

我一开始以为他是嫌操作复杂。后来发现不是——他是嫌每次都要等广告，
还要小心翼翼别点到什么不该点的地方。对一个 60 岁的人来说，
"别点错"本身就是一种负担。

所以我自己写了一个。纯前端，无后端，打开就能下。

做了什么：

没有广告。不是"广告少"，是一条广告代码都没有——全部自研实现。

字大。正文 19px，按钮 56px 高。一般 App 是 14px 和 40px 左右。
这不是审美偏好，是能不能看清、能不能点准的问题。

只说人话。这一点花的时间最多。开源象棋引擎的输出是这种：
depth 18, seldepth 27, nodes 2345678, score cp -35

这套东西给我看没问题，给我爸看等于没说。所以全部藏起来，翻成：
"这局你赢了"、"这步要是走炮二平五就好了"。

着法也翻了：h2e2 → 炮二平五。会下棋的人都认中文明码，没人在心里
默念 h2e2。但几乎所有开源象棋界面都用坐标记谱，因为好实现。

复盘是模板版，没接 LLM。下完给一张卡：先夸一步你走对的，再讲一步
最该改的，最后给一条下次能用的建议。不显示分差、不显示评估值。
我试过给我爸看"这步亏了 0.35 分"，他的反应是"什么分？"

技术上几个值得说的点：

双引擎。前 3 档用纯 JS 引擎（57KB），零下载、断网可玩。后 3 档接
Pikafish WASM + NNUE，49MB，首次要下。老人手机上 49MB 是很重的负担，
所以默认落在低档位，只有自己升上去才下载。

Pikafish 源自 Stockfish，但没有 Skill Level / UCI_Elo / UCI_LimitStrength，
所以"弱棋力"得自己造。低档靠限制搜索深度加随机失误，高档靠 MultiPV
取多个候选着法再按 softmax 温度采样。温度参数是原作者实测标定的。

踩得最狠的一个坑：Service Worker。

我原本用了社区常见的 coi-serviceworker 注入 COOP/COEP（多线程 WASM 必需），
另写一个 sw.js 做离线缓存。结果这俩抢同一个 scope——浏览器同一 scope
只能有一个 active Service Worker，后注册的把先注册的顶掉。

症状很隐蔽：第一次打开高档位能用，第二次打开就废了，提示"请刷新重试"，
但刷新也没用。我自己测了半天才发现是隔离头丢了。

修法是把隔离头和缓存合并进同一个 Worker。顺带发现第二个坑：sw.js 的
activate 里无条件删了所有旧缓存，把引擎 49MB 的权重缓存一起删了——
等于每次升级用户都要重下 49MB。

这两个坑现在都有测试守着，84 项测试全过。

已知的问题，也说清楚：

1. 49MB 权重直接放在仓库里，clone 会拉 49MB。这个我打算改成首次运行时
   按需下载，但还没做。
2. 微信内置浏览器缺多线程 WASM 环境，高档位用不了，会自动降到 1~3 档。
   所以要在系统浏览器打开并"添加到主屏幕"。
3. 复盘是模板版，不是真 AI 点评。同一个错误类型说辞会重复。
4. 只有中文界面。

源码（GPL-3.0，因为 Pikafish 是 GPL 传染）：
https://github.com/Dong-JAY/xiangqi-elder

写这个东西最大的收获不是技术。是我意识到"适老化"这件事，
大部分产品是在做"把字调大"，而不是"减掉不必要的东西"。
广告、登录、会员、排行榜、每日任务——这些在年轻人看来是"功能丰富"，
在我爸看来是"每次都要跨过去的坎"。

如果你家里也有想下棋但被广告打断的长辈，可以试试。
有问题告诉我，我改。
```

**发布注意**：
- 发在「分享创造」节点
- 首行就放链接（V2EX 用户没耐心）
- 不要一次回多个帖，会被当广告

---

## 二、知乎 · 回答 + 文章双发

**为什么**：搜索长尾流量，半年后还有人从"给父母做什么 App""适老化设计"搜进来。

### 适合回答的问题（自己搜着找）

- 「有哪些适合老年人使用的手机 App？」
- 「如何评价国内 App 的适老化改造？」
- 「程序员给家人做过什么实用的东西？」

### 回答正文（短版，500 字内）

```
给我爸写了一个象棋 App。起因很朴素：我给他装了五个市面上的象棋 App，
每个都有开屏广告。

有一个要手机号登录才能下棋。有一个把"悔棋"做成了会员功能。有一个把棋盘
缩到屏幕上半部分，下半部分放"残局挑战"。还有一个每输一局弹"看视频领金币"。

他后来跟我说"太麻烦"，就不下了。

我一开始以为是操作复杂。后来想明白了：对 60 岁的人来说，真正的成本不是
"学不会"，而是"每次都要小心别点错"。广告关闭按钮的 × 常常做得极小、
位置飘忽，点错就跳转。这种持续的紧张感，比学习成本更劝退。

所以我自己写了个网页版（PWA，可以加到桌面）：
https://dong-jay.github.io/xiangqi-elder/

技术上没什么了不起的，纯前端。但设计上做了三件事，我认为是真的"适老"：

一、减，而不是加。
没有广告、没有登录、没有排行榜、没有每日任务、没有签到。首页只有四个
按钮：和电脑下棋、挑战过去的自己、我的成绩、和家里人下。

二、藏术语。
象棋引擎的原生输出是 depth 18 / nodes 2.3M / score cp -35。这套东西
开发者看得懂，用户看不懂。全部藏起来，翻译成"这局你赢了"、
"这步要是走炮二平五就好了"。着法也从 h2e2 换成中文记谱——会下棋的人
都认中文明码，没人在心里默念 h2e2。

三、不让人失败在起跑线上。
连赢三局自动升档，连输三局自动降档。不用自己选难度——让用户选"你什么水平"
本身就是个难题，选高了被虐，选低了没意思。

源码开源（GPL-3.0）：https://github.com/Dong-JAY/xiangqi-elder

现在每天我爸会下一两局。他还是会输，但输了会看复盘，然后第二天再来。
我觉得这就够了。
```

### 文章（长版，用第一节 V2EX 那篇改写）

标题建议：
```
我给 60 岁的父亲做了一个 App，然后重新理解了"适老化"
```

---

## 三、少数派 · 长文

**为什么**：少数派读者吃"设计决策 + 过程"这类内容，而且会认真读完。适合讲"为什么这么设计"。

**站点连通性**：实测可达（HTTP 200）。

### 标题
```
给长辈做 App：适老化不是把字调大，是把东西减掉
```

### 结构建议（正文用 V2EX 那篇扩写）

1. **引子**：五个 App 都有广告 → 我爸不下了
2. **诊断**：真正的成本不是"学不会"，是"每次都要小心别点错"
3. **三条设计原则**（减 / 藏 / 不让人失败），每条配一个具体决策和它的代价
4. **最难的部分**：把引擎术语翻译成人话（举 3 个改写前后的例子）
5. **技术上的两个坑**：Service Worker 抢 scope、误删 49MB 缓存
6. **还没做好的**：49MB 权重、只有中文、模板式复盘的重复感
7. **结尾**：我爸现在每天下一两局，输了会看复盘

**关键**：少数派读者讨厌软文。**必须写清缺陷**，那反而是加分项。

---

## 四、Hacker News · Show HN（英文）

**站点连通性**：实测不可达（`news.ycombinator.com` 网络受限），需代理。
**若无法访问**，改用 Reddit（同样受限），或直接跳过国际渠道。

### 标题（HN 标题必须 ≤80 字符，且不能标题党）

```
Show HN: An ad-free Xiangqi app I built for my dad
```

### 正文

```
My father retired and wanted to play Xiangqi (Chinese chess). I installed five
apps for him. Every one opened with a full-screen ad. One required a phone-number
login. One put "undo" behind a subscription. Another shrank the board into the top
half to fit a "daily puzzle" banner. He stopped playing, and told me it was
"too much hassle".

I assumed the problem was complexity. It wasn't. The real cost for a 60-year-old
is not learning the UI — it's having to be careful not to tap the wrong thing.
Ad close buttons are tiny and move around; a mistap navigates you somewhere else.
That low-grade anxiety is more off-putting than any learning curve.

So I built this: https://dong-jay.github.io/xiangqi-elder/

It's a PWA — pure static, no backend. Three design decisions that I think
actually matter for accessibility:

1. Subtract, don't add. No ads, no login, no leaderboard, no daily quests,
   no check-in. The home screen has four buttons.

2. Hide the jargon. The engine naturally emits depth 18 / 2.3M nodes / eval -0.35.
   Meaningless to a user. It's all suppressed and translated into "You won this
   one" and "If you'd moved the cannon to the fifth file, you'd have kept your
   horse". Move notation is translated too: h2e2 becomes 炮二平五 — anyone who
   plays knows the Chinese notation, nobody recites h2e2 in their head. Almost
   every open-source Xiangqi UI uses coordinate notation because it's easier to
   implement, not because it's better.

3. Don't make them pick a difficulty. Three wins in a row raises the level, three
   losses lowers it. Asking a user "what's your skill level" is itself a hard
   problem — they either pick too high and get crushed, or too low and get bored.

Two engines: the first three difficulty levels use a 57KB pure-JS engine (zero
download, works offline). The top three use Pikafish WASM + NNUE, 49MB, fetched on
demand. 49MB is a lot on an elderly person's phone, so the default is a low level.

Pikafish descends from Stockfish but ships without Skill Level / UCI_Elo /
UCI_LimitStrength, so weak play had to be built on top: search-depth limits plus a
random blunder rate at low levels, and MultiPV candidate sampling with a softmax
temperature at high levels.

The nastiest bug was a Service Worker conflict. I used the common
coi-serviceworker pattern to inject COOP/COEP (required for multi-threaded WASM)
and a separate sw.js for offline caching. They fight over the same scope — a
browser allows only one active worker per scope, so the second evicts the first.
The symptom was subtle: high difficulty levels worked on first load, then broke
permanently on the second visit, with a message telling the user to refresh —
which didn't help. Fix was merging isolation headers and caching into one worker.
That also surfaced a second bug: the old sw.js wiped all caches on activate,
including the engine's 49MB weight cache, so every update forced a re-download.

Known limitations, honestly:
- The 49MB weight file sits in the repo, so cloning pulls 49MB. I intend to move
  it to on-demand download but haven't yet.
- WeChat's in-app browser lacks the multi-threaded WASM environment, so high
  levels fall back. Must be opened in a system browser.
- The post-game review is template-based, not an LLM. The same mistake type gets
  the same phrasing.
- Chinese UI only.

Source (GPL-3.0, because Pikafish is GPL and gets bundled):
https://github.com/Dong-JAY/xiangqi-elder

The main takeaway for me wasn't technical. Most "senior-friendly" work I've seen
is about making text bigger. The harder and more valuable part is removing things
that don't need to be there.
```

---

## 五、Reddit · r/chess（英文短版）

**站点连通性**：实测不可达，需代理。

### 标题
```
I built an ad-free Xiangqi app for my 60-year-old dad, because every existing app opened with an ad
```

### 正文

用第四节 HN 那篇的前 60% + 已知问题，去掉技术细节（r/chess 读者更关心"能不能玩"）。
**必读版规**：r/chess 对自我推广有严格规则，先看侧栏，通常要求账号有 karma 和活跃历史。

---

## 六、发布顺序与节奏

| 顺序 | 渠道 | 时机 | 说明 |
|---|---|---|---|
| 1 | V2EX 分享创造 | 工作日晚上 20:00–22:00 | 流量最集中。发完盯 2 小时回帖 |
| 2 | 知乎回答 | 次日 | 找一个已有流量的问题回答，别自己开新问题 |
| 3 | 少数派 | 第 3–5 天 | 需要投稿审核，慢 |
| 4 | HN / Reddit | 视网络条件 | 需代理；HN 标题一旦发出不能改，想清楚再发 |

**别在同一天全发**——同一个人同一天在多个平台发同一个东西，容易被判刷屏。

---

## 七、发完之后必须做的

| 动作 | 为什么 |
|---|---|
| **盯评论 2 小时** | 前 2 小时的互动决定帖子能不能被顶起来。有技术疑问认真答，答得好会有更多人 star |
| **记录来源** | GitHub 后台能看到 referrer，知道哪个渠道真的有效 |
| **把高频问题写进 README** | 比如"为什么不用现成的棋谱格式""能不能加悔棋"——问得多说明文档没写清 |
| **别删负评** | 「这不就是个网页吗」「49MB 太大了」这类批评，认真回复比删掉收益大 |

---

## 八、诚实的预期

参照同类项目：

| 项目 | Stars | 特点 |
|---|---|---|
| `ryukeilee/xiangqi` | 2 | 功能完整的单文件版，README 也写得清楚 |
| `XMuli/ChineseChess` | 832 | Qt 桌面版，跨平台联机，功能明显更多 |

两者代码质量差距没有 400 倍，差距在**有没有人知道**。

所以现实的预期是：
- V2EX 发得好 → 首周 20–60 star
- 加上知乎长尾 → 一个月后可能到 100 左右
- 想上几百 → 需要被某个大 V 转发，或英文渠道起量

**如果把目标定成"涨星星"，大概率会失望；定成"让一百个有同样处境的人看到"，是能达成的。**
