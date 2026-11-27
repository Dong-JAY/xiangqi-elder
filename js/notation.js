/**
 * notation.js - 中国象棋中文记谱转换
 *
 * 把 UCCI 着法（如 "h2e2"）转成标准中文记谱（如 "炮二平五"）。
 *
 * 记谱规则要点：
 *   1. 同一列有两个同种棋子时，用「前/后」区分（如「前炮进二」）。
 *      只有一个时直接用「二/八/九」等数字标注原始纵线。
 *   2. 红方用汉字数字（一二三四五六七八九），黑方用阿拉伯数字（1-9）。
 *   3. 走法有四种：进（向前）、退（向后）、平（横走）。
 *      「进」后面的数字是**移动步数**，「平」「退」后面是**目标纵线**。
 *   4. 车/炮/兵/将 走直线时，"进"记步数；马/相/仕 走斜线时，
 *      "进"记的是**目标纵线**（这是记谱里最容易搞错的一点）。
 *
 * 本文件不修改底座的任何文件，独立挂在全局，供 app.js / 复盘引擎使用。
 */

(function (global) {
  'use strict';

  // 红方用汉字，黑方用阿拉伯数字
  const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const AR_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  // 棋子名（红/黑用字不同）
  const PIECE_CN = {
    'k': { 'r': '帅', 'b': '将' },
    'a': { 'r': '仕', 'b': '士' },
    'b': { 'r': '相', 'b': '象' },
    'n': { 'r': '马', 'b': '马' },
    'r': { 'r': '车', 'b': '车' },
    'c': { 'r': '炮', 'b': '炮' },
    'p': { 'r': '兵', 'b': '卒' }
  };

  // 走斜线的棋子：它们的"进"记目标纵线，而不是步数
  const DIAGONAL = { 'n': true, 'b': true, 'a': true };

  /**
   * 纵线编号约定（这是记谱最容易搞错的地方）：
   *   红方视角：竖线从**屏幕右往左**编号 一~九，即 col8=一 … col0=九
   *   黑方视角：竖线从**屏幕左往右**编号 1~9，即 col0=1 … col8=9
   * 校验：开局「炮二平五」= 底炮(col7,row7) → (col4,row7)
   *        红方 col7 → 8-7=1 → 二 ✓ ；col4 → 8-4=4 → 五 ✓
   */
  function lineIndex(color, col) {
    return color === 'r' ? (8 - col) : col;
  }

  /**
   * 纵线编号 → 汉字/数字。
   * n 是**0-based 的纵线序号**（0 = 第一条线）。
   * 红方 col8=一 … col0=九；黑方 col0=1 … col8=9。
   */
  function digit(color, n) {
    const arr = color === 'r' ? CN_DIGITS : AR_DIGITS;
    return arr[n];
  }

  /**
   * 步数 → 汉字/数字。
   * n 是**实际步数**（1 起算），与纵线序号的 0-based 语义不同，必须分开。
   */
  function stepDigit(color, n) {
    const arr = color === 'r' ? CN_DIGITS : AR_DIGITS;
    if (n < 1 || n > 9) return String(n);
    return arr[n - 1];
  }

  /**
   * 把内部索引转成纵线序号（0-8）与行号（0-9）。
   * 内部表示：索引 = row * 9 + col，row 0 是**底行**（红方底线），
   * row 9 是顶行（黑方底线）。
   */
  function toCoord(sq) {
    return { col: sq % 9, row: Math.floor(sq / 9) };
  }

  /**
   * 计算某方棋盘上「某一纵线上同种棋子」的数量与排序，
   * 用于判断该棋子是「前」还是「后」。
   *
   * 内部坐标：row 0 = **底行**（红方底线），row 9 = 顶行（黑方底线）。
   * 因此红方朝对方前进时 row **减小**，黑方朝对方前进时 row **增大**。
   *   红方：row 越小越靠前（靠得近对方）
   *   黑方：row 越大越靠前
   */
  function frontBackInfo(board, sq, type, color) {
    const from = toCoord(sq);
    const same = [];
    for (let i = 0; i < 90; i++) {
      const p = board[i];
      if (!p || p.type !== type || p.color !== color) continue;
      const c = toCoord(i);
      if (c.col !== from.col) continue;
      same.push({ sq: i, row: c.row });
    }
    if (same.length < 2) {
      // 只有一个子，直接用原始纵线编号
      return { count: 1, isFront: true, label: digit(color, lineIndex(color, from.col)) };
    }
    // 排序：红方 row 小的在前，黑方 row 大的在前
    same.sort((a, b) => (color === 'r' ? a.row - b.row : b.row - a.row));
    const idx = same.findIndex((x) => x.sq === sq);
    const isFront = idx === 0;
    // 两个子时记「前/后」；三个及以上也用「前/后」，中间的记「中」
    let label;
    if (same.length === 2) {
      label = isFront ? '前' : '后';
    } else {
      label = idx === 0 ? '前' : (idx === same.length - 1 ? '后' : '中');
    }
    return { count: same.length, isFront: isFront, label: label };
  }

  /**
   * 把一步着法转成中文记谱。
   *
   * @param {object} board  当前局面（数组长度 90，元素为 {type,color} 或 null）
   * @param {number} fromSq 起点索引
   * @param {number} toSq   终点索引
   * @returns {string} 如 "炮二平五"
   */
  function moveToChinese(board, fromSq, toSq) {
    const piece = board[fromSq];
    if (!piece) return '';
    const name = PIECE_CN[piece.type] ? PIECE_CN[piece.type][piece.color] : piece.type;
    const from = toCoord(fromSq);
    const to = toCoord(toSq);
    const info = frontBackInfo(board, fromSq, piece.type, piece.color);

    // 起点标注：只有一个子时用纵线数字，多个时用前/后
    const startLabel = info.count >= 2 ? info.label : digit(piece.color, lineIndex(piece.color, from.col));

    // 记谱格式：
    //   只有一个子          → 炮二平五   （棋名 + 纵线 + 走法 + 目标）
    //   同列有多个同种子    → 前车进一   （前/后 + 棋名 + 走法 + 目标）
    const pieceName = info.count >= 2 ? (startLabel + name) : (name + startLabel);

    // 走法类型
    let action, target;
    if (to.row === from.row) {
      action = '平';
      target = digit(piece.color, lineIndex(piece.color, to.col));
    } else if (piece.color === 'r') {
      // 红方：row 减小 = 向前（朝黑方底线），row 增大 = 退
      const forward = to.row < from.row;
      action = forward ? '进' : '退';
      if (DIAGONAL[piece.type]) {
        // 马/相/仕走斜线，"进/退"记目标纵线
        target = digit(piece.color, lineIndex(piece.color, to.col));
      } else {
        // 车/炮/兵/将 走直线，"进/退"记跨越的步数（= 行差，1 起算）
        target = stepDigit(piece.color, Math.abs(to.row - from.row));
      }
    } else {
      // 黑方：row 增大 = 向前（朝红方底线），row 减小 = 退
      const forward = to.row > from.row;
      action = forward ? '进' : '退';
      if (DIAGONAL[piece.type]) {
        target = digit(piece.color, lineIndex(piece.color, to.col));
      } else {
        target = stepDigit(piece.color, Math.abs(to.row - from.row));
      }
    }
    return pieceName + action + target;
  }

  /**
   * 从 UCCI 字符串直接转换。需要传入当前局面。
   */
  function ucciToChinese(board, ucci) {
    if (!board || !/^[a-i][0-9][a-i][0-9]$/.test(ucci || '')) return '';
    const fromCol = ucci.charCodeAt(0) - 97;
    const fromRow = 9 - parseInt(ucci.charAt(1), 10);
    const toCol = ucci.charCodeAt(2) - 97;
    const toRow = 9 - parseInt(ucci.charAt(3), 10);
    return moveToChinese(board, fromRow * 9 + fromCol, toRow * 9 + toCol);
  }

  global.Notation = {
    moveToChinese: moveToChinese,
    ucciToChinese: ucciToChinese,
    frontBackInfo: frontBackInfo,
    PIECE_CN: PIECE_CN
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = global.Notation;

})(typeof window !== 'undefined' ? window : this);
