/**
 * sw.js - 离线缓存
 *
 * 策略：
 *   · 应用外壳（HTML/CSS/JS/图标）用 stale-while-revalidate 缓存，
 *     保证断网时还能打开页面、启动内置引擎下棋。
 *   · NNUE 权重（49MB）**不缓存** —— 太大，且底座已有 Cache Storage 机制
 *     专门处理它（内存 → Cache Storage → 网络 三层查找）。重复缓存一份
 *     会白白吃掉几百 MB 配额。
 */

const CACHE_NAME = 'xiangqi-elder-v2';

/*
 * 只预缓存「不会变」的东西：图标。
 * HTML/CSS/JS 一律不缓存 —— 见 fetch 处理器里的说明。
 */
const SHELL_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 单个资源失败不应该让整个安装失败
      return Promise.all(SHELL_ASSETS.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 权重与 wasm 不走这里的缓存 —— 由底座自己的三层查找负责
  if (url.pathname.endsWith('.nnue')) return;

  /*
   * HTML / CSS / JS 一律**不缓存**。
   * 这个应用会频繁迭代，把它们缓存住会导致「改了代码但页面还是旧的」，
   * 而且没有任何手段让用户强制刷新。对老人来说这尤其致命 ——
   * 他们不会知道要清缓存，只会以为应用坏了。
   * 离线能力由「档 1~3 的内置引擎是纯 JS、随页面一起加载」保证：
   * 页面本身拿不到时，浏览器会用 HTTP 缓存的副本。
   */
  if (req.mode === 'navigate'
      || url.pathname.endsWith('.html')
      || url.pathname.endsWith('.css')
      || url.pathname.endsWith('.js')
      || url.pathname.endsWith('.json')) {
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      const network = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy).catch(function () { /* 配额不足时忽略 */ });
          });
        }
        return res;
      }).catch(function () {
        // 断网且没有缓存 → 回落到首页，保证还能看到界面
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
      return cached || network;
    })
  );
});
