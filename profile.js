/* ============================================================
   profile.js — 標高断面図の描画

   elevation.js が集めた標高の並びを、SVGの断面図として描く。
   縦横比(垂直誇張)を変えられるので、緩やかな地形の起伏も
   はっきり見られるようにしてある。
   ============================================================ */
(function (global) {
  'use strict';

  var BASE_COLORS = {
    ink: '#eae7de',
    dim: '#9aa0ac',
    line: '#333a46',
    fill: 'rgba(47,111,224,.22)',
    stroke: '#2f6fe0',
    marker: '#d92b3a',
    bg: '#1c2027',
  };

  // 軸の目盛りをきりのいい間隔で刻む
  function niceStep(range, targetCount) {
    var raw = range / Math.max(1, targetCount);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 2.5) step = 2.5;
    else if (norm <= 5) step = 5;
    else step = 10;
    return step * mag;
  }

  function fmtDistance(m) {
    if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1) + 'km';
    return Math.round(m) + 'm';
  }

  /* 断面図を描く。
     samples: [{dist, elevation}] — distは始点からの水平距離(m)
     opts: { width, height, exaggeration, vertexDists }
       exaggeration … 垂直誇張(1で等倍)
       vertexDists  … 折れ線の頂点の位置(m)。縦の目印を出す */
  function render(samples, opts) {
    opts = opts || {};
    // 表示モード(ライト/ダーク)に合わせて色を差し替えられるようにする
    var COLORS = Object.assign({}, BASE_COLORS, opts.colors || {});
    var W = opts.width || 640;
    var H = opts.height || 260;
    var ex = opts.exaggeration || 1;
    var pad = { l: 52, r: 14, t: 22, b: 34 };
    var plotW = W - pad.l - pad.r;
    var plotH = H - pad.t - pad.b;

    var valid = samples.filter(function (s) { return s.elevation != null; });
    if (valid.length < 2) {
      return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
        '<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" fill="' + COLORS.dim +
        '" font-size="12" font-family="sans-serif">標高データが取得できませんでした</text></svg>';
    }

    var totalDist = samples[samples.length - 1].dist;
    var minE = Math.min.apply(null, valid.map(function (s) { return s.elevation; }));
    var maxE = Math.max.apply(null, valid.map(function (s) { return s.elevation; }));

    // 垂直誇張は「縦の縮尺 ÷ 横の縮尺」。ex=1 なら実際の地形と同じ比率で描く。
    // ex を上げるほど縦に引き伸ばされ、緩やかな起伏も見やすくなる。
    var elevRange = Math.max(0.5, maxE - minE);
    var naturalRange = totalDist * (plotH / plotW);   // 等倍(1:1)で画面に収まる標高幅
    var shownRange, center = (minE + maxE) / 2;

    if (ex === 'fit') {
      // 「自動」: 標高差がちょうど収まる倍率にする
      shownRange = elevRange * 1.18;
    } else {
      shownRange = naturalRange / ex;
    }
    var yMin = center - shownRange / 2;
    var yMax = center + shownRange / 2;

    // 実際に適用された誇張率(自動のときに何倍相当かを示すため)
    var actualEx = naturalRange / shownRange;

    var sx = function (d) { return pad.l + (d / totalDist) * plotW; };
    var sy = function (e) { return pad.t + (1 - (e - yMin) / (yMax - yMin)) * plotH; };

    var parts = [];
    parts.push('<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H +
               '" font-family="system-ui, sans-serif">');
    parts.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + COLORS.bg + '"/>');
    // 誇張率を上げると断面が枠外へはみ出すので、描画領域で切り取る
    var clipId = 'plot' + Math.random().toString(36).slice(2, 8);
    parts.push('<defs><clipPath id="' + clipId + '"><rect x="' + pad.l + '" y="' + pad.t +
               '" width="' + plotW + '" height="' + plotH + '"/></clipPath></defs>');

    // 横の目盛り(標高)
    var yStep = niceStep(yMax - yMin, 5);
    for (var e = Math.ceil(yMin / yStep) * yStep; e <= yMax; e += yStep) {
      var y = sy(e);
      parts.push('<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (W - pad.r) +
                 '" y2="' + y.toFixed(1) + '" stroke="' + COLORS.line + '" stroke-width="1"/>');
      parts.push('<text x="' + (pad.l - 6) + '" y="' + (y + 3.5).toFixed(1) +
                 '" text-anchor="end" fill="' + COLORS.dim + '" font-size="10">' +
                 Math.round(e) + '</text>');
    }

    // 縦の目盛り(距離)
    var xStep = niceStep(totalDist, 5);
    for (var d = 0; d <= totalDist + 0.001; d += xStep) {
      var x = sx(d);
      parts.push('<line x1="' + x.toFixed(1) + '" y1="' + pad.t + '" x2="' + x.toFixed(1) +
                 '" y2="' + (H - pad.b) + '" stroke="' + COLORS.line + '" stroke-width="1"/>');
      parts.push('<text x="' + x.toFixed(1) + '" y="' + (H - pad.b + 14) +
                 '" text-anchor="middle" fill="' + COLORS.dim + '" font-size="10">' +
                 fmtDistance(d) + '</text>');
    }

    // 断面の塗りと線(欠測は線を切らずに前後をつなぐ)
    var pts = valid.map(function (s) { return sx(s.dist).toFixed(1) + ',' + sy(s.elevation).toFixed(1); });
    parts.push('<g clip-path="url(#' + clipId + ')">');
    parts.push('<polygon points="' + sx(valid[0].dist).toFixed(1) + ',' + (H - pad.b) + ' ' +
               pts.join(' ') + ' ' + sx(valid[valid.length - 1].dist).toFixed(1) + ',' + (H - pad.b) +
               '" fill="' + COLORS.fill + '"/>');
    parts.push('<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + COLORS.stroke +
               '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
    parts.push('</g>');

    // 折れ線の頂点の位置に目印
    (opts.vertexDists || []).forEach(function (vd, i) {
      if (vd <= 0 || vd >= totalDist) return;
      var x = sx(vd);
      parts.push('<line x1="' + x.toFixed(1) + '" y1="' + pad.t + '" x2="' + x.toFixed(1) +
                 '" y2="' + (H - pad.b) + '" stroke="' + COLORS.marker +
                 '" stroke-width="1" stroke-dasharray="3,3" opacity="0.75"/>');
    });

    // 軸
    parts.push('<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + (H - pad.b) +
               '" stroke="' + COLORS.dim + '" stroke-width="1"/>');
    parts.push('<line x1="' + pad.l + '" y1="' + (H - pad.b) + '" x2="' + (W - pad.r) +
               '" y2="' + (H - pad.b) + '" stroke="' + COLORS.dim + '" stroke-width="1"/>');
    parts.push('<text x="4" y="' + (pad.t - 4) + '" fill="' + COLORS.dim + '" font-size="9">標高(m)</text>');

    parts.push('<text x="' + (W - pad.r) + '" y="' + (pad.t + 8) + '" text-anchor="end" fill="' +
               COLORS.dim + '" font-size="9">垂直誇張 ×' +
               (actualEx >= 10 ? Math.round(actualEx) : actualEx.toFixed(1)) + '</text>');

    parts.push('</svg>');
    return parts.join('');
  }

  // 断面の統計(最高・最低・標高差・登り下りの累計)
  function stats(samples) {
    var valid = samples.filter(function (s) { return s.elevation != null; });
    if (!valid.length) return null;
    var es = valid.map(function (s) { return s.elevation; });
    var up = 0, down = 0;
    for (var i = 1; i < valid.length; i++) {
      var d = valid[i].elevation - valid[i - 1].elevation;
      if (d > 0) up += d; else down -= d;
    }
    return {
      min: Math.min.apply(null, es),
      max: Math.max.apply(null, es),
      diff: Math.max.apply(null, es) - Math.min.apply(null, es),
      start: valid[0].elevation,
      end: valid[valid.length - 1].elevation,
      up: up, down: down,
      count: valid.length, total: samples.length,
    };
  }

  // CSVで書き出す
  function toCSV(samples) {
    var head = '\uFEFF距離(m),緯度,経度,標高(m)\r\n';
    return head + samples.map(function (s) {
      return [s.dist.toFixed(1), s.lat.toFixed(6), s.lng.toFixed(6),
              s.elevation != null ? s.elevation.toFixed(2) : ''].join(',');
    }).join('\r\n');
  }

  global.Profile = { render: render, stats: stats, toCSV: toCSV, niceStep: niceStep };
})(this);
