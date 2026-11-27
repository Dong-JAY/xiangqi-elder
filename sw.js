/**
 * sw.js - 跨源隔离 + 离线缓存（单一 Service Worker）
 *
 * 为什么合并成一个：
 *   浏览器同一 scope 下只能有一个 active Service Worker，后注册的会顶掉先注册的。
 *   早期版本让 coi-serviceworker.js 单独注册负责 COOP/COEP、sw.js 负责缓存，
 *   结果 sw.js 一装上就把 coi 顶掉，下一次打开页面隔离头没了 →
 *   crossOriginIsolated=false → SharedArrayBuffer 不可用 → 4~6 档引擎彻底失效。
 *   所以隔离头和缓存必须由同一个 Worker 一起提供。
 *
 * 职责：
 *   1. 给「导航请求」注入 COOP/COEP —— SAB / WASM pthread 的前提。
 *      只需要顶层文档带头：同源子资源在 require-corp 下自动放行。
 *   2. 离线缓存：只缓存图标这种不变资源。
 */

const CACHE_NAME = 'xiangqi-elder-v3';

/*
 * 只预缓存「不会变」的东西：图标。
 * HTML/CSS/JS 一律不缓存 —— 见 fetch 处理器里的说明。
 */
const SHELL_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

/** 给响应补上跨源隔离头。 */
function withIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

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
        /*
         * 只清理**本应用自己的**旧版本缓存。
         * 绝不能无条件删掉所有非当前缓存 —— 引擎把 49MB NNUE 权重存在
         * 独立的 'pikafish-nnue-v1' 里，一旦被这里清掉，用户下次玩 4~6 档
         * 就要重新下载 49MB。老人手机上这是几十分钟的干等，还可能吃掉流量。
         */
        if (k !== CACHE_NAME && k.indexOf('xiangqi-elder-') === 0) {
          return caches.delete(k);
        }
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

  /*
   * 导航请求：拿到 HTML 后补隔离头。
   * 这是 SharedArrayBuffer 能不能用的唯一开关，也是本文件存在的首要原因。
   * 断网时回落到缓存的首页，同样要补头 —— 否则离线打开就没有高档位。
   */
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        return withIsolationHeaders(res);
      }).catch(function () {
        return caches.match('./index.html').then(function (cached) {
          if (cached) return withIsolationHeaders(cached);
          return Response.error();
        });
      })
    );
    return;
  }

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
  if (url.pathname.endsWith('.html')
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
        return Response.error();
      });
      return cached || network;
    })
  );
});
