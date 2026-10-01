/* ============================================================
   elevation.js — 国土地理院の標高タイルから標高を求める

   仕組み:
     - 緯度経度から該当する標高タイル(PNG)を求めて読み込み、
       canvasで画素値を取り出して標高に換算する。
     - 換算式(標高タイルの詳細仕様):
         x = 2^16 * R + 2^8 * G + B
         x <  2^23  → h = x * u
         x == 2^23  → 無効値
         x >  2^23  → h = (x - 2^24) * u
       u は標高分解能 0.01m。無効値の画素は (R,G,B)=(128,0,0)。
     - 精度の高い順に DEM1A → DEM5A → DEM5B → DEM5C → DEM10B を探し、
       有効な値が得られた時点で採用する。
     - 一度読んだタイルはキャッシュするので、同じタイル内なら
       何点でも通信なしで標高を引ける(断面図で効く)。

   出典: 国土地理院(地理院タイル)
   https://maps.gsi.go.jp/development/ichiran.html
   ============================================================ */
(function (global) {
  'use strict';

  var U = 0.01;              // 標高分解能(m)
  var POW2_23 = 8388608;     // 2^23
  var POW2_24 = 16777216;    // 2^24

  // 精度の高い順。zはそのデータが用意されている最大ズームレベル。
  var SOURCES = [
    { id: 'dem1a_png', z: 15, name: 'DEM1A' },
    { id: 'dem5a_png', z: 15, name: 'DEM5A' },
    { id: 'dem5b_png', z: 15, name: 'DEM5B' },
    { id: 'dem5c_png', z: 15, name: 'DEM5C' },
    { id: 'dem_png',   z: 14, name: 'DEM10B' },
  ];
  var BASE = 'https://cyberjapandata.gsi.go.jp/xyz/';

  var tileCache = {};   // "id/z/x/y" → Promise<ImageData|null>

  /* ---------- タイル座標の計算 ---------- */

  // 緯度経度 → タイル番号と、その中のピクセル位置
  function latLngToTilePixel(lat, lng, z) {
    var n = Math.pow(2, z);
    var latRad = lat * Math.PI / 180;
    var xWorld = (lng + 180) / 360 * n;
    var yWorld = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    var tx = Math.floor(xWorld);
    var ty = Math.floor(yWorld);
    var px = Math.floor((xWorld - tx) * 256);
    var py = Math.floor((yWorld - ty) * 256);
    return { tx: tx, ty: ty, px: Math.min(255, px), py: Math.min(255, py) };
  }

  /* ---------- タイルの読み込み ---------- */

  function loadTile(sourceId, z, x, y) {
    var key = sourceId + '/' + z + '/' + x + '/' + y;
    if (tileCache[key]) return tileCache[key];

    tileCache[key] = new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';   // canvasで画素を読むために必要
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = 256; cv.height = 256;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, 256, 256));
        } catch (e) {
          resolve(null);   // 画素を読めない場合(CORSなど)
        }
      };
      img.onerror = function () { resolve(null); };  // タイルが無い場所
      img.src = BASE + sourceId + '/' + z + '/' + x + '/' + y + '.png';
    });
    return tileCache[key];
  }

  // 画素値 → 標高(無効値はnull)
  function pixelToElevation(data, idx) {
    var r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
    if (a === 0) return null;
    if (r === 128 && g === 0 && b === 0) return null;   // 仕様上の無効値
    var x = r * 65536 + g * 256 + b;
    if (x === POW2_23) return null;
    return (x < POW2_23 ? x : x - POW2_24) * U;
  }

  /* ---------- 1地点の標高 ---------- */

  // 精度の高いデータソースから順に試し、最初に得られた値を返す
  function getElevation(lat, lng) {
    var i = 0;
    function tryNext() {
      if (i >= SOURCES.length) return Promise.resolve({ elevation: null, source: null });
      var src = SOURCES[i++];
      var t = latLngToTilePixel(lat, lng, src.z);
      return loadTile(src.id, src.z, t.tx, t.ty).then(function (imageData) {
        if (!imageData) return tryNext();
        var h = pixelToElevation(imageData.data, (t.py * 256 + t.px) * 4);
        if (h === null) return tryNext();
        return { elevation: h, source: src.name };
      });
    }
    return tryNext();
  }

  /* ---------- 複数地点の標高(断面図で使う) ---------- */

  // 同じタイルを何度も読まないよう、キャッシュ任せで順に処理する
  function getElevations(coords, onProgress) {
    var results = [];
    var idx = 0;
    function step() {
      if (idx >= coords.length) return Promise.resolve(results);
      var c = coords[idx];
      return getElevation(c[0], c[1]).then(function (r) {
        results.push(r);
        idx++;
        if (onProgress) onProgress(idx, coords.length);
        return step();
      });
    }
    return step();
  }

  /* ---------- 折れ線に沿って等間隔の点を作る ---------- */

  function haversine(a, b) {
    var R = 6371000;
    var toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
    var la1 = toRad(a[0]), la2 = toRad(b[0]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // 折れ線をn等分した地点の座標と、始点からの累積距離を返す
  function sampleAlongPath(pts, n) {
    if (pts.length < 2) return [];
    var segLens = [], total = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = haversine(pts[i - 1], pts[i]);
      segLens.push(d);
      total += d;
    }
    var out = [];
    for (var k = 0; k < n; k++) {
      var target = total * k / (n - 1);
      var acc = 0, si = 0;
      while (si < segLens.length - 1 && acc + segLens[si] < target) {
        acc += segLens[si];
        si++;
      }
      var t = segLens[si] > 0 ? (target - acc) / segLens[si] : 0;
      var a = pts[si], b = pts[si + 1];
      out.push({
        lat: a[0] + (b[0] - a[0]) * t,
        lng: a[1] + (b[1] - a[1]) * t,
        dist: target,
      });
    }
    return out;
  }

  global.Elevation = {
    getElevation: getElevation,
    getElevations: getElevations,
    sampleAlongPath: sampleAlongPath,
    latLngToTilePixel: latLngToTilePixel,
    pixelToElevation: pixelToElevation,
    SOURCES: SOURCES,
  };
})(this);
