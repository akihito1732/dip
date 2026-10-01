/* ============================================================
   strikedip.js — 走向・傾斜の記法変換と記号の描画

   前提となる座標系:
     - 方位はいずれも「北を0°として時計回り360°」(スマホのコンパスと同じ)
     - 走向 = 傾斜方向 − 90°(右手系)
     - 記号は「走向が南北(画面上で垂直)・傾斜方向が東(短い線が右)」を基準とし、
       そこから時計回りに (傾斜方向 − 90°) 回転させる

   地図上には記号のみを描き、N30°W / 45°E などの文字は一覧側で表示する。
   ============================================================ */
(function (global) {
  'use strict';

  // 水平・垂直とみなすしきい値(センサーの誤差を吸収するため幅を持たせる)
  var FLAT_MAX = 2;    // これ未満は水平とみなす
  var VERTICAL_MIN = 88; // これを超えると垂直とみなす

  /* ---------- 計算 ---------- */

  // 傾斜方向から走向を求める(右手系:傾斜方向の90°反時計回り)
  function strikeFromDipDirection(dipDir) {
    return ((dipDir - 90) % 360 + 360) % 360;
  }

  // 記号の回転角(基準姿勢からの時計回り)
  function symbolRotation(dipDir) {
    return ((dipDir - 90) % 360 + 360) % 360;
  }

  // 走向を N__°E / N__°W / NS / EW で表記する
  function strikeNotation(strike) {
    var s = ((strike % 180) + 180) % 180; // 走向線は180°周期
    if (s < 0.5 || s > 179.5) return 'NS';
    if (Math.abs(s - 90) < 0.5) return 'EW';
    if (s < 90) return 'N' + Math.round(s) + '°E';
    return 'N' + Math.round(180 - s) + '°W';
  }

  // 傾斜している側を8方位で表す(各方位が45°ずつを受け持つ)
  var DIRS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function dipSide8(dipDir) {
    var d = ((dipDir % 360) + 360) % 360;
    var idx = Math.round(d / 45) % 8; // 22.5°ごとに区切られる
    return DIRS_8[idx];
  }

  // 傾斜の表記(例: 45°E)
  function dipNotation(dip, dipDir) {
    return Math.round(dip) + '°' + dipSide8(dipDir);
  }

  function isFlat(dip) { return dip < FLAT_MAX; }
  function isVertical(dip) { return dip > VERTICAL_MIN; }

  // 一覧などに出す1行の表記
  function describe(orientation) {
    if (!orientation) return '';
    if (isFlat(orientation.dip)) return '水平';
    var strike = strikeFromDipDirection(orientation.dipDirection);
    if (isVertical(orientation.dip)) return strikeNotation(strike) + ' / 垂直';
    return strikeNotation(strike) + ' / ' + dipNotation(orientation.dip, orientation.dipDirection);
  }

  /* ---------- 描画 ---------- */

  // 記号のSVG(文字は入れない)。sizeはビューボックスの一辺。
  function symbolSvg(orientation, color, size) {
    size = size || 44;
    color = color || '#14171c';
    var half = size / 2;
    var L = size * 0.34;   // 走向線の半長
    var T = size * 0.23;   // 傾斜ティックの長さ
    var W = Math.max(2.4, size * 0.058); // 線の太さ
    var open = '<svg width="' + size + '" height="' + size + '" viewBox="' +
      (-half) + ' ' + (-half) + ' ' + size + ' ' + size + '" style="overflow:visible;">';
    // 背景に薄い縁取りを入れて、地図の上でも輪郭が沈まないようにする
    var halo = 'stroke="#f4f1ea" stroke-width="' + (W + 2.6) + '" stroke-linecap="round"';
    var ink = 'stroke="' + color + '" stroke-width="' + W + '" stroke-linecap="round"';

    // 水平:十字(走向が定まらないので回転させない)
    if (isFlat(orientation.dip)) {
      var c = size * 0.30;
      return open +
        '<line x1="' + (-c) + '" y1="0" x2="' + c + '" y2="0" ' + halo + '/>' +
        '<line x1="0" y1="' + (-c) + '" x2="0" y2="' + c + '" ' + halo + '/>' +
        '<line x1="' + (-c) + '" y1="0" x2="' + c + '" y2="0" ' + ink + '/>' +
        '<line x1="0" y1="' + (-c) + '" x2="0" y2="' + c + '" ' + ink + '/>' +
        '</svg>';
    }

    var rot = symbolRotation(orientation.dipDirection);
    var g = '<g transform="rotate(' + rot.toFixed(1) + ')">';

    // 垂直:走向線の両側にティックを出す
    if (isVertical(orientation.dip)) {
      var lines =
        '<line x1="0" y1="' + (-L) + '" x2="0" y2="' + L + '" {S}/>' +
        '<line x1="' + (-T) + '" y1="0" x2="' + T + '" y2="0" {S}/>';
      return open + g +
        lines.replace(/\{S\}/g, halo) +
        lines.replace(/\{S\}/g, ink) +
        '</g></svg>';
    }

    // 通常:走向線 + 傾斜方向へのティック
    var normal =
      '<line x1="0" y1="' + (-L) + '" x2="0" y2="' + L + '" {S}/>' +
      '<line x1="0" y1="0" x2="' + T + '" y2="0" {S}/>';
    return open + g +
      normal.replace(/\{S\}/g, halo) +
      normal.replace(/\{S\}/g, ink) +
      '</g></svg>';
  }

  global.StrikeDip = {
    strikeFromDipDirection: strikeFromDipDirection,
    symbolRotation: symbolRotation,
    strikeNotation: strikeNotation,
    dipSide8: dipSide8,
    dipNotation: dipNotation,
    isFlat: isFlat,
    isVertical: isVertical,
    describe: describe,
    symbolSvg: symbolSvg,
  };
})(this);
