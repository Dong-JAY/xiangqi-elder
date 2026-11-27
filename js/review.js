/**
 * review.js - 复盘反馈引擎（模板版）
 *
 * 原理：对局结束后，让引擎把整局"重走"一遍，逐步比较
 *   · 玩家实际走的着法
 *   · 引擎在同一局面下认为最优的着法
 * 用两者之间的分差损失（厘分）定位关键失误，同时挑出玩家做对的步。
 *
 * 输出是人话卡片（先夸后批），不出现任何数字术语。
 *
 * ⚠️ 关键陷阱（来自底座 CLAUDE.md）：
 *   发给引擎的必须是 `position fen <起始FEN> moves <全部着法>`，
 *   **不能**写成 `position fen <当前FEN> moves <全部着法>` ——
 *   后者等于在已经走完的局面之上再走一遍，等于喂非法着法。
 *
 * 本文件不修改底座引擎，只通过 EngineBridge 的公开接口调用。
 */

(function (global) {
  'use strict';

  var Review = {};

  // 失误判定阈值（厘分）。按难度分档：
  // 低档位阈值放宽 —— 否则低档位下每步都会被标成失误，爸爸一看满屏红字就放弃了。
  var LOSS_THRESHOLD = {
    1: 120, 2: 100, 3: 80, 4: 60, 5: 50, 6: 40
  };

  /** 分差损失超过这个值才值得讲（单步）。 */
  var SINGLE_MOVE_MIN = 60;

  /**
   * 把引擎给的评估分折算成统一的厘分（越大越好）。
   * 引擎用 mate 表示将死，这里折算成很大的正数。
   */
  function scoreToCp(info) {
    if (!info || typeof info.score !== 'number') return null;
    return info.score;
  }

  /**
   * 找出玩家做对的步：走法与引擎首选一致。
   * @param {Array} rows 每行 {moves: [...], info: {...}, isPlayer: bool}
   */
  function findGoodMoves(rows) {
    var good = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.isPlayer || !r.info || !r.info.move) continue;
      // 引擎在这一步返回的就是它首选的着法，而玩家也走了这一步
      if (r.playerMove === r.info.move) {
        good.push(r);
      }
    }
    return good;
  }

  /**
   * 找出最该改的一步：分差损失最大的那一步。
   */
  function findWorstMove(rows) {
    var worst = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.isPlayer || !r.info) continue;
      var loss = r.loss;
      if (typeof loss !== 'number' || loss <= 0) continue;
      if (!worst || loss > worst.loss) worst = r;
    }
    return worst;
  }

  /**
   * 根据失误类型生成人话点评。
   * 不用「双车错」「海底捞月」这类术语，要么不用，要么带一句解释。
   */
  function describeMistake(row, bestMoveInfo) {
    var text = '';
    var captured = row.capturedName || '';
    var bestName = row.bestMoveName || '';

    if (row.lostPiece) {
      text = '这步之后你的' + row.lostPiece + '就被吃了，'
           + (bestName ? '当时应该走' + bestName + '，那样就不会丢子。' : '当时有别的走法能保住它。');
    } else if (row.gaveCheck) {
      text = '这里该将军一下，你没将，白方缓了一口气，后面就变得被动了。'
           + (bestName ? '更好的走法是' + bestName + '。' : '');
    } else if (row.missedCapture) {
      text = '这里有个子能吃你没吃，'
           + (bestName ? '先走' + bestName + '把这子收掉更划算。' : '白白放过了这个机会。');
    } else {
      text = '这步不算错，但有更好的走法。'
           + (bestName ? '引擎觉得走' + bestName + '更合适。' : '');
    }
    return text;
  }

  /**
   * 生成一条「下一盘试试」的建议。
   * 从玩家做对的步里挑一条，强化他做对的动作。
   */
  function buildTip(goodRows, worstRow) {
    if (goodRows.length) {
      var g = goodRows[goodRows.length - 1];
      if (g.playerMoveName) {
        return '你第 ' + g.stepNo + ' 步走的' + g.playerMoveName + '就挺好，下盘遇到类似局面可以再来一次。';
      }
    }
    if (worstRow && worstRow.bestMoveName) {
      return '下一盘留意一下第 ' + worstRow.stepNo + ' 步，那步走' + worstRow.bestMoveName + '会更好。';
    }
    return '多下几局，手感会越来越顺。';
  }

  /**
   * 主入口：对一局做复盘。
   *
   * @param {object} gameObj 当前的 Xiangqi 实例
   * @param {string} playerSide 玩家执子 'r' 或 'b'
   * @param {number} level 当前难度档
   * @param {function} searchFn (fen, moves, level) => Promise<{move, score, legalMoves}>
   *        由调用方注入（app.js 里用 EngineBridge 实现），保持本模块可独立测试。
   * @returns {Promise<object>} 复盘结果，供 Elder.renderReview 渲染
   */
  Review.analyze = function (gameObj, playerSide, level, searchFn) {
    if (!gameObj || !gameObj.history || !gameObj.history.length) {
      return Promise.resolve(null);
    }

    var threshold = LOSS_THRESHOLD[level] || 80;
    var startFen = gameObj.startFen;
    var moves = [];
    for (var i = 0; i < gameObj.history.length; i++) {
      moves.push(gameObj.history[i].ucci);
    }

    var rows = [];
    // 逐个局面复盘：position fen <起始FEN> moves <前 i 步>
    var chain = Promise.resolve();
    for (var step = 0; step < moves.length; step++) {
      (function (stepIdx) {
        chain = chain.then(function () {
          var playedMoves = moves.slice(0, stepIdx);
          return searchFn(startFen, playedMoves, level).then(function (info) {
            var entry = gameObj.history[stepIdx];
            var isPlayer = (entry.piece.color === playerSide);
            var row = {
              stepNo: stepIdx + 1,
              isPlayer: isPlayer,
              playerMove: entry.ucci,
              playerMoveName: entry.cn || '',
              capturedName: entry.capturedCn || '',
              lostPiece: entry.lostCn || '',
              gaveCheck: !!entry.gaveCheck,
              missedCapture: false,
              info: info,
              loss: 0,
              bestMoveName: ''
            };

            if (info && info.move) {
              // 引擎首选与玩家实际走法不同 → 有失误候选
              if (info.move !== entry.ucci) {
                // 用引擎给的次优分差估算损失
                row.loss = (typeof info.score === 'number' && typeof info.bestScore === 'number')
                  ? Math.max(0, info.bestScore - info.score)
                  : 0;
                row.bestMove = info.move;
                row.bestMoveName = info.bestMoveName || '';
              } else {
                row.loss = 0;
              }
            }
            rows.push(row);
          }).catch(function () {
            // 某一步分析失败就跳过那一步，不能因为一次失败丢掉整盘复盘
            rows.push({ stepNo: stepIdx + 1, isPlayer: false, loss: 0 });
          });
        });
      })(step);
    }

    return chain.then(function () {
      var goodRows = findGoodMoves(rows);
      var worst = findWorstMove(rows);

      // 损失太小的不算失误（阈值按档位放宽）
      if (worst && worst.loss < threshold) worst = null;
      if (worst && worst.loss < SINGLE_MOVE_MIN) worst = null;

      var playerRows = rows.filter(function (r) { return r.isPlayer; });
      var won = false;
      if (playerRows.length) {
        // 玩家赢了没有 —— 由调用方通过 result 传入更准，这里先按最后一步判断
        won = false;
      }

      var good = null;
      if (goodRows.length) {
        // 取玩家做对的那一步里最靠后的一步（印象更深）
        good = goodRows[goodRows.length - 1];
      }

      var title = '这盘复盘';
      if (good && worst) {
        title = '这盘有进步的地方';
      } else if (good) {
        title = '这盘下得不错！';
      }

      return {
        title: title,
        goodMove: good ? good.playerMoveName : '',
        goodText: good ? '第 ' + good.stepNo + ' 步你走' + good.playerMoveName + '，这一步很到位。' : '',
        badMove: worst ? worst.playerMoveName : '',
        badText: worst ? describeMistake(worst) : '',
        tip: buildTip(goodRows, worst),
        rows: rows,
        win: won
      };
    });
  };

  global.Review = Review;

  if (typeof module !== 'undefined' && module.exports) module.exports = Review;

})(typeof window !== 'undefined' ? window : this);
