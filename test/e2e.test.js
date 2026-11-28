/**
 * e2e.test.js - 适老化 UI 的端到端交互验证
 *
 * 用 jsdom 加载真实页面，模拟真实点击，断言 DOM 状态。
 * 比浏览器手动点击更可靠 —— 每个断言都可复现。
 *
 * 运行：node test/e2e.test.js
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP_DIR = path.resolve(__dirname, '..');

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL  ' + msg); }
}

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

function readFile(rel) {
  return fs.readFileSync(path.join(APP_DIR, rel), 'utf8');
}

async function main() {
  const html = readFile('index.html');
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    // Worker / WASM 在 jsdom 里不可用，这些是预期的
    const msg = String(e && e.message || e);
    if (/Worker|WebAssembly|not implemented/i.test(msg)) return;
    console.log('  [jsdom] ' + msg.slice(0, 160));
  });

  /*
   * 起一个本地静态服务器，让 JSDOM 用 resources:'usable' 真实去拉
   * index.html 里的 <script src>。这样脚本的加载与执行顺序、
   * DOMContentLoaded 的触发时机，都与真实浏览器一致 ——
   * 比手工注入脚本可靠得多。
   */
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(APP_DIR, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    const ext = path.extname(file);
    const type = ext === '.js' ? 'text/javascript'
      : ext === '.css' ? 'text/css'
      : ext === '.html' ? 'text/html'
      : ext === '.json' ? 'application/json'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
    res.end(fs.readFileSync(file));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    url: 'http://127.0.0.1:' + port + '/index.html',
    virtualConsole: vc,
    beforeParse(window) {
      // jsdom 没有布局引擎，给几个 API 打桩
      window.HTMLCanvasElement.prototype.getContext = () => null;
      window.navigator.vibrate = () => true;
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = function () {};

      /*
       * jsdom 没有 Web Worker。bridge.js 在 Worker 缺失时会抛 ReferenceError，
       * 而这个异常发生在 app.js 的 DOMContentLoaded 回调里 ——
       * 一旦抛出，后面的初始化（棋盘渲染、菜单绑定）全部不执行。
       * 所以这里给一个最小可用的 Worker 桩。
       */
      class FakeWorker {
        constructor() {
          this.onmessage = null;
          this.onerror = null;
          this.postMessage = () => {};
          this.terminate = () => {};
        }
        addEventListener() {}
        removeEventListener() {}
      }
      window.Worker = FakeWorker;
      window.SharedArrayBuffer = window.SharedArrayBuffer || function () { return new ArrayBuffer(0); };

    }
  });

  const { window } = dom;
  const doc = window.document;

  // 等 DOM 完全就绪（body 存在）
  await new Promise((resolve) => {
    if (doc.body) return resolve();
    window.addEventListener('DOMContentLoaded', resolve);
    setTimeout(resolve, 3000);
  });

  await new Promise((r) => setTimeout(r, 200));

  const $ = (id) => doc.getElementById(id);
  /*
   * 可见性判定。
   * jsdom 没有布局引擎，offsetParent 恒为 null，所以不能用它。
   * 改用：元素存在 + 计算样式里没有 display:none / visibility:hidden。
   * 另加一条「祖先链上没有 .hide」，等价于实际可见。
   */
  const visible = (el) => {
    if (!el) return false;
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    // 祖先链上不能有 .hide（底座的 .hide 是 display:none !important）
    let p = el;
    while (p && p !== doc.body) {
      if (p.classList && p.classList.contains('hide')) return false;
      p = p.parentElement;
    }
    return true;
  };

  // ---------------------------------------------------------------------
  section('1. 首屏结构');
  // ---------------------------------------------------------------------
  ok(visible($('pvebtn')), '首屏「和电脑下棋」按钮可见');
  ok(visible($('elder-pastbtn')), '首屏「挑战过去的自己」按钮可见');
  ok(visible($('elder-scoresbtn')), '首屏「我的成绩」按钮可见');
  ok(visible($('pvpbtn')), '首屏「和家里人下」按钮可见');
  ok(visible($('board-container')), '棋盘可见');
  ok($('menu-mode-pve').classList.contains('hide'), '先手菜单初始隐藏');
  ok($('menu-level').classList.contains('hide'), '难度菜单初始隐藏');
  ok($('ai-panel').classList.contains('collapsed'), '引擎数据面板默认折叠');

  section('2. 棋盘渲染');
  // ---------------------------------------------------------------------
  // 底座 app.js 在 DOMContentLoaded 时才 new XiangqiBoard()，
  // 这里再等一拍，确保渲染完成。
  await new Promise((r) => setTimeout(r, 300));
  const cells = doc.querySelectorAll('.xiangqi-cell');
  const pieces = doc.querySelectorAll('.xiangqi-piece');
  ok(cells.length === 90, '棋盘渲染 90 格（实际 ' + cells.length + '）');
  ok(pieces.length === 32, '棋子渲染 32 颗（实际 ' + pieces.length + '）');
  // 棋子文字应为中文
  const pieceTexts = Array.from(pieces).map((p) => p.textContent);
  ok(pieceTexts.indexOf('帅') >= 0 && pieceTexts.indexOf('車') >= 0,
     '棋子用汉字显示（帅/車）');

  section('3. 菜单流转');
  // ---------------------------------------------------------------------
  $('pvebtn').click();
  ok(!$('menu-mode-pve').classList.contains('hide'), '点「和电脑下棋」→ 先手菜单出现');
  ok($('menu').classList.contains('hide'), '主菜单已隐藏');

  $('pfbtn').click();
  ok(!$('menu-level').classList.contains('hide'), '点「我先走」→ 难度菜单出现');
  ok($('menu-mode-pve').classList.contains('hide'), '先手菜单已隐藏');

  section('4. 中文记谱');
  // ---------------------------------------------------------------------
  const N = window.Notation;
  ok(typeof N === 'object', '记谱模块已加载');
  if (N) {
    const g = new window.Xiangqi();
    ok(N.moveToChinese(g.board, 7 * 9 + 7, 7 * 9 + 4) === '炮二平五', '红底炮 → 炮二平五');
    ok(N.moveToChinese(g.board, 0 * 9 + 7, 2 * 9 + 6) === '马8进7', '黑马 → 马8进7');
    ok(N.moveToChinese(g.board, 9 * 9 + 7, 7 * 9 + 6) === '马二进三', '红马 → 马二进三');
    ok(N.moveToChinese(g.board, 7 * 9 + 1, 7 * 9 + 4) === '炮八平五', '红左炮 → 炮八平五');
    ok(N.moveToChinese(g.board, 9 * 9 + 3, 8 * 9 + 4) === '仕六进五', '红仕 → 仕六进五');
  }

  section('5. 适老模块挂载');
  // ---------------------------------------------------------------------
  const E = window.Elder;
  ok(typeof E === 'object', '适老模块已加载');
  if (E) {
    ok(typeof E.feedbackMove === 'function', '落子反馈（触觉+音效）已实现');
    ok(typeof E.saveGame === 'function', '战绩存储已实现');
    ok(typeof E.listGames === 'function', '战绩读取已实现');
    ok(typeof E.updateDifficulty === 'function', '自动升降档已实现');
    ok(typeof E.renderReview === 'function', '复盘卡渲染已实现');
    ok(typeof E.renderScores === 'function', '成绩页已实现');
    ok(typeof E.exportScores === 'function', '成绩导出已实现');
    ok(typeof E.showHome === 'function', '回到首页已实现');
  }
  ok(typeof window.Review === 'object', '复盘引擎已加载');

  section('6. 难度表完整性');
  // ---------------------------------------------------------------------
  const D = window.Difficulty;
  ok(D && D.LEVELS.length === 6, '六档难度定义完整');
  if (D) {
    ok(D.LEVELS.slice(0, 3).every((l) => l.engine === 'wukong'), '档 1-3 用内置 JS 引擎（零下载）');
    ok(D.LEVELS.slice(3).every((l) => l.engine === 'pikafish'), '档 4-6 用 Pikafish WASM');
    ok(D.getLevel(4).temperature === 120, '档 4 温度参数保留原作者实测值 120');
  }

  section('7. 复盘卡文案（无数字、无术语）');
  // ---------------------------------------------------------------------
  if (E) {
    const html2 = E.renderReview({
      title: '这盘有进步的地方',
      goodMove: '炮二平五',
      goodText: '第 1 步你走炮二平五，这一步很到位。',
      badMove: '马八进七',
      badText: '这步之后你的马就被吃了，当时应该走炮五进七，那样就不会丢子。',
      tip: '你第 1 步走的炮二平五就挺好，下盘遇到类似局面可以再来一次。'
    });
    ok(html2.indexOf('👍') >= 0, '复盘卡包含「做对了」的肯定');
    ok(html2.indexOf('👉') >= 0, '复盘卡包含「可以更好」的指引');
    ok(html2.indexOf('💡') >= 0, '复盘卡包含下一步建议');
    ok(html2.indexOf('厘分') < 0 && html2.indexOf('NPS') < 0, '复盘卡不含专业术语');
  }

  section('8. PWA 资源');
  // ---------------------------------------------------------------------
  const manifest = JSON.parse(readFile('manifest.json'));
  ok(manifest.name.length > 0, 'manifest 有应用名：' + manifest.name);
  ok(manifest.display === 'standalone', 'manifest 为独立窗口模式（添加到桌面后像 App）');
  ok(manifest.icons.length >= 2, 'manifest 有 ' + manifest.icons.length + ' 个图标');
  for (const icon of manifest.icons) {
    ok(fs.existsSync(path.join(APP_DIR, icon.src)), '图标文件存在：' + icon.src);
  }
  ok(fs.existsSync(path.join(APP_DIR, 'sw.js')), 'Service Worker 存在');
  // 版本号只增不减：只要 >= 当前基线即可，避免每次递增都要改测试
  var swSrc = readFile('sw.js');
  var cacheVer = (swSrc.match(/CACHE_NAME\s*=\s*'xiangqi-elder-v(\d+)'/) || [])[1];
  ok(cacheVer && Number(cacheVer) >= 3,
     'SW 缓存版本已递增（强制淘汰旧缓存）：v' + (cacheVer || '未找到'));

  /*
   * 以下三项是踩过的坑，必须由测试守住：
   *   1. 跨源隔离头必须由 SW 给导航响应注入，否则 SharedArrayBuffer 不可用
   *   2. 隔离与缓存必须是**同一个** SW —— 同 scope 下后注册的会顶掉先注册的，
   *      拆成两个会导致「第一次能玩高难度，之后永远不行」
   *   3. activate 不能无差别删缓存 —— 会把 49MB NNUE 权重缓存一起清掉
   */
  ok(/req\.mode\s*===\s*'navigate'/.test(swSrc) &&
     /Cross-Origin-Opener-Policy/.test(swSrc) &&
     /Cross-Origin-Embedder-Policy/.test(swSrc),
     'SW 给导航响应注入 COOP/COEP（SharedArrayBuffer 前提）');
  ok(/indexOf\('xiangqi-elder-'\)/.test(swSrc),
     'SW 只清理自己的旧缓存，不误删 NNUE 权重缓存');
  var htmlSrc = readFile('index.html');
  ok(htmlSrc.indexOf('coi-serviceworker') < 0,
     'index.html 不再单独加载 coi-serviceworker（避免双 SW 互相顶掉）');

  /*
   * 品牌一致性：「老将」是产品名，但首屏大标题必须保留「中国象棋」——
   * 老人靠这四个字识别"这是什么"，换成品牌名会让他们认不出。
   * 品牌名只能以小字标记的形式存在。
   */
  ok(htmlSrc.indexOf('老将') >= 0, '首屏有品牌标记「老将」');
  ok(htmlSrc.indexOf('中国象棋</title>') >= 0 || /title[^>]*>老将 · 中国象棋/.test(htmlSrc),
     '页面标题含「中国象棋」关键词（便于浏览器标签识别）');
  ok(htmlSrc.indexOf('title-brand') >= 0, '品牌标记使用独立样式类，不占大标题位置');
  // 升级路径：旧 Worker 换新后要自动刷新，否则老用户永远卡在「高档位不可用」
  var regSrc = readFile('js/sw-register.js');
  ok(/updateViaCache:\s*'none'/.test(regSrc),
     'SW 注册绕过 HTTP 缓存（否则升级要等 10 分钟才生效）');
  ok(/controllerchange/.test(regSrc) && /!window\.crossOriginIsolated/.test(regSrc),
     'SW 升级后自动刷新一次，恢复跨源隔离');

  // ---------------------------------------------------------------------
  section('9. 挑战过去的自己（复用过去的档位）');
  // ---------------------------------------------------------------------
  /*
   * 曾经的真实缺陷：首屏「挑战过去的自己」是卖点按钮，但点击回调里引用的
   * `global.elderStartPastSelf` 全局从未定义，所以任何情况下都只显示
   * 「还没有可以挑战的旧棋局」—— 有历史棋局也一样。点了没反应，属于死按钮。
   */
  ok(typeof E.startPastSelf === 'function',
     '「挑战过去的自己」已实现（此前是死按钮）');
  var elderSrc = readFile('js/elder.js');
  ok(elderSrc.indexOf('global.elderStartPastSelf') < 0,
     '按钮不再依赖未定义的 elderStartPastSelf 全局');

  // 无历史记录时（jsdom 没有 IndexedDB，listGames 会回落为空数组）
  $('elder-pastbtn').click();
  await new Promise((r) => setTimeout(r, 60));
  ok(/还没有可以挑战的旧棋局/.test($('elder-status').textContent),
     '没有旧棋局时给出人话提示，而不是静默无反应');
  ok(!$('board-options').classList.contains('hide'),
     '没有旧棋局时不收起菜单（否则用户以为界面坏了）');

  // 有历史记录时：桩掉 listGames，验证取的是「最早那一局」
  var started = [];
  var realOnGameStart = window.onGameStart;
  window.onGameStart = function (mode, side, level) {
    started.push({ mode: mode, side: side, level: level });
  };
  var origListGames = E.listGames;
  E.listGames = function () {
    return Promise.resolve([
      // 最新的在前（与真实 listGames 的排序一致）
      { time: Date.now() - 2 * 86400000, level: 5, side: 'r', result: 'win' },
      { time: Date.now() - 90 * 86400000, level: 2, side: 'b', result: 'loss' }
    ]);
  };

  $('elder-pastbtn').click();
  await new Promise((r) => setTimeout(r, 60));
  ok(started.length === 1, '有旧棋局时会真的开局');
  ok(started[0] && started[0].mode === 'pve', '走人机对战');
  ok(started[0] && started[0].level === 2,
     '用最早那一局的档位（2 档），不是最近一局（5 档）');
  ok(started[0] && started[0].side === 'b', '沿用当时的执子方（黑方）');
  ok($('board-options').classList.contains('hide'),
     '确认开局后才收起菜单面板');
  // 提示语延后 900ms 才出（开局流程会立刻覆盖状态条），这里等足
  await new Promise((r) => setTimeout(r, 1100));
  ok(/三个月前/.test($('elder-status').textContent),
     '明确告知是多久以前的水平（不能谎称三个月）');
  ok(/第 2 档/.test($('elder-status').textContent),
     '提示语带上档位，否则赢了第 2 档会误以为自己进步了');

  E.listGames = origListGames;
  window.onGameStart = realOnGameStart;

  // ---------------------------------------------------------------------
  console.log('\n' + '='.repeat(52));
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  if (failures.length) {
    console.log('\n失败项：');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('='.repeat(52));

  dom.window.close();
  server.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('测试执行异常：', e);
  process.exit(1);
});
