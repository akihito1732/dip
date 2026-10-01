/* ============================================================
   weather.js — 気象庁の雨雲の動き・キキクル・ひまわり画像

   いずれも気象庁ホームページ(防災情報)の表示用タイルを利用する。
   公式のAPIとして公開されているものではなく、URL構造は予告なく
   変わる可能性がある。利用は公共データ利用規約(第1.0版)に準拠し、
   出典を明記する。ズームの都合で拡大表示する(加工する)ため、
   その旨も表示する。

   時刻の扱い:
     時刻一覧(targetTimes)の basetime / validtime はUTCの
     "YYYYMMDDhhmmss"。validtime > basetime のものは予測。
   ============================================================ */
(function (global) {
  'use strict';

  var JMA = 'https://www.jma.go.jp/bosai/';

  /* 各レイヤーの定義
     times   … 時刻一覧のURL(複数あれば結合する)
     element … 時刻一覧の elements に含まれている必要がある要素名(nullなら不問)
     url     … フレームとタイル座標からURLを作る
     zooms   … 実際にタイルが提供されているズームレベル
     maxAge  … 実況として遡る範囲(分) */
  var SOURCES = {
    nowc: {
      label: '雨雲の動き',
      times: [JMA + 'jmatile/data/nowc/targetTimes_N1.json',
              JMA + 'jmatile/data/nowc/targetTimes_N2.json'],
      element: 'hrpns',
      url: function (f, z, x, y) {
        return JMA + 'jmatile/data/nowc/' + f.basetime + '/none/' + f.validtime +
               '/surf/hrpns/' + z + '/' + x + '/' + y + '.png';
      },
      zooms: [4, 6, 8, 10],       // 偶数ズームのみ提供されている
      maxAge: 180,
    },
    rain: riskSource('大雨キキクル', 'rain_mesh'),   // 2026年5月29日の見直しで追加
    land: riskSource('土砂キキクル', 'land'),
    inund: riskSource('浸水キキクル', 'inund'),
    flood: riskSource('洪水キキクル', 'flood_mesh'),
    himawari: {
      label: '気象衛星ひまわり(赤外)',
      times: [JMA + 'himawari/data/satimg/targetTimes_jp.json'],
      element: null,
      url: function (f, z, x, y) {
        return JMA + 'himawari/data/satimg/' + f.basetime + '/jp/' + f.validtime +
               '/B13/TBB/' + z + '/' + x + '/' + y + '.jpg';
      },
      zooms: [3, 4, 5, 6],
      maxAge: 180,
      thin: 4,                    // 2.5分毎で多すぎるので10分毎に間引く
    },
  };

  function riskSource(label, element) {
    return {
      label: label,
      times: [JMA + 'jmatile/data/risk/targetTimes.json'],
      element: element,
      url: function (f, z, x, y) {
        return JMA + 'jmatile/data/risk/' + f.basetime + '/' + (f.member || 'none') + '/' +
               f.validtime + '/surf/' + element + '/' + z + '/' + x + '/' + y + '.png';
      },
      zooms: [4, 6, 8, 10],
      maxAge: 180,
    };
  }

  /* ---------- 時刻 ---------- */

  function parseUTC(s) {
    return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
                    +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14) || 0);
  }

  // 日本時間の「HH:MM」
  function jstLabel(s) {
    var d = new Date(parseUTC(s) + 9 * 3600 * 1000);
    return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }

  /* 時刻一覧を整えてフレームの配列にする
     - 必要な要素を含むものだけ残す
     - 同じ validtime が複数あれば、最も新しい basetime のものを使う
     - 古すぎる実況は落とし、時刻順に並べる */
  function buildFrames(entries, src) {
    var byValid = {};
    entries.forEach(function (e) {
      if (!e || !e.basetime || !e.validtime) return;
      if (src.element && e.elements && e.elements.indexOf(src.element) === -1) return;
      var cur = byValid[e.validtime];
      if (!cur || e.basetime > cur.basetime) byValid[e.validtime] = e;
    });
    var frames = Object.keys(byValid).sort().map(function (v) {
      var e = byValid[v];
      return { basetime: e.basetime, validtime: e.validtime, member: e.member || 'none',
               forecast: e.validtime > e.basetime, t: parseUTC(e.validtime) };
    });
    if (!frames.length) return frames;

    // 実況の最新時刻を基準に、それより maxAge 分より古いものは除く
    var obs = frames.filter(function (f) { return !f.forecast; });
    var latestObs = obs.length ? obs[obs.length - 1].t : frames[0].t;
    var cutoff = latestObs - (src.maxAge || 180) * 60000;
    frames = frames.filter(function (f) { return f.t >= cutoff; });

    // 間引き(最新の実況は必ず残す)
    if (src.thin > 1) {
      var lastObsIdx = -1;
      frames.forEach(function (f, i) { if (!f.forecast) lastObsIdx = i; });
      frames = frames.filter(function (f, i) {
        return f.forecast || i === lastObsIdx || (lastObsIdx - i) % src.thin === 0;
      });
    }
    return frames;
  }

  function fetchJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }

  function loadFrames(key) {
    var src = SOURCES[key];
    return Promise.all(src.times.map(function (u) {
      return fetchJSON(u).catch(function () { return []; });
    })).then(function (lists) {
      var all = [].concat.apply([], lists);
      if (!all.length) throw new Error('no times');
      return buildFrames(all, src);
    });
  }

  // 最新の実況フレームの位置
  function latestObservedIndex(frames) {
    for (var i = frames.length - 1; i >= 0; i--) if (!frames[i].forecast) return i;
    return frames.length - 1;
  }

  // 目標時刻に最も近いフレーム(他のレイヤーを主レイヤーの時刻に合わせるため)
  function nearestFrame(frames, t) {
    var best = null, bestD = Infinity;
    frames.forEach(function (f) {
      var d = Math.abs(f.t - t);
      if (d < bestD) { best = f; bestD = d; }
    });
    return best;
  }

  /* ---------- タイルの描画 ----------
     提供されていないズームでは、提供されている一段低いズームのタイルを
     切り出して拡大する。画素を読むわけではないので crossOrigin は付けない
     (付けるとCORS非対応の配信では読み込みに失敗するため)。 */

  function nativeZoomFor(z, zooms) {
    var nz = null;
    zooms.forEach(function (v) { if (v <= z) nz = v; });
    return nz;   // null なら表示しない(提供範囲より広域)
  }

  // 表示タイル(z,x,y)を描くのに必要な元タイルと切り出し範囲
  function sourceTileFor(z, x, y, zooms) {
    var nz = nativeZoomFor(z, zooms);
    if (nz === null) return null;
    var s = Math.pow(2, z - nz);
    var px = Math.floor(x / s), py = Math.floor(y / s);
    var size = 256 / s;
    return { z: nz, x: px, y: py, sx: (x - px * s) * size, sy: (y - py * s) * size, size: size };
  }

  function createLayer(key, opts) {
    var src = SOURCES[key];
    var imgCache = {};
    var cacheKeys = [];

    function loadImage(url) {
      if (imgCache[url]) return imgCache[url];
      var p = new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = url;
      });
      imgCache[url] = p;
      cacheKeys.push(url);
      if (cacheKeys.length > 300) delete imgCache[cacheKeys.shift()];
      return p;
    }

    var Layer = L.GridLayer.extend({
      frame: null,
      setFrame: function (f) {
        if (this.frame && f && this.frame.validtime === f.validtime && this.frame.basetime === f.basetime) return;
        this.frame = f;
        if (this._map) this.redraw();
      },
      createTile: function (coords, done) {
        var tile = document.createElement('canvas');
        tile.width = 256; tile.height = 256;
        var f = this.frame;
        var st = f && sourceTileFor(coords.z, coords.x, coords.y, src.zooms);
        if (!st) { setTimeout(function () { done(null, tile); }, 0); return tile; }
        loadImage(src.url(f, st.z, st.x, st.y)).then(function (img) {
          var ctx = tile.getContext && tile.getContext('2d');
          if (img && ctx) {
            ctx.imageSmoothingEnabled = key === 'himawari';   // 雨量・危険度は格子をくっきり
            ctx.drawImage(img, st.sx, st.sy, st.size, st.size, 0, 0, 256, 256);
          }
          done(null, tile);
        });
        return tile;
      },
    });
    return new Layer(opts || {});
  }

  global.Weather = {
    SOURCES: SOURCES,
    loadFrames: loadFrames,
    createLayer: createLayer,
    jstLabel: jstLabel,
    latestObservedIndex: latestObservedIndex,
    nearestFrame: nearestFrame,
    // テスト用
    _buildFrames: buildFrames, _sourceTileFor: sourceTileFor, _parseUTC: parseUTC,
  };
})(this);
