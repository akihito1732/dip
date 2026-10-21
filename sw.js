const CACHE_NAME = 'dip-v35';

// アプリ本体(地図タイルは含めない。タイルは通信時のみ取得)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './strikedip.js',
  './elevation.js',
  './profile.js',
  './geology.js',
  './geology-legend.json',
  './weather.js',
  './info.js',
  './sync.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 地図タイル・外部APIは常にネットワークから取得する(容量と鮮度のため)。
  // 気象庁は時刻一覧が数分ごとに更新されるので、キャッシュすると古い時刻を返し続けてしまう。
  // Googleマップは規約上、地図データをキャッシュ(保存)してはいけないので必ず除外する。
  // 同期(Firebase)の通信やログインは、古い応答を返すと壊れるので絶対にキャッシュしない。
  // (Firebase のプログラム本体 www.gstatic.com/firebasejs/ はオフラインで起動できるようキャッシュする)
  const isLive = /tile|cyberjapandata|disaportaldata|gbank\.gsj\.jp|jma\.go\.jp|nominatim|router\.project-osrm|(maps|firestore|identitytoolkit|securetoken|firebaseinstallations|www)\.googleapis\.com|maps\.gstatic\.com|googleusercontent\.com|ggpht\.com|google\.com\/maps|firebaseapp\.com|apis\.google\.com|accounts\.google\.com/.test(url.href);
  if (isLive) return;
  // 招待リンク(?join=…)などクエリ付きのページは、キャッシュ済みのアプリ本体で開く
  if (event.request.mode === 'navigate' && url.origin === self.location.origin && url.search) {
    event.respondWith(caches.match('./index.html').then(c => c || fetch(event.request)));
    return;
  }
  // POST など GET 以外はキャッシュの対象外
  if (event.request.method !== 'GET') return;

  // アプリ本体はキャッシュ優先、なければネットワーク
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
