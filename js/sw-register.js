/**
 * sw-register.js - 注册 Service Worker
 *
 * 这**一个** Worker 同时干两件事（见 sw.js 顶部说明，别再拆成两个）：
 *   1. 给导航响应注入 COOP/COEP → SharedArrayBuffer / WASM pthread 可用（4~6 档）
 *   2. 离线缓存图标，让「添加到主屏幕」后没网也能打开
 *
 * 需要刷新页面的两种情形：
 *   a) 首次访问 —— 当前文档在 Worker 接管之前就加载完了，拿不到隔离头
 *   b) 从旧版本升级 —— 旧 Worker（无隔离头）还在接管，虽然 controller 存在，
 *      但文档没有隔离头。这种情况必须换到新 Worker 后再刷新，否则用户会
 *      一直卡在「高档位不可用」。
 *
 * 用 sessionStorage 打标记，保证最多只刷新一次，避免 Worker 异常时页面无限刷新
 * （对老人来说那是灾难）。
 */

(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // file:// 下不能注册

  var RELOAD_FLAG = 'xiangqi-sw-reloaded';
  var controllerChanged = false;

  function reloadOnce() {
    if (sessionStorage.getItem(RELOAD_FLAG)) return false;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    location.reload();
    return true;
  }

  /*
   * 新 Worker 接管时刷新一次。
   * 这是「旧版本升级」的关键路径：旧 Worker 被新版本替换 → 触发 controllerchange
   * → 刷新 → 新文档带上隔离头。
   */
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    controllerChanged = true;
    reloadOnce();
  });

  function registerAndSync() {
    /*
     * updateViaCache:'none' 让浏览器每次注册都真正回源检查 sw.js。
     * 不加的话，GitHub Pages 的 Cache-Control: max-age=600 会让浏览器
     * 十分钟内都拿旧 Worker，用户升级后长时间还停在有缺陷的版本上。
     */
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        // 主动向服务器要一次更新，不必等浏览器自己的检查周期
        return reg.update().then(function () { return reg; });
      })
      .then(function () {
        return navigator.serviceWorker.ready;
      })
      .then(function () {
        if (!navigator.serviceWorker.controller) {
          // 首次安装：拿到 controller 需要一次刷新，才能让隔离头生效
          reloadOnce();
          return;
        }
        if (window.crossOriginIsolated) return;

        /*
         * 有 controller 但没隔离 → 十有八九还是旧 Worker 在服务。
         * 优先等 controllerchange（新 Worker 接管时会立刻刷新）；
         * 给 3 秒窗口，只有在确实没等到替换时才兜底刷新一次 ——
         * 抢在替换完成前刷新会白白消耗掉唯一一次机会。
         */
        setTimeout(function () {
          if (!controllerChanged && !window.crossOriginIsolated) reloadOnce();
        }, 3000);
      })
      .catch(function (err) {
        // 注册失败不影响下棋：1~3 档是纯 JS 内置引擎，不需要隔离环境
        console.warn('Service Worker 注册失败：', err && err.message);
      });
  }

  // 越早注册越好：注册晚了下一次导航才生效，用户会白等一轮
  if (document.readyState === 'complete') {
    registerAndSync();
  } else {
    window.addEventListener('load', registerAndSync);
  }
})();
