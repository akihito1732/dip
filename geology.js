/* ============================================================
   geology.js — シームレス地質図V2 の凡例検索と、地点の地質取得

   凡例:
     geology-legend.json(産総研の legend.tsv を変換して同梱)を使う。
     全2398件、表示色はすべて一意。オフラインでも検索できる。

   地点の地質:
     1) 産総研の凡例取得API(緯度経度指定)を呼ぶ
     2) 通信できない等で失敗したら、地質図タイル(地質レイヤーのみ)の
        画素の色を読み、同梱凡例の色と照合して推定する
     2398件の表示色はすべて一意なので、色から凡例を一意に特定できる。
     ただし地質境界付近は色がにじむことがあるため「推定」として扱う。

   出典: 産総研地質調査総合センター「20万分の1日本シームレス地質図V2」
   ============================================================ */
(function (global) {
  'use strict';

  var LEGEND_URL = 'geology-legend.json';
  var API_POINT = 'https://gbank.gsj.jp/seamless/v2/api/1.3.1/legend.json?point=';
  // タイルは {z}/{y}/{x} の順。layer=g で地質の塗りだけ(境界線・記号なし)を取る
  var TILE_URL = 'https://gbank.gsj.jp/seamless/v2/api/1.3.1/tiles/';
  var TILE_Z = 13;             // 地質レイヤーの最大ズーム
  var API_TIMEOUT = 6000;      // ms

  var legend = null;           // [{symbol,color,age,group,lithology,_norm}]
  var bySymbol = {};
  var byColor = {};
  var loading = null;

  /* ---------- 凡例の読み込み ---------- */

  function normalize(t) {
    return String(t || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u3041-\u3096]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); });
  }

  function load() {
    if (legend) return Promise.resolve(legend);
    if (loading) return loading;
    loading = fetch(LEGEND_URL)
      .then(function (r) { if (!r.ok) throw new Error('legend ' + r.status); return r.json(); })
      .then(function (json) {
        legend = json.data.map(function (d) {
          var e = { symbol: d[0], color: '#' + d[1], age: d[2], group: d[3], lithology: d[4] };
          e._norm = normalize(e.symbol + ' ' + e.age + ' ' + e.group + ' ' + e.lithology);
          bySymbol[e.symbol] = e;
          byColor[d[1]] = e;
          return e;
        });
        return legend;
      })
      .catch(function (err) { loading = null; throw err; });
    return loading;
  }

  /* ---------- 検索 ---------- */

  // スペース区切りのAND検索。group を指定するとその大区分に絞る。
  function search(query, group) {
    if (!legend) return [];
    var terms = normalize(query).split(/\s+/).filter(Boolean);
    return legend.filter(function (e) {
      if (group && e.group !== group) return false;
      return terms.every(function (w) { return e._norm.indexOf(w) !== -1; });
    });
  }

  function groups() {
    if (!legend) return [];
    var seen = {}, out = [];
    legend.forEach(function (e) { if (!seen[e.group]) { seen[e.group] = 1; out.push(e.group); } });
    return out;
  }

  /* ---------- 地点の地質 ---------- */

  function fromEntry(e, source, estimated) {
    return {
      symbol: e.symbol, lithology: e.lithology, age: e.age, group: e.group,
      color: e.color, source: source, estimated: !!estimated,
    };
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); },
                   function (e) { clearTimeout(t); reject(e); });
    });
  }

  // 1) API
  function viaApi(lat, lng) {
    return withTimeout(fetch(API_POINT + lat.toFixed(6) + ',' + lng.toFixed(6)), API_TIMEOUT)
      .then(function (r) { if (!r.ok) throw new Error('api ' + r.status); return r.json(); })
      .then(function (j) {
        // 凡例が無い場所(海域など)は空のオブジェクトが返る
        if (!j || !j.symbol) return { none: true, source: 'api' };
        var e = bySymbol[j.symbol];
        if (e) return fromEntry(e, 'api', false);
        // 同梱凡例に無い記号(凡例の更新など)はAPIの値をそのまま使う
        return {
          symbol: j.symbol, lithology: j.lithology_ja || '', age: j.formationAge_ja || '',
          group: j.group_ja || '',
          color: '#' + [j.r, j.g, j.b].map(function (v) { return ('0' + (v | 0).toString(16)).slice(-2); }).join(''),
          source: 'api', estimated: false,
        };
      });
  }

  // 2) タイルの色から推定
  function tilePixel(lat, lng, z) {
    var n = Math.pow(2, z);
    var latRad = lat * Math.PI / 180;
    var xw = (lng + 180) / 360 * n;
    var yw = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    var tx = Math.floor(xw), ty = Math.floor(yw);
    return { tx: tx, ty: ty,
             px: Math.min(255, Math.floor((xw - tx) * 256)),
             py: Math.min(255, Math.floor((yw - ty) * 256)) };
  }

  function loadTileData(z, x, y) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = 256; cv.height = 256;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, 256, 256).data);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { reject(new Error('tile')); };
      img.src = TILE_URL + z + '/' + y + '/' + x + '.png?layer=g';
    });
  }

  function hex(r, g, b) {
    return ('0' + r.toString(16)).slice(-2) + ('0' + g.toString(16)).slice(-2) + ('0' + b.toString(16)).slice(-2);
  }

  function viaTile(lat, lng) {
    var t = tilePixel(lat, lng, TILE_Z);
    return loadTileData(TILE_Z, t.tx, t.ty).then(function (data) {
      function at(px, py) {
        if (px < 0 || py < 0 || px > 255 || py > 255) return null;
        var i = (py * 256 + px) * 4;
        if (data[i + 3] < 250) return null;           // 透明=地質図の範囲外
        return hex(data[i], data[i + 1], data[i + 2]);
      }
      // まず中心の画素がそのまま凡例色と一致するか
      var c = at(t.px, t.py);
      if (c && byColor[c]) return fromEntry(byColor[c], 'tile', false);
      if (c === null) return { none: true, source: 'tile' };

      // 境界のにじみ対策:周囲の画素で最も多い凡例色を採用し「推定」とする
      var votes = {};
      for (var dy = -3; dy <= 3; dy++) {
        for (var dx = -3; dx <= 3; dx++) {
          var k = at(t.px + dx, t.py + dy);
          if (k && byColor[k]) votes[k] = (votes[k] || 0) + 1;
        }
      }
      var best = null, bestN = 0;
      Object.keys(votes).forEach(function (k) { if (votes[k] > bestN) { best = k; bestN = votes[k]; } });
      if (best) return fromEntry(byColor[best], 'tile', true);
      return null;
    });
  }

  // 公開する取得関数:APIを優先し、失敗したらタイルで推定
  function getAt(lat, lng) {
    return load().then(function () {
      return viaApi(lat, lng).catch(function () {
        return viaTile(lat, lng).catch(function () { return null; });
      });
    });
  }

  // 1行の表示用
  function describe(g) {
    if (!g) return '';
    if (g.none) return '地質図の範囲外';
    return g.lithology + (g.estimated ? '(推定)' : '');
  }

  global.Geology = {
    load: load, search: search, groups: groups, getAt: getAt, describe: describe,
    // テスト・内部用
    _viaApi: viaApi, _viaTile: viaTile, _bySymbol: function () { return bySymbol; },
    _byColor: function () { return byColor; }, _tilePixel: tilePixel,
  };
})(this);
