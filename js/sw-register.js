/**
 * sw-register.js - 注册离线缓存 Service Worker
 *
 * 作用：让「添加到主屏幕」后的 PWA 在没网时也能打开（档 1~3 的内置引擎
 * 是纯 JS，零下载，完全离线可玩）。
 *
 * 注意：真正的跨源隔离头由 coi-serviceworker.js 负责，它会强制 reload 一次。
 * 两个 Service Worker 的注册互不影响，但为了避免首次进入时连续 reload 两次，
 * 这里把离线缓存注册延后到 coi 完成之后。
 */

(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // file:// 下不能注册

  function register() {
    navigator.serviceWorker.register('./sw.js').then(function () {
      // 注册成功即可，缓存内容由 sw.js 按需填充
    }).catch(function (err) {
      // 离线缓存失败不影响正常下棋，忽略
      console.warn('离线缓存注册失败：', err && err.message);
    });
  }

  // coi-serviceworker.js 首次注册后会 reload 一次。等它稳定后再注册离线缓存。
  if (document.readyState === 'complete') {
    setTimeout(register, 800);
  } else {
    window.addEventListener('load', function () { setTimeout(register, 800); });
  }
})();
