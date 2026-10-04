/* ============================================================
   info.js — 「情報」(利用規約・プライバシーポリシー・免責事項・データソース)
             と、位置情報の同意画面

   文面を直すときは、このファイルの PAGES の中だけを書き換えればよい。
   規約を大きく変えて利用者に同意し直してもらいたいときは、
   CONSENT_VERSION の日付を新しくする(次に開いたとき同意画面が再表示される)。
   ============================================================ */
(function (global) {
  'use strict';

  var OPERATOR = 'akihito1732';
  var CONTACT_URL = 'https://github.com/akihito1732/dip/issues';
  var ENACTED = '2026年10月4日';
  var CONSENT_KEY = 'dg_consent';
  var CONSENT_VERSION = '2026-10-04';

  function a(href, text) {
    return '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>';
  }

  /* ---------- 各ページの文面 ---------- */
  var PAGES = {
    terms: {
      label: '利用規約',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M6 2.8h8.5L19 7.3v13.9H6z"/><polyline points="14.5 2.8 14.5 7.3 19 7.3"/><line x1="9" y1="11.5" x2="16" y2="11.5"/><line x1="9" y1="15" x2="16" y2="15"/><line x1="9" y1="18.5" x2="13" y2="18.5"/></svg>',
      html: function () {
        return '' +
          '<p class="info-meta">制定日:' + ENACTED + '</p>' +
          '<h3>1. はじめに</h3>' +
          '<p>dip(以下「本アプリ」)は、' + OPERATOR + '(以下「運営者」)が個人で開発・提供する、防災と野外地質調査のための地図アプリです。本アプリを利用した時点で、本規約に同意したものとみなします。</p>' +
          '<h3>2. 利用料金</h3>' +
          '<p>本アプリは無料で利用できます。</p>' +
          '<h3>3. Google マップについて</h3>' +
          '<p>本アプリには Google マップの機能とコンテンツが含まれています。Google マップの機能とコンテンツの利用には、その時点で最新の' +
          a('https://maps.google.com/help/terms_maps.html', 'Google マップ/Google Earth 追加利用規約') + 'および' +
          a('https://policies.google.com/privacy', 'Google プライバシーポリシー') + 'が適用されます。</p>' +
          '<h3>4. 外部サービスの利用条件</h3>' +
          '<p>本アプリは、国土地理院、産業技術総合研究所、気象庁、国土交通省、OpenStreetMap などが提供する地図やデータを利用しています。これらの利用には、各提供元の利用条件も適用されます(「データソース」をご覧ください)。</p>' +
          '<h3>5. 禁止事項</h3>' +
          '<p>本アプリを通じて、地図やデータを大量に自動取得する行為、各提供元のサーバーに過度な負荷をかける行為、その他各提供元の利用条件に反する行為を禁止します。</p>' +
          '<h3>6. 提供の変更・終了</h3>' +
          '<p>運営者は、事前の予告なく本アプリの内容を変更し、または提供を終了することがあります。外部サービスの仕様変更や停止により、一部の機能が使えなくなることがあります。</p>' +
          '<h3>7. 規約の変更</h3>' +
          '<p>本規約は必要に応じて変更することがあります。変更後の規約は、本アプリ内に掲載した時点で効力を持ちます。</p>' +
          '<h3>8. お問い合わせ</h3>' +
          '<p>' + a(CONTACT_URL, 'GitHub の Issues') + 'からお寄せください。</p>';
      },
    },

    privacy: {
      label: 'プライバシーポリシー',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.8 4.5 5.8v5.6c0 4.6 3.1 8.4 7.5 9.8 4.4-1.4 7.5-5.2 7.5-9.8V5.8z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10.3 11V9.6a1.7 1.7 0 0 1 3.4 0V11"/></svg>',
      html: function () {
        var rows = [
          ['地図・重ねる情報の表示', '国土地理院、OpenStreetMap、OpenTopoMap、OpenStreetMap France、産総研、国土交通省、気象庁', '表示している範囲'],
          ['Google マップの表示', 'Google', '表示している範囲など(Google プライバシーポリシーが適用されます)'],
          ['ポイントの地質の取得', '産総研', 'ポイントの緯度経度'],
          ['ポイントの標高・断面図', '国土地理院', '該当する範囲'],
          ['場所の検索', 'OpenStreetMap(Nominatim)', '検索語、現在地周辺の範囲'],
          ['徒歩経路', 'OSRM', '現在地と目的地の緯度経度'],
          ['文字の表示', 'Google Fonts', 'フォントの取得のみ'],
        ];
        return '' +
          '<p class="info-meta">制定日:' + ENACTED + '</p>' +
          '<h3>1. 運営者はデータを集めません</h3>' +
          '<p>本アプリには、運営者がデータを受け取るためのサーバーがありません。アクセス解析や広告のための仕組みも使っていません。</p>' +
          '<h3>2. 端末の中だけに保存するもの</h3>' +
          '<p>次の情報は、お使いの端末(ブラウザ)の中だけに保存されます。</p>' +
          '<ul><li>ポイント(位置・ラベル・メモ・走向傾斜・標高・地質)</li>' +
          '<li>GPS記録、距離測定・同心円・検索の履歴</li>' +
          '<li>表示の設定(ライト/ダークモード、選んだ地図など)</li></ul>' +
          '<p>ブラウザのデータを消去したり、ホーム画面のアプリを削除したりすると、これらも消えます。大切な記録は「書き出し」機能で保存してください。</p>' +
          '<h3>3. 位置情報とセンサーの利用</h3>' +
          '<p>本アプリは、同意をいただいた場合に限り、端末の位置情報を取得します。位置情報は、現在地の表示・距離の測定・GPS記録・ポイントの記録に使います。また、方位・傾斜の測定やコンパス表示のために、端末の向きのセンサーを使います。センサーの値は外部に送信しません。</p>' +
          '<h3>4. 外部に送信される情報</h3>' +
          '<p>地図の表示や一部の機能では、その機能を提供する外部サービスに次の情報が送られます。このとき、お使いの端末のIPアドレスも各サービスに届きます。</p>' +
          '<div class="info-sends">' + rows.map(function (r) {
            return '<div class="info-send"><div class="is-func">' + r[0] + '</div>' +
              '<div class="is-row"><span class="k">送信先</span><span>' + r[1] + '</span></div>' +
              '<div class="is-row"><span class="k">情報</span><span>' + r[2] + '</span></div></div>';
          }).join('') + '</div>' +
          '<h3>5. 同意の取り消し</h3>' +
          '<p>位置情報の利用への同意は、下のボタンでいつでも取り消せます。端末の設定から位置情報の許可を外すこともできます。</p>' +
          '<div id="consentControl"></div>' +
          '<h3>6. ポリシーの変更</h3>' +
          '<p>本ポリシーは必要に応じて変更することがあります。</p>';
      },
    },

    disclaimer: {
      label: '免責事項',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.2"/><line x1="12" y1="10.8" x2="12" y2="16.8"/><circle cx="12" cy="7.6" r=".7" fill="currentColor"/></svg>',
      html: function () {
        return '' +
          '<h3>防災情報について</h3>' +
          '<p>本アプリが表示する防災・気象情報は参考情報です。避難などの判断は、必ず自治体の避難情報、気象庁の発表、自治体の公式ハザードマップをもとに行ってください。気象情報は気象庁ホームページの表示用データを利用しており、予告なく表示できなくなることがあります。緊急時に本アプリだけに頼らないでください。</p>' +
          '<h3>地図・データの精度について</h3>' +
          '<ul>' +
          '<li>地質図は20万分の1の縮尺で作られており、特定の地点の地質を保証するものではありません</li>' +
          '<li>標高(参考値)は国土地理院の標高データ、標高(測定値)は端末の測定値で、いずれも誤差を含みます</li>' +
          '<li>走向・傾斜は端末のセンサーによる参考値です。磁北を基準としており、偏角の補正はしていません</li>' +
          '<li>距離は2点間の直線距離です。徒歩経路は災害時の通行の安全を考慮していません</li>' +
          '<li>GPSの位置には、環境により数m〜数十mの誤差があります</li>' +
          '</ul>' +
          '<h3>記録の保存について</h3>' +
          '<p>記録は端末の中にのみ保存されます。端末やブラウザの操作・不具合により失われた記録について、運営者は責任を負いません。</p>' +
          '<h3>損害について</h3>' +
          '<p>本アプリの利用、または利用できなかったことにより生じた損害について、運営者は責任を負いません。</p>';
      },
    },

    sources: {
      label: 'データソース',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5.8" rx="7.5" ry="2.8"/><path d="M4.5 5.8v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/><path d="M4.5 11.8v6.2c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6.2"/></svg>',
      html: function () {
        function group(title, items) {
          return '<h3>' + title + '</h3><ul class="info-src">' + items.map(function (i) {
            return '<li>' + i + '</li>';
          }).join('') + '</ul>';
        }
        return '' +
          group('地図', [
            a('https://maps.gsi.go.jp/development/ichiran.html', '地理院地図(標準・淡色・写真・陰影起伏)') + '、' +
              a('https://maps.gsi.go.jp/development/demtile.html', '標高タイル') + ':国土地理院',
            a('https://www.openstreetmap.org/copyright', 'OpenStreetMap') + ':© OpenStreetMap contributors(ODbL)',
            a('https://opentopomap.org/about', 'OpenTopoMap') + ':© OpenStreetMap contributors、SRTM / 地図スタイル © OpenTopoMap(CC-BY-SA)',
            '人道支援スタイル:' + a('https://www.hotosm.org/', 'Humanitarian OpenStreetMap Team') + ' / 配信 ' + a('https://www.openstreetmap.fr/', 'OpenStreetMap France'),
            a('https://www.google.com/maps', 'Google マップ') + ':© Google',
          ]) +
          group('重ねる情報', [
            a('https://gbank.gsj.jp/seamless/', '20万分の1日本シームレス地質図V2') + '、凡例データ:産業技術総合研究所 地質調査総合センター',
            '洪水・津波・高潮浸水想定、土砂災害警戒区域:' + a('https://disaportal.gsi.go.jp/', 'ハザードマップポータルサイト') + '(国土交通省)',
            '雨雲の動き、キキクル、気象衛星画像:' + a('https://www.jma.go.jp/', '気象庁ホームページ') + '(拡大表示のため加工して表示)',
          ]) +
          group('機能', [
            '場所の検索:' + a('https://nominatim.org/', 'Nominatim') + '(© OpenStreetMap contributors)',
            '徒歩経路:' + a('https://project-osrm.org/', 'OSRM') + '(Project OSRM)',
          ]) +
          group('ソフトウェア', [
            a('https://leafletjs.com/', 'Leaflet') + '(BSD-2-Clause)',
            a('https://gitlab.com/IvanSanchez/Leaflet.GridLayer.GoogleMutant', 'Leaflet.GridLayer.GoogleMutant') + '(Beerware)',
            a('https://stuk.github.io/jszip/', 'JSZip') + '(MIT)',
            'フォント:' + a('https://fonts.google.com/', 'Zen Kaku Gothic New、JetBrains Mono、Noto Sans JP') + '(SIL Open Font License)',
          ]);
      },
    },
  };

  /* ---------- 見た目(このファイルだけで完結させるため、ここで差し込む) ---------- */
  var css = '' +
    '.info-doc{ font-size:12.5px; line-height:1.75; color:var(--ink); }' +
    '.info-doc h3{ font-size:13px; font-weight:800; margin:18px 0 6px; }' +
    '.info-doc h3:first-child, .info-doc .info-meta + h3{ margin-top:6px; }' +
    '.info-doc p{ margin:0 0 8px; }' +
    '.info-doc ul{ margin:0 0 8px; padding-left:1.3em; }' +
    '.info-doc li{ margin-bottom:4px; }' +
    '.info-doc a{ color:var(--teal); text-decoration:underline; text-underline-offset:2px; }' +
    '.info-meta{ font-size:11px; color:var(--ink-dim); }' +
    '.info-sends{ display:flex; flex-direction:column; gap:6px; margin:6px 0 10px; }' +
    '.info-send{ background:var(--panel-2); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }' +
    '.info-send .is-func{ font-weight:700; font-size:12px; margin-bottom:3px; }' +
    '.info-send .is-row{ display:flex; gap:8px; font-size:11.5px; line-height:1.55; }' +
    '.info-send .is-row .k{ flex:none; width:40px; color:var(--ink-dim); }' +
    '.info-consent-state{ font-size:12px; margin:4px 0 8px; }' +
    '.info-consent-btn{ width:100%; margin-bottom:10px; }' +
    '.consent-modal{ width:min(92vw, 420px); max-height:86vh; overflow-y:auto; padding:20px 18px 16px; }' +
    '.consent-title{ font-size:18px; font-weight:900; margin-bottom:10px; }' +
    '.consent-text{ font-size:13px; line-height:1.75; color:var(--ink); }' +
    '.consent-text p{ margin:0 0 10px; }' +
    '.consent-links{ display:flex; gap:8px; margin:4px 0 16px; }' +
    '.consent-links button{ flex:1; background:var(--panel-2); border:1px solid var(--line); color:var(--ink);' +
    '  border-radius:8px; padding:9px 6px; font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }' +
    '.consent-actions .btn{ width:100%; margin-bottom:8px; }' +
    '.consent-back{ background:none; border:none; color:var(--ink-dim); font-size:12px; padding:0 0 10px;' +
    '  cursor:pointer; font-family:inherit; }';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- 同意の記録 ---------- */
  var consent = {
    has: function () {
      try { return localStorage.getItem(CONSENT_KEY) === CONSENT_VERSION; } catch (e) { return false; }
    },
    grant: function () {
      try { localStorage.setItem(CONSENT_KEY, CONSENT_VERSION); } catch (e) {}
    },
    revoke: function () {
      try { localStorage.removeItem(CONSENT_KEY); } catch (e) {}
    },

    /* 同意画面を出す。opts.onAccept は「同意して始める」、opts.onDecline は「使わずに始める」 */
    show: function (opts) {
      opts = opts || {};
      if (document.querySelector('.consent-back-layer')) return;
      var back = document.createElement('div');
      back.className = 'modal-back consent-back-layer';
      back.style.zIndex = 3000;
      var box = document.createElement('div');
      box.className = 'modal consent-modal';
      back.appendChild(box);
      document.body.appendChild(back);

      function close() { back.remove(); }

      function showWelcome() {
        box.innerHTML = '' +
          '<div class="consent-title">dip へようこそ</div>' +
          '<div class="consent-text">' +
          '<p>dip は、防災と野外調査のための地図アプリです。</p>' +
          '<p>現在地の表示や距離の測定のために、端末の位置情報を使います。位置情報は端末の中だけに保存され、運営者には送られません。ただし、地図の表示や地質・経路の取得のために、表示範囲や一部の地点の情報が各データの提供元に送られます。</p>' +
          '<p>利用規約・プライバシーポリシーをご確認ください。</p>' +
          '</div>' +
          '<div class="consent-links">' +
          '<button data-doc="terms">利用規約</button>' +
          '<button data-doc="privacy">プライバシーポリシー</button>' +
          '</div>' +
          '<div class="consent-actions">' +
          '<button class="btn btn-primary" data-act="accept">同意して始める</button>' +
          '<button class="btn btn-ghost" data-act="decline">位置情報を使わずに始める</button>' +
          '</div>';
        box.scrollTop = 0;
        box.querySelectorAll('[data-doc]').forEach(function (b) {
          b.addEventListener('click', function () { showDoc(b.dataset.doc); });
        });
        box.querySelector('[data-act="accept"]').addEventListener('click', function () {
          consent.grant();
          close();
          if (opts.onAccept) opts.onAccept();
        });
        box.querySelector('[data-act="decline"]').addEventListener('click', function () {
          close();
          if (opts.onDecline) opts.onDecline();
        });
      }

      function showDoc(key) {
        box.innerHTML = '<button class="consent-back">‹ 戻る</button>' +
          '<div class="consent-title">' + PAGES[key].label + '</div>' +
          '<div class="info-doc">' + PAGES[key].html() + '</div>';
        // 同意画面の中では、同意の取り消しボタンは出さない
        var cc = box.querySelector('#consentControl');
        if (cc) cc.remove();
        box.scrollTop = 0;
        box.querySelector('.consent-back').addEventListener('click', showWelcome);
      }

      showWelcome();
    },
  };

  /* ---------- 「記録」ドロワーの中に表示する ----------
     drawerHead / historyPanel / closeDrawers / renderHistoryRoot などは index.html 側にある */
  function open(key) {
    histCat = null; histEventId = null; histLegend = 'info:' + key;   // 記録が変わっても描き直さない
    historyPanel.innerHTML = drawerHead(PAGES[key].label, '記録') +
      '<div class="info-doc">' + PAGES[key].html() + '</div>';
    historyPanel.scrollTop = 0;
    document.getElementById('histClose').addEventListener('click', closeDrawers);
    document.getElementById('histBack').addEventListener('click', renderHistoryRoot);
    if (key === 'privacy') renderConsentControl();
  }

  // プライバシーポリシー内の「同意を取り消す/同意する」ボタン
  function renderConsentControl() {
    var host = document.getElementById('consentControl');
    if (!host) return;
    var granted = consent.has();
    host.innerHTML = '<div class="info-consent-state">現在の状態:' +
      (granted ? '位置情報の利用に同意しています' : '位置情報を使っていません') + '</div>' +
      '<button class="btn btn-ghost info-consent-btn">' + (granted ? '同意を取り消す' : '同意して位置情報を使う') + '</button>';
    host.querySelector('button').addEventListener('click', function () {
      if (consent.has()) {
        if (!confirm('位置情報の利用への同意を取り消しますか?\n現在地の表示やGPS記録が使えなくなります。')) return;
        consent.revoke();
        if (Info.onRevoke) Info.onRevoke();
      } else {
        consent.grant();
        if (Info.onGrant) Info.onGrant();
      }
      renderConsentControl();
    });
  }

  var Info = {
    PAGES: PAGES,
    consent: consent,
    open: open,
    onRevoke: null,   // index.html 側で「位置情報を止める処理」を入れる
    onGrant: null,    // index.html 側で「位置情報を始める処理」を入れる
  };
  global.Info = Info;
})(this);
