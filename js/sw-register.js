/**
 * sw-register.js - 注册 Service Worker
 *
 * 这**一个** Worker 同时干两件事（见 sw.js 顶部说明，别再拆成两个）：
 *   1. 给导航响应注入 COOP/COEP → SharedArrayBuffer / WASM pthread 可用（4~6 档）
 *   2. 离线缓存图标，让「添加到主屏幕」后没网也能打开
 *
 * 首次访问时当前文档是在 Worker 接管**之前**加载的，拿不到隔离头，
 * 所以必须 reload 一次。用 sessionStorage 打标记，保证最多只刷新一次，
 * 避免 Worker 出问题时页面无限刷新（对老人来说那是灾难）。
 */

(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // file:// 下不能注册

  var RELOAD_FLAG = 'xiangqi-sw-reloaded';

  function registerAndSync() {
    navigator.serviceWorker.register('./sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () {
      // 此刻 Worker 已激活并 claim 了页面，但当前文档仍是「无头」加载的，
      // 需要刷新一次才能拿到隔离头。
      if (!navigator.serviceWorker.controller && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        location.reload();
      }
    }).catch(function (err) {
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
