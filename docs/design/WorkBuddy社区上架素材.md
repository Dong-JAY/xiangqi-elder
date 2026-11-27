# WorkBuddy 社区作品 · 提交素材

> 用途：在 WorkBuddy「灵感社区」提交这个作品时，直接复制粘贴下面的字段。
> 素材已备齐，只差最后一步「登录后提交」——这一步需要你本人账号。

---

## 一、上架路径说明

| 路径 | 状态 | 说明 |
|---|---|---|
| **① 发布为应用** | ✅ 已完成 | 分享链接 `xiangqi-elder.app.workbuddy.host/?sharecode=26PF7XBRIW`，在「设置—数据管理—应用」管理。这是"能用"，不算上架 |
| **② 社区作品** | ⏳ **需你登录提交** | 提交后进待审（pending），审核通过后其他 WorkBuddy 用户可发现。**这才是真正意义上的"上架"** |
| **③ 打包成 Skill** | 可选，另议 | 那是"一键生成适老应用"的工具，和这个应用是两个产品，不建议混在一起 |

**② 的阻塞原因**：社区接口返回 `17901 请先登录后再操作`。
这是账号登录态，属于你本人的身份，我无法代替——也不应该绕过。

---

## 二、封面图（已上传，直接用这个 URL）

**横版封面（1200×630）**

```
https://acc-1258344699.cos.accelerate.myqcloud.com/community/draft/285a9b62-3886-4b13-b3c1-38ef9ba3a0a3/media/9cf1f96f-c9e9-4034-843a-34b727b921da_cover-landscape.png
```

> 注意：这是 presigned 链接，**可能有过期时间**。如果失效，
> 本地文件在 `app/docs/assets/cover-landscape.png`，直接上传即可。
> 竖版封面也备好了：`app/docs/assets/cover-portrait.png`（1080×1440）。

---

## 三、中文提交内容

**标题**（≤64 字）
```
老将 · Laojiang
```

**副标题**
```
给家里的老将，一个干净的棋盘
```

**描述**（≤400 字，可直接复制）

```
无广告的中国象棋，为不太会用智能手机的长辈设计。

起因很具体：我爸想下棋，我给他装了五个 App，每个都有开屏广告。有的要登录、要充会员，有的把棋盘缩到屏幕一角塞广告位。他后来不下了。所以我自己写了一个。

三个设计支点：正文 19px、按钮 56px、零广告零注册零数据上传。术语全部翻成人话——不出现「深度/节点/评估分」，只说「这局你赢了」「这步要是走炮二平五就好了」。

会记战绩、连赢三局自动升档、连输自动降档，下完给一张说人话的教练卡：先夸一步做对的，再讲一步最该改的，最后给一条建议。前 3 档引擎零下载、可离线；后 3 档接 Pikafish。

开源，GPL-3.0。
```

**主产物链接**
```
https://dong-jay.github.io/xiangqi-elder/
```

**附加产物**（可选）
```
GitHub 源码（GPL-3.0）: https://github.com/Dong-JAY/xiangqi-elder
备用线路: https://xiangqi-elder.app.workbuddy.host/?sharecode=26PF7XBRIW
```

---

## 四、英文提交内容（如果有多语言字段）

**Title**
```
Laojiang · 老将
```

**Subtitle**
```
A clean chessboard for the veteran of the family
```

**Description**

```
An ad-free Xiangqi (Chinese Chess) app designed for people who are not good with smartphones.

My dad wanted to play chess. I installed five apps for him — every one opened with a full-screen ad. Some wanted a phone-number login, one wanted a subscription, another shrank the board into a corner to fit a puzzle banner. He stopped playing. So I wrote this one.

Three anchors: 19px body text, 56px buttons, and three zeros — no ads, no sign-ups, no data uploads. Engine jargon is fully translated: it never says depth/nodes/eval, it says "You won this one" and "If you'd moved the cannon to the fifth file, you'd have kept your horse".

It archives every game, raises difficulty after three wins, eases off after three losses, and ends each game with one plain-language coaching card.

The first three difficulty levels load instantly and work offline; the top three use Pikafish. Open source, GPL-3.0.
```

---

## 五、你只需要做这几步

1. 打开 WorkBuddy 的**灵感社区**（创作广场入口）
2. 点「发布作品」
3. 把上面第三节的内容粘进去
4. 封面上传 `app/docs/assets/cover-landscape.png`
5. 主产物链接填 GitHub Pages 地址
6. 提交 → 进待审

如果审核要求补充材料（截图 / 说明文档），告诉我，我继续补。

---

## 六、备忘：审核最容易被打回的点

| 风险 | 应对 |
|---|---|
| 缺真机截图 | 目前只有设计封面图，没有真机截图。审核若要求，需要用手机实际打开截 2 张（棋盘 + 教练卡） |
| 主产物打不开 | GitHub Pages 一直在，实测 200；但首次加载 49MB 权重需耐心 |
| 描述像广告 | 已按"先说问题再说做法"写，避免堆功能词 |
| GPL-3.0 合规 | 仓库公开且完整，源码可获取，不构成问题 |
