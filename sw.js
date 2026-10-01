const CACHE_NAME = 'dip-v17';

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
  const isLive = /tile|cyberjapandata|disaportaldata|gbank\.gsj\.jp|jma\.go\.jp|nominatim|router\.project-osrm/.test(url.href);
  if (isLive) return;

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
