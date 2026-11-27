/**
 * notation.test.js - 中文记谱转换器测试
 *
 * 记谱是复盘功能的地基：记错了，点评就全错。
 * 这里用「期望记谱反查着法」的方式测 —— 不依赖手写坐标的正确性，
 * 避免测试用例本身写错（我在这上面栽过好几次）。
 */

const path = require('path');
const APP_DIR = path.resolve(__dirname, '..');
const { Xiangqi } = require(path.join(APP_DIR, 'js', 'xiangqi.js'));
const N = require(path.join(APP_DIR, 'js', 'notation.js'));

let pass = 0;
let fail = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) { pass++; console.log('  PASS  ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL  ' + msg); }
}

const g = new Xiangqi();

/**
 * 在给定局面里找出「记谱等于 wantName」的那一步。
 * @param {string} fen 局面
 * @param {string} wantName 期望的记谱，如「炮二平五」
 * @param {string} color 走子方 'r' 或 'b'
 */
function findMove(fen, wantName, color) {
  g.load(fen);
  for (let from = 0; from < 90; from++) {
    const p = g.board[from];
    if (!p || p.color !== color) continue;
    for (let to = 0; to < 90; to++) {
      if (to === from) continue;
      if (!g.isLegalMoveFull(from, to)) continue;
      if (N.moveToChinese(g.board, from, to) === wantName) {
        return { from, to, ucci: g.sqToUcci(from, to) };
      }
    }
  }
  return null;
}

const START = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';

console.log('=== 1. 标准开局着法 ===');
const OPENING = [
  ['炮二平五', 'r', '红底炮'],
  ['炮八平五', 'r', '红左炮'],
  ['马二进三', 'r', '红马'],
  ['马八进七', 'r', '红左马'],
  ['相三进五', 'r', '红相'],
  ['仕四进五', 'r', '红仕'],
  ['兵七进一', 'r', '红兵'],
  ['车一进二', 'r', '红右车'],
  ['马8进7', 'b', '黑马'],
  ['马2进3', 'b', '黑左马'],
  ['炮8平5', 'b', '黑炮'],
  ['卒7进1', 'b', '黑卒'],
  ['车9进2', 'b', '黑右车']
];
for (const [name, color, who] of OPENING) {
  const m = findMove(START, name, color);
  ok(!!m, who + ' → ' + name + (m ? '  (ucci ' + m.ucci + ')' : ''));
}

console.log('\n=== 2. 纵线编号约定 ===');
{
  // 红方 col8=一 … col0=九；黑方 col0=1 … col8=9
  g.load(START);
  const redRightRook = 9 * 9 + 8;   // 红方 col8 底线 → 应记「车一」
  const redLeftRook = 9 * 9 + 0;    // 红方 col0 底线 → 应记「车九」
  const blackLeftRook = 0 * 9 + 0;  // 黑方 col0 底线 → 应记「车1」
  const blackRightRook = 0 * 9 + 8; // 黑方 col8 底线 → 应记「车9」

  const r1 = N.moveToChinese(g.board, redRightRook, 7 * 9 + 8);
  ok(r1.indexOf('车一') === 0, '红方最右车记「车一」，实际「' + r1 + '」');

  const r2 = N.moveToChinese(g.board, redLeftRook, 7 * 9 + 0);
  ok(r2.indexOf('车九') === 0, '红方最左车记「车九」，实际「' + r2 + '」');

  const b1 = N.moveToChinese(g.board, blackLeftRook, 2 * 9 + 0);
  ok(b1.indexOf('车1') === 0, '黑方最左车记「车1」，实际「' + b1 + '」');

  const b2 = N.moveToChinese(g.board, blackRightRook, 2 * 9 + 8);
  ok(b2.indexOf('车9') === 0, '黑方最右车记「车9」，实际「' + b2 + '」');
}

console.log('\n=== 3. 前/后 区分同列同种子 ===');
{
  // 红方两辆车同在 col4：row7 靠前、row9 靠后
  const FEN2 = '3k5/9/9/9/9/9/9/4R4/4R4/4K4 w - - 0 1';
  g.load(FEN2);
  // 用反查法：找出被记成「前车…」和「后车…」的那两步
  let frontName = null, backName = null;
  for (let from = 0; from < 90; from++) {
    const p = g.board[from];
    if (!p || p.type !== 'r' || p.color !== 'r') continue;
    for (let to = 0; to < 90; to++) {
      if (to === from || !g.isLegalMoveFull(from, to)) continue;
      const n = N.moveToChinese(g.board, from, to);
      if (n.indexOf('前车') === 0) frontName = n;
      if (n.indexOf('后车') === 0) backName = n;
    }
  }
  ok(!!frontName, '同列双车，较前那辆记「前车…」（实际「' + frontName + '」）');
  ok(!!backName, '同列双车，较后那辆记「后车…」（实际「' + backName + '」）');
}

console.log('\n=== 4. 斜走记目标纵线，直线记步数 ===');
{
  // 斜走棋子的「进/退」记目标纵线：相/仕/马
  const DIAG = ['相三进五', '相七进五', '仕四进五', '仕六进五', '马二进三', '马八进七'];
  for (const want of DIAG) {
    const m = findMove(START, want, 'r');
    ok(!!m, '斜走记法 ' + want + (m ? '  (ucci ' + m.ucci + ')' : ''));
  }
  // 车走直线：1 格 = 进一，2 格 = 进二
  g.load('3k5/9/9/9/9/9/9/4R4/9/4K4 w - - 0 1');
  const one = N.moveToChinese(g.board, 7 * 9 + 4, 6 * 9 + 4);
  ok(one === '车五进一', '车前进 1 格记「进一」，实际「' + one + '」');
  const two = N.moveToChinese(g.board, 7 * 9 + 4, 5 * 9 + 4);
  ok(two === '车五进二', '车前进 2 格记「进二」，实际「' + two + '」');
}

console.log('\n=== 5. 边界与健壮性 ===');
{
  ok(N.moveToChinese(g.board, 0, 0) === '', '空位置返回空字符串（不抛错）');
  ok(N.ucciToChinese(g.board, 'xyz') === '', '非法 UCCI 返回空字符串');
  ok(N.ucciToChinese(g.board, '') === '', '空 UCCI 返回空字符串');
  ok(N.ucciToChinese(g.board, null) === '', 'null 返回空字符串');
  // 记谱不应修改局面
  g.load(START);
  const fenBefore = g.fen();
  N.moveToChinese(g.board, 7 * 9 + 7, 7 * 9 + 4);
  ok(g.fen() === fenBefore, '记谱不修改原局面');
}

console.log('\n' + '='.repeat(52));
console.log('记谱测试：' + pass + ' 通过 / ' + fail + ' 失败');
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach((f) => console.log('  - ' + f));
}
console.log('='.repeat(52));

process.exit(fail ? 1 : 0);
