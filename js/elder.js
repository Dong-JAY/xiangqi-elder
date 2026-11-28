/**
 * elder.js - 适老化行为层
 *
 * 负责：
 *   1. 人话状态提示（替代底座的「引擎搜索中…」这类术语）
 *   2. 落子反馈：触觉震动 + 音效
 *   3. 战绩存储（IndexedDB）与成绩页
 *   4. 复盘点评卡（模板版，零成本、离线、结果可预期）
 *   5. 自动升降档
 *   6. 首屏按钮接线（新首屏结构 vs 底座原有的多层菜单）
 *
 * 不修改底座的引擎与规则代码，只做叠加。
 */

(function (global) {
  'use strict';

  var Elder = {};

  // -------------------------------------------------------------------------
  // 1. 状态提示：说人话
  // -------------------------------------------------------------------------

  var statusEl = null;
  var statusTimer = null;

  /**
   * 设置状态条文案。
   * @param {string} text 要显示的话
   * @param {number} autoHideMs 若给了毫秒数，则到时后回到默认文案
   */
  Elder.setStatus = function (text, autoHideMs) {
    if (!statusEl) statusEl = document.getElementById('elder-status');
    if (!statusEl) return;
    statusEl.textContent = text;
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    if (autoHideMs) {
      statusTimer = setTimeout(function () {
        statusEl.textContent = '轮到你走';
      }, autoHideMs);
    }
  };

  // -------------------------------------------------------------------------
  // 2. 落子反馈：触觉 + 音效
  // -------------------------------------------------------------------------

  var audioCtx = null;

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    } catch (e) {
      audioCtx = null;
    }
    return audioCtx;
  }

  /**
   * 用 Web Audio 合成一个短促的"木头敲击"声。
   * 不引入任何音频文件，零体积、零网络请求。
   */
  function playPieceSound(isCapture) {
    var ctx = ensureAudio();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isCapture ? 220 : 340, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(isCapture ? 120 : 190, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) { /* 音频失败不影响对局 */ }
  }

  /** 震动反馈。老人对手感反馈依赖较强，尤其是吃子时。 */
  function vibrate(ms) {
    try {
      if (global.navigator && global.navigator.vibrate) global.navigator.vibrate(ms || 18);
    } catch (e) { /* 部分浏览器不支持 */ }
  }

  Elder.feedbackMove = function (isCapture) {
    playPieceSound(isCapture);
    vibrate(isCapture ? 45 : 18);
  };

  // -------------------------------------------------------------------------
  // 3. 战绩存储（IndexedDB）
  // -------------------------------------------------------------------------

  var DB_NAME = 'xiangqi_elder';
  var DB_VERSION = 1;
  var STORE_GAMES = 'games';
  var STORE_META = 'meta';
  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('浏览器不支持 IndexedDB')); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_GAMES)) {
          var s = db.createObjectStore(STORE_GAMES, { keyPath: 'id', autoIncrement: true });
          s.createIndex('time', 'time');
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(storeName, mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(storeName, mode);
        var store = t.objectStore(storeName);
        var result = fn(store);
        t.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  /** 存一局。失败不抛 —— 存战绩失败不该影响正常下棋。 */
  Elder.saveGame = function (record) {
    return tx(STORE_GAMES, 'readwrite', function (store) {
      return store.add(record);
    }).catch(function () { return null; });
  };

  /** 取所有对局，最新的在前。 */
  Elder.listGames = function () {
    return tx(STORE_GAMES, 'readonly', function (store) {
      return store.getAll();
    }).then(function (list) {
      list.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
      return list;
    }).catch(function () { return []; });
  };

  /** 读写一个元数据键（如连胜数、当前档位、段位）。 */
  Elder.getMeta = function (key, fallback) {
    return tx(STORE_META, 'readonly', function (store) {
      return store.get(key);
    }).then(function (rec) {
      return (rec && rec.value !== undefined) ? rec.value : fallback;
    }).catch(function () { return fallback; });
  };

  Elder.setMeta = function (key, value) {
    return tx(STORE_META, 'readwrite', function (store) {
      return store.put({ key: key, value: value });
    }).catch(function () { return null; });
  };

  // -------------------------------------------------------------------------
  // 4. 自动升降档
  // -------------------------------------------------------------------------

  var LEVELS = [1, 2, 3, 4, 5, 6];
  var WIN_STREAK_UP = 3;      // 连赢 3 局升一档
  var LOSS_STREAK_DOWN = 3;   // 连输 3 局降一档

  /**
   * 根据一局的结果更新连胜/连败与当前档位。
   * @returns {{level:number, changed:boolean, direction:string, streak:number}}
   */
  Elder.updateDifficulty = function (won, currentLevel) {
    return Promise.all([
      Elder.getMeta('winStreak', 0),
      Elder.getMeta('lossStreak', 0),
      Elder.getMeta('autoLevel', currentLevel || 3)
    ]).then(function (r) {
      var winStreak = r[0] || 0;
      var lossStreak = r[1] || 0;
      var level = r[2] || currentLevel || 3;

      if (won) { winStreak += 1; lossStreak = 0; }
      else { lossStreak += 1; winStreak = 0; }

      var changed = false, direction = '';
      if (winStreak >= WIN_STREAK_UP && level < 6) {
        level += 1; winStreak = 0; changed = true; direction = 'up';
      } else if (lossStreak >= LOSS_STREAK_DOWN && level > 1) {
        level -= 1; lossStreak = 0; changed = true; direction = 'down';
      }

      Elder.setMeta('winStreak', winStreak);
      Elder.setMeta('lossStreak', lossStreak);
      Elder.setMeta('autoLevel', level);
      return { level: level, changed: changed, direction: direction, streak: won ? winStreak : lossStreak };
    });
  };

  /** 升/降档时给用户看的话。要像朋友说话，不能出现「参数」「算法」这类词。 */
  Elder.difficultyMessage = function (result) {
    if (!result.changed) return '';
    if (result.direction === 'up') {
      return '你最近赢得多，我给你调难一点点了（第 ' + result.level + ' 档）。';
    }
    return '这档有点难，我给你调简单点（第 ' + result.level + ' 档）。';
  };

  // -------------------------------------------------------------------------
  // 5. 复盘点评卡（模板版）
  // -------------------------------------------------------------------------

  /**
   * 生成复盘点评卡。
   *
   * @param {object} result 由复盘引擎算出：
   *   { title, goodMove, goodText, badMove, badText, tip }
   *   其中 goodMove/badMove 可以为空（只讲有的，不硬凑）。
   * @returns {string} HTML
   */
  Elder.renderReview = function (result) {
    if (!result) return '';
    var h = [];
    h.push('<h2>' + (result.title || '这盘复盘') + '</h2>');

    if (result.goodMove) {
      h.push('<div class="review-good">' +
        '<span class="review-tag">👍 这步走得不错</span>' +
        '<span class="review-move">' + result.goodMove + '</span>' +
        (result.goodText ? '<br>' + result.goodText : '') +
        '</div>');
    }

    if (result.badMove) {
      h.push('<div class="review-bad">' +
        '<span class="review-tag">👉 这步可以更好</span>' +
        '<span class="review-move">你走：' + result.badMove + '</span>' +
        (result.badText ? '<br>' + result.badText : '') +
        '</div>');
    }

    if (result.tip) {
      h.push('<div class="review-tip">' +
        '<span class="review-tag">💡 下一盘试试</span>' + result.tip +
        '</div>');
    }

    h.push('<div class="review-actions">' +
      '<button type="button" data-act="again">再来一局</button>' +
      '<button type="button" class="secondary" data-act="close">收起</button>' +
      '</div>');

    return h.join('');
  };

  /** 把点评卡挂到页面上并接线按钮。 */
  Elder.showReview = function (result) {
    var box = document.getElementById('elder-review');
    if (!box) return;
    box.innerHTML = Elder.renderReview(result);
    box.classList.remove('hide');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    var again = box.querySelector('[data-act="again"]');
    if (again) again.addEventListener('click', function () {
      box.classList.add('hide');
      if (global.elderStartGame) global.elderStartGame();
    });
    var close = box.querySelector('[data-act="close"]');
    if (close) close.addEventListener('click', function () {
      box.classList.add('hide');
    });
  };

  // -------------------------------------------------------------------------
  // 6. 成绩页
  // -------------------------------------------------------------------------

  Elder.renderScores = function () {
    return Elder.listGames().then(function (list) {
      var box = document.getElementById('elder-scores');
      if (!box) return;

      if (!list.length) {
        box.innerHTML = '<h2 style="text-align:center;color:#c0392b;font-size:24px;margin:0 0 12px;">我的成绩</h2>' +
          '<p style="text-align:center;font-size:19px;color:#55503f;">还没有下过棋，先来一局吧。</p>';
        box.classList.remove('hide');
        box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      var wins = 0, losses = 0, draws = 0;
      list.forEach(function (g) {
        if (g.result === 'win') wins++;
        else if (g.result === 'loss') losses++;
        else draws++;
      });
      var total = list.length;
      var rate = total ? Math.round(wins * 100 / total) : 0;

      var h = [];
      h.push('<h2 style="text-align:center;color:#c0392b;font-size:24px;margin:0 0 14px;">我的成绩</h2>');
      h.push('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">');
      h.push(scoreTile('下了', total + ' 局'));
      h.push(scoreTile('赢了', wins + ' 局'));
      h.push(scoreTile('胜率', rate + '%'));
      h.push('</div>');

      // 最近 10 局用色块表示，一眼看出走势
      h.push('<div style="font-size:17px;margin-bottom:6px;">最近 10 局</div>');
      h.push('<div style="display:flex;gap:5px;margin-bottom:16px;flex-wrap:wrap;">');
      list.slice(0, 10).forEach(function (g) {
        var c = g.result === 'win' ? '#2e8b57' : (g.result === 'loss' ? '#c0392b' : '#b9b2a0');
        h.push('<div title="' + (g.result || '') + '" style="width:28px;height:28px;border-radius:6px;background:' + c + ';"></div>');
      });
      h.push('</div>');

      // 历史对局列表
      h.push('<div style="font-size:17px;margin-bottom:6px;">以前下过的</div>');
      h.push('<div style="max-height:260px;overflow-y:auto;">');
      list.slice(0, 30).forEach(function (g) {
        var tag = g.result === 'win' ? '赢' : (g.result === 'loss' ? '输' : '和');
        var color = g.result === 'win' ? '#1f6b41' : (g.result === 'loss' ? '#a8501a' : '#55503f');
        var d = new Date(g.time || Date.now());
        var ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        h.push('<div style="display:flex;justify-content:space-between;padding:9px 4px;border-bottom:1px solid #ece8dc;font-size:17px;">' +
          '<span>' + ds + '</span>' +
          '<span style="color:' + color + ';font-weight:700;">' + tag + ' · ' + (g.level || 3) + '档</span>' +
          '</div>');
      });
      h.push('</div>');

      h.push('<div class="review-actions" style="margin-top:16px;">' +
        '<button type="button" data-act="close">知道了</button>' +
        '<button type="button" class="secondary" data-act="export">导出成绩</button>' +
        '</div>');

      box.innerHTML = h.join('');
      box.classList.remove('hide');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      var close = box.querySelector('[data-act="close"]');
      if (close) close.addEventListener('click', function () { box.classList.add('hide'); });

      var exp = box.querySelector('[data-act="export"]');
      if (exp) exp.addEventListener('click', function () { Elder.exportScores(list); });
    });
  };

  function scoreTile(label, value) {
    return '<div style="background:#fff;border:1px solid #e8cf9a;border-radius:10px;padding:12px 6px;text-align:center;">' +
      '<div style="font-size:15px;color:#55503f;">' + label + '</div>' +
      '<div style="font-size:24px;font-weight:700;color:#1c1a15;margin-top:2px;">' + value + '</div>' +
      '</div>';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /**
   * 导出战绩为 JSON 文件。
   * 浏览器清缓存会导致 IndexedDB 丢失，所以给一条备份路径。
   */
  Elder.exportScores = function (list) {
    list = list || [];
    var payload = {
      exportedAt: new Date().toISOString(),
      app: '给爸爸的象棋',
      games: list
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '我的象棋战绩-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    Elder.setStatus('成绩已导出，可以发到微信收藏存起来');
  };

  /**
   * 阿拉伯数字转中文（1~99）。
   * 长辈读「三个月前」比读「3 个月前」顺，而且中文数字混在句子里没有空格断层。
   */
  function cnNum(n) {
    var d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return d[n];
    if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
    if (n < 100) {
      var t = Math.floor(n / 10), o = n % 10;
      return d[t] + '十' + (o ? d[o] : '');
    }
    return String(n);
  }

  /**
   * 把「多久以前」说成人话。
   * 不能直接写「三个月前的你」—— 记录可能只有两天，那是撒谎。
   */
  function describePast(ts) {
    if (!ts) return '以前';
    var diff = Date.now() - ts;
    var DAY = 24 * 60 * 60 * 1000;
    if (diff < DAY) return '今天早些时候';
    var days = Math.floor(diff / DAY);
    if (days < 30) return cnNum(days) + '天前';
    var months = Math.floor(days / 30);
    if (months < 12) return cnNum(months) + '个月前';
    return cnNum(Math.floor(months / 12)) + '年前';
  }

  /**
   * 「挑战过去的自己」：用最早那一局的难度档位与执子方，开一局新棋。
   *
   * 为什么取「时间最靠前」而不是「上一局」：这个功能的价值在对比，
   * 必须是真正的"过去的我"。拿上一局来比，赢了也没有"我变强了"的感觉。
   *
   * 同时必须**明说是多久以前、第几档**——否则他不知道自己在跟谁下，
   * 赢了个第 1 档还以为自己进步了。
   *
   * @param {function} onStart 确认有旧棋局、即将开局时的回调（用来收起菜单面板）
   * @returns {Promise<{level:number, side:string, time:number}|null>}
   */
  Elder.startPastSelf = function (onStart) {
    return Elder.listGames().then(function (list) {
      if (!list || !list.length) {
        Elder.setStatus('还没有可以挑战的旧棋局，先下一局吧');
        return null;
      }
      // listGames() 已按时间倒序（最新在前），所以末尾是最早的一局
      var oldest = list[list.length - 1];
      var level = oldest.level || 3;
      var side = oldest.side === 'b' ? 'b' : 'r';
      var when = describePast(oldest.time);

      if (typeof onStart === 'function') onStart();
      if (global.onGameStart) global.onGameStart('pve', side, level);

      /*
       * 这句话必须延后一拍再说。
       * 开局流程会立刻把状态条改成「正在准备引擎…」「轮到…走子」，
       * 同步调用会被当场覆盖 —— 实测过：点完按钮状态条只剩「轮到黑方走子。」，
       * 用户根本不知道自己是在跟哪个水平的自己下，这个功能就白做了。
       * 也不设 autoHide：让它一直挂着，直到引擎走出第一步才被替换。
       */
      setTimeout(function () {
        Elder.setStatus('在跟' + when + '的你下（第 ' + level + ' 档）');
      }, 900);

      return { level: level, side: side, time: oldest.time };
    }).catch(function () {
      Elder.setStatus('旧棋局读取失败，先来一局新的吧');
      return null;
    });
  };

  // -------------------------------------------------------------------------
  // 7. 首屏按钮接线
  // -------------------------------------------------------------------------

  Elder.bindHomeButtons = function () {
    var menu = document.getElementById('menu');
    var menuMode = document.getElementById('menu-mode');
    var menuModePve = document.getElementById('menu-mode-pve');
    var menuLevel = document.getElementById('menu-level');
    var boardOptions = document.getElementById('board-options');

    var pveBtn = document.getElementById('pvebtn');
    var pvpBtn = document.getElementById('pvpbtn');
    var pfBtn = document.getElementById('pfbtn');
    var efBtn = document.getElementById('efbtn');
    var pastBtn = document.getElementById('elder-pastbtn');
    var scoresBtn = document.getElementById('elder-scoresbtn');
    var returnToMode = document.getElementById('return-to-mode');
    var returnFromLevel = document.getElementById('return-from-level');

    var levelBackTo = menuModePve;
    var playerFirst = true;

    // 适老结构：菜单是独立面板，默认可见
    if (boardOptions) boardOptions.classList.remove('hide');
    if (menu) menu.classList.remove('hide');

    /**
     * 切换菜单层。
     * 适老结构里菜单是棋盘下方的独立面板，不再是覆盖棋盘的遮罩，
     * 所以除了切换各层显隐，还要把整个面板收起来（对局开始后不占屏幕）。
     */
    function show(node) {
      [menu, menuMode, menuModePve, menuLevel].forEach(function (m) {
        if (m) m.classList.add('hide');
      });
      if (node) node.classList.remove('hide');
    }

    function hidePanel() {
      if (boardOptions) boardOptions.classList.add('hide');
    }

    if (pveBtn) pveBtn.addEventListener('click', function () {
      show(menuModePve);
    });
    if (pvpBtn) pvpBtn.addEventListener('click', function () {
      hidePanel();
      if (global.onGameStart) global.onGameStart('pvp', 'r', 3);
      Elder.setStatus('你和家里人轮流下');
    });
    if (pastBtn) pastBtn.addEventListener('click', function () {
      // 收起菜单面板放在确认有旧棋局之后 —— 否则没记录时面板已消失、
      // 只剩一行状态字，用户会以为按钮坏了。
      Elder.startPastSelf(hidePanel);
    });
    if (scoresBtn) scoresBtn.addEventListener('click', function () {
      Elder.renderScores();
    });

    if (pfBtn) pfBtn.addEventListener('click', function () { playerFirst = true; show(menuLevel); });
    if (efBtn) efBtn.addEventListener('click', function () { playerFirst = false; show(menuLevel); });

    if (returnToMode) returnToMode.addEventListener('click', function () { show(menu); });
    if (returnFromLevel) returnFromLevel.addEventListener('click', function () {
      show(levelBackTo);
    });

    document.querySelectorAll('.level-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var level = parseInt(btn.dataset.level, 10);
        hidePanel();
        if (global.onGameStart) {
          global.onGameStart('pve', playerFirst ? 'r' : 'b', level);
        }
      });
    });
  };

  /** 难度菜单每次打开时，把当前自动档位标出来并预选。 */
  Elder.highlightAutoLevel = function (level) {
    document.querySelectorAll('.level-btn').forEach(function (btn) {
      var lv = parseInt(btn.dataset.level, 10);
      btn.style.borderColor = (lv === level) ? '#c0392b' : '';
      btn.style.borderWidth = (lv === level) ? '3px' : '';
      if (lv === level) {
        var h1 = btn.querySelector('h1');
        if (h1 && !h1.getAttribute('data-orig')) {
          h1.setAttribute('data-orig', h1.textContent);
          h1.textContent = h1.textContent + ' ✓';
        }
      } else {
        var h2 = btn.querySelector('h1');
        if (h2 && h2.getAttribute('data-orig')) h2.textContent = h2.getAttribute('data-orig');
      }
    });
  };

  /** 回到首屏：重新显示菜单面板与主菜单层。 */
  Elder.showHome = function () {
    var boardOptions = document.getElementById('board-options');
    var menu = document.getElementById('menu');
    if (boardOptions) boardOptions.classList.remove('hide');
    if (menu) menu.classList.remove('hide');
  };

  // -------------------------------------------------------------------------
  // 8. 详情抽屉
  // -------------------------------------------------------------------------

  Elder.bindDetailToggle = function () {
    var toggle = document.getElementById('elder-detail-toggle');
    var panel = document.getElementById('ai-panel');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', function () {
      var collapsed = panel.classList.toggle('collapsed');
      toggle.textContent = collapsed ? '查看引擎数据' : '收起引擎数据';
    });
  };

  global.Elder = Elder;

})(typeof window !== 'undefined' ? window : this);
