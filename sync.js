/* =========================================================================
   sync.js — イベント単位の同期と共有(Firebase Authentication + Cloud Firestore)

   ・ログインは任意。ログインしなくても dip はこれまで通り端末の中だけで動く
   ・「同期する」をオンにしたイベントだけがクラウドに上がる
   ・同期中のイベントは、ログインした自分の他の端末と、招待したメンバーに共有される
   ・ポイントの編集・削除は記録した本人だけ。イベントの変更・招待・メンバーを外すのは作成者だけ
     (同じ制限を firestore.rules でも掛けている)
   ・Firestore の端末内キャッシュを使うので、圏外で記録しても電波が戻れば自動で送られる

   index.html(通常のスクリプト)の変数・関数を直接使う。
   Firebase の読み込みに失敗しても(初回をオフラインで開いた場合など)、地図や記録は普通に使える。
   ========================================================================= */

const FIREBASE_VERSION = '13.0.0';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;

const firebaseConfig = {
  apiKey: 'AIzaSyBUgEJuTATyhclImX70b5i5vC16wQe4zzU',
  authDomain: 'dio-sync.firebaseapp.com',
  projectId: 'dio-sync',
  storageBucket: 'dio-sync.firebasestorage.app',
  messagingSenderId: '977109200700',
  appId: '1:977109200700:web:25b7bdd8e0f1478aad7839'
};

const INVITE_DAYS = 7;
const STATE_KEY = 'dg_sync';

let F = null;          // 読み込んだ Firebase の関数
let auth = null, db = null;
let user = null;
let status = 'loading';   // loading | unavailable | signedOut | ready | error
let lastError = '';
let pendingWrites = 0;
let unsubEvents = null;
const unsubPoints = new Map();   // イベントID → 購読の解除関数
let pushTimer = null;
let pendingJoin = null;

/* --- 送信済みの記録(どの版をどこに送ったか)。再読み込みしても二重に送らないために保存する --- */
const S = (()=>{
  let s = null;
  try{ s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); }catch(e){}
  return Object.assign({ uid:null, pushed:{}, pushedEv:{} }, s || {});
})();
function saveState(){
  try{ localStorage.setItem(STATE_KEY, JSON.stringify(S)); }catch(e){}
}

/* ---------------- 公開する窓口(index.html から使う) ---------------- */
const DipSync = {
  get status(){ return status; },
  uid: ()=>user ? user.uid : null,
  isSignedIn: ()=>!!user,
  // イベントの名前・色の変更や削除ができるか(同期していなければ常にできる)
  isOwner(ev){
    if(!ev || !ev.synced) return true;
    return !!user && ev.ownerId === user.uid;
  },
  // ポイントを編集・削除できるか(同期中のイベントでは記録した本人だけ)
  canEditPoint(p){
    if(!p) return false;
    const ev = findEvent(p.eventId);
    if(!ev || !ev.synced) return true;
    if(!p.authorId) return true;
    return !!user && p.authorId === user.uid;
  },
  signIn, signOut: doSignOut,
  enableSync, invite, leave, removeMember,
  schedulePush,
  renderSyncBar, renderEventSection,
};
window.DipSync = DipSync;

/* ---------------- 起動 ---------------- */
init();

async function init(){
  pendingJoin = new URLSearchParams(location.search).get('join');
  try{
    const [appMod, authMod, fsMod] = await Promise.all([
      import(FB_BASE + 'firebase-app.js'),
      import(FB_BASE + 'firebase-auth.js'),
      import(FB_BASE + 'firebase-firestore.js'),
    ]);
    F = Object.assign({}, appMod, authMod, fsMod);
  }catch(err){
    status = 'unavailable';
    refreshUI();
    if(pendingJoin) alert('招待を開くには通信が必要です。電波のある場所で、もう一度リンクを開いてください。');
    return;
  }

  const app = F.initializeApp(firebaseConfig);
  auth = F.getAuth(app);
  try{
    // 端末内キャッシュ:オフラインでも読み書きでき、電波が戻ると自動で送受信する
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
    });
  }catch(e){
    db = F.getFirestore(app);   // プライベートブラウズなどでキャッシュが使えない場合
  }

  status = 'signedOut';
  F.onAuthStateChanged(auth, u=>{
    user = u;
    if(u){
      status = 'ready';
      onSignedIn();
    } else {
      status = 'signedOut';
      stopListeners();
    }
    refreshUI();
    if(pendingJoin) handleJoin();
  });
  window.addEventListener('online', ()=>{ refreshUI(); schedulePush(); });
  window.addEventListener('offline', refreshUI);
}

function myName(){
  if(!user) return '';
  return (user.displayName || (user.email ? user.email.split('@')[0] : '') || 'メンバー').slice(0, 100);
}

/* ---------------- ログイン・ログアウト ---------------- */
async function signIn(){
  if(!F){ alert('同期機能を読み込めていません。通信できる状態で dip を開き直してください。'); return false; }
  try{
    await F.signInWithPopup(auth, new F.GoogleAuthProvider());
    return true;
  }catch(err){
    const code = err && err.code || '';
    if(code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false;
    if(code === 'auth/popup-blocked'){
      alert('ログイン画面がブロックされました。ブラウザの設定でポップアップを許可してから、もう一度お試しください。');
    } else if(code === 'auth/unauthorized-domain'){
      alert('このアドレスからはログインできない設定になっています。(Firebase の承認済みドメインを確認してください)');
    } else {
      alert('ログインできませんでした。\n' + (err && err.message ? err.message : code));
    }
    return false;
  }
}

async function doSignOut(){
  if(!F || !user) return;
  if(!confirm('ログアウトしますか?\n記録はこの端末に残ります。もう一度ログインすると同期が再開します。')) return;
  await F.signOut(auth);
}

function onSignedIn(){
  // 前回と別のアカウントでログインした場合、前のアカウントの同期イベントは切り離して端末に残す
  if(S.uid && S.uid !== user.uid){
    events.forEach(ev=>{
      if(ev.synced && !(ev.memberIds || []).includes(user.uid)) detachEventLocal(ev);
    });
    S.pushed = {}; S.pushedEv = {};
  }
  S.uid = user.uid;
  saveState();
  startListeners();
  schedulePush(0);
}

/* ---------------- 受信 ---------------- */
function startListeners(){
  stopListeners();
  const q = F.query(F.collection(db, 'events'), F.where('memberIds', 'array-contains', user.uid));
  unsubEvents = F.onSnapshot(q, snap=>{
    const seen = new Set();
    snap.docs.forEach(d=>{
      seen.add(d.id);
      applyRemoteEvent(d.id, d.data());
    });
    // サーバーの最新の結果で見えなくなったイベント = 自分が外された/抜けた → 端末に残して同期を止める
    if(!snap.metadata.fromCache){
      events.filter(ev=>ev.synced && !seen.has(ev.id)).forEach(ev=>{
        if(S.pushedEv[ev.id] != null) detachEventLocal(ev);   // まだ一度も送っていないものは作成中なので除く
      });
    }
    // ポイントの購読を、同期中のイベントに合わせる
    const want = new Set(events.filter(ev=>ev.synced).map(ev=>ev.id));
    want.forEach(id=>{ if(!unsubPoints.has(id)) watchPoints(id); });
    [...unsubPoints.keys()].forEach(id=>{ if(!want.has(id)){ unsubPoints.get(id)(); unsubPoints.delete(id); } });
    saveEvents(); savePoints(); saveState();
    rerender();
  }, err=>reportError(err));
}

function stopListeners(){
  if(unsubEvents){ unsubEvents(); unsubEvents = null; }
  unsubPoints.forEach(fn=>fn());
  unsubPoints.clear();
}

function watchPoints(evId){
  const unsub = F.onSnapshot(F.collection(db, 'events', evId, 'points'), snap=>{
    let changed = false;
    snap.docChanges().forEach(ch=>{
      if(ch.type === 'removed') return;
      if(applyRemotePoint(evId, ch.doc.id, ch.doc.data())) changed = true;
    });
    if(changed){ savePoints(); saveState(); rerender(); }
  }, err=>reportError(err));
  unsubPoints.set(evId, unsub);
}

function applyRemoteEvent(id, d){
  const local = findEvent(id);
  if(d.deleted){
    if(local){
      if(d.ownerId === user.uid) syncRemoveEventLocal(id);   // 自分が別の端末で削除した
      else detachEventLocal(local);                          // 作成者が削除した → 自分の端末には残す
    }
    S.pushedEv[id] = d.updatedAt;
    return;
  }
  // この端末で削除して、まだ送れていない
  const tomb = deletedEvents.find(t=>t.id === id);
  if(!local && tomb && tomb.updatedAt >= (d.updatedAt || 0)) return;

  if(!local){
    const ev = { id, name:d.name, color:d.color, shape:d.shape, kind:'point', updatedAt:d.updatedAt || 0 };
    setEventMeta(ev, d);
    events.push(ev);
    syncMarkClean('event', ev);
  } else {
    setEventMeta(local, d);
    const lastSeen = S.pushedEv[id];
    if((d.updatedAt || 0) > (lastSeen == null ? -1 : lastSeen) && (d.updatedAt || 0) >= (local.updatedAt || 0)){
      local.name = d.name; local.color = d.color; local.shape = d.shape;
      local.updatedAt = d.updatedAt;
      syncMarkClean('event', local);
      points.forEach(p=>{ if(p.eventId === id && p.marker) p.marker.setIcon(pointIcon(p)); });
    }
  }
  S.pushedEv[id] = Math.max(S.pushedEv[id] == null ? -1 : S.pushedEv[id], d.updatedAt || 0);
}

function setEventMeta(ev, d){
  ev.synced = true;
  ev.ownerId = d.ownerId;
  ev.memberIds = d.memberIds || [];
  ev.memberNames = d.memberNames || {};
}

// 戻り値:端末の記録を変えたら true
function applyRemotePoint(evId, id, d){
  const last = S.pushed[id];
  const lastU = last ? last.u : -1;
  const remoteU = d.updatedAt || 0;
  if(remoteU <= lastU) return false;   // 既に知っている版

  const local = points.find(p=>p.id === id);
  const mine = user && d.authorId === user.uid;
  // 自分の記録で、この端末にまだ送っていない新しい編集があれば、そちらを優先する
  if(mine && local && (local.updatedAt || 0) > remoteU){ return false; }
  const tomb = deletedPoints.find(t=>t.id === id);
  if(mine && tomb && tomb.updatedAt > remoteU) return false;

  S.pushed[id] = { u: remoteU, ev: evId };

  if(d.deleted){
    if(local) syncRemovePointLocal(id);
    return !!local;
  }

  const fields = {
    lat:d.lat, lng:d.lng, label:d.label || '', memo:d.memo || '',
    createdAt:d.createdAt || remoteU, updatedAt:remoteU,
    orientation:d.orientation || null,
    elevation:d.elevation != null ? d.elevation : null,
    elevationSource:d.elevationSource || null,
    gpsAltitude:d.gpsAltitude != null ? d.gpsAltitude : null,
    geology:d.geology || null,
    authorId:d.authorId || null, authorName:d.authorName || '',
    eventId:evId,
  };
  if(local){
    Object.assign(local, fields);
    syncMarkClean('point', local);
    if(local.marker){
      local.marker.setLatLng([local.lat, local.lng]);
      local.marker.setIcon(pointIcon(local));
      // 編集中のポップアップは書き換えない(閉じたあとに反映される)
      if(!local.marker.isPopupOpen()) local.marker.setPopupContent(buildPointPopup(local));
    }
  } else {
    deletedPoints = deletedPoints.filter(t=>t.id !== id);
    const p = Object.assign({ id }, fields);
    syncMarkClean('point', p);
    createPointMarker(p);
    points.push(p);
  }
  return true;
}

function detachEventLocal(ev){
  ev.synced = false;
  delete ev.ownerId; delete ev.memberIds; delete ev.memberNames;
  if(unsubPoints.has(ev.id)){ unsubPoints.get(ev.id)(); unsubPoints.delete(ev.id); }
  delete S.pushedEv[ev.id];
  syncMarkClean('event', ev);
}

/* ---------------- 送信 ---------------- */
function schedulePush(delay){
  if(!user || !db) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushAll, delay == null ? 800 : delay);
}

function syncedEventIds(){
  return new Set(events.filter(ev=>ev.synced).map(ev=>ev.id));
}

function pushAll(){
  if(!user || !db) return;
  const me = user.uid, name = myName();
  const syncedIds = syncedEventIds();
  let touchedLocal = false;

  // イベント(作成者のみ):名前・色・形
  events.forEach(ev=>{
    if(!ev.synced || ev.ownerId !== me) return;
    const sent = S.pushedEv[ev.id];
    if(sent != null && sent >= (ev.updatedAt || 0)) return;
    write(F.updateDoc(F.doc(db, 'events', ev.id), {
      name:ev.name, color:ev.color, shape:ev.shape, updatedAt:ev.updatedAt
    }));
    S.pushedEv[ev.id] = ev.updatedAt;
  });

  // 削除したイベント(作成者のみ)
  deletedEvents.forEach(t=>{
    if(!t.synced || t.ownerId !== me) return;
    const sent = S.pushedEv[t.id];
    if(sent != null && sent >= t.updatedAt) return;
    write(F.updateDoc(F.doc(db, 'events', t.id), { deleted:true, updatedAt:t.updatedAt }));
    S.pushedEv[t.id] = t.updatedAt;
  });

  // ポイント(自分が記録したものだけ)
  points.forEach(p=>{
    const last = S.pushed[p.id];
    const inSynced = syncedIds.has(p.eventId);
    if(p.authorId && p.authorId !== me) return;

    // 同期中のイベントから別のイベントへ移した:元の場所には削除として送る
    if(last && last.ev !== p.eventId && syncedIds.has(last.ev)){
      write(F.setDoc(F.doc(db, 'events', last.ev, 'points', p.id), tombstoneData(p, me, name)));
      delete S.pushed[p.id];
    }
    if(!inSynced) return;
    const cur = S.pushed[p.id];
    if(cur && cur.ev === p.eventId && cur.u >= (p.updatedAt || 0)) return;

    if(!p.authorId){
      p.authorId = me; p.authorName = name;
      syncMarkClean('point', p);
      touchedLocal = true;
    }
    write(F.setDoc(F.doc(db, 'events', p.eventId, 'points', p.id), pointData(p)));
    S.pushed[p.id] = { u:p.updatedAt, ev:p.eventId };
  });

  // 削除したポイント(中身は消して、削除の印だけ送る)
  deletedPoints.forEach(t=>{
    const last = S.pushed[t.id];
    if(!last || last.u >= t.updatedAt) return;          // 一度も送っていない、または送信済み
    if(!syncedIds.has(last.ev)) return;                  // イベントごと削除・同期停止したもの
    if(t.authorId && t.authorId !== me) return;
    write(F.setDoc(F.doc(db, 'events', last.ev, 'points', t.id),
                   tombstoneData({ id:t.id, createdAt:t.updatedAt, updatedAt:t.updatedAt }, me, name)));
    S.pushed[t.id] = { u:t.updatedAt, ev:last.ev };
  });

  saveState();
  if(touchedLocal) savePoints();
}

function pointData(p){
  // undefined を含むと Firestore が受け付けないので、JSON を通して取り除く
  return JSON.parse(JSON.stringify({
    lat:p.lat, lng:p.lng, label:p.label || '', memo:p.memo || '',
    createdAt:p.createdAt || p.updatedAt, updatedAt:p.updatedAt,
    orientation:p.orientation || null,
    elevation:p.elevation != null ? p.elevation : null,
    elevationSource:p.elevationSource || null,
    gpsAltitude:p.gpsAltitude != null ? p.gpsAltitude : null,
    geology:p.geology || null,
    authorId:p.authorId, authorName:p.authorName || '',
    deleted:false,
  }));
}
function tombstoneData(p, me, name){
  return {
    lat:0, lng:0, label:'', memo:'',
    createdAt:p.createdAt || p.updatedAt || Date.now(), updatedAt:p.updatedAt || Date.now(),
    orientation:null, elevation:null, elevationSource:null, gpsAltitude:null, geology:null,
    authorId:me, authorName:name, deleted:true,
  };
}

// 書き込みは待たずに進める(オフラインでも端末内に積まれ、電波が戻ると送られる)
function write(promise){
  pendingWrites++;
  refreshStatusText();
  promise.then(()=>{
    pendingWrites--; lastError = '';
    refreshStatusText();
  }).catch(err=>{
    pendingWrites--;
    reportError(err);
  });
}

function reportError(err){
  const code = err && err.code || '';
  lastError = code === 'permission-denied'
    ? '送信が拒否されました(権限がありません)'
    : '同期でエラーが起きました' + (code ? `(${code})` : '');
  console.warn('[dip sync]', err);
  refreshStatusText();
}

/* ---------------- イベントの同期・招待・参加・退出 ---------------- */
async function enableSync(evId){
  if(!user){ if(!(await signIn())) return; }
  const ev = findEvent(evId);
  if(!ev || ev.synced) return;
  if(!confirm(`「${ev.name}」を同期しますか?\n\nこのイベントとポイントがクラウドに保存され、ログインした他の端末にも表示されます。メンバーを招待すると、メンバーにも共有されます。`)) return;

  const me = user.uid, name = myName();
  // 他の人や他の端末のイベントとIDが重ならないよう、新しいIDに付け替える
  const newEvId = newId('ev');
  syncRekeyEvent(ev.id, newEvId);
  const now = Date.now();
  ev.synced = true;
  ev.ownerId = me;
  ev.memberIds = [me];
  ev.memberNames = { [me]: name };
  ev.updatedAt = now;
  syncMarkClean('event', ev);

  write(F.setDoc(F.doc(db, 'events', newEvId), {
    name:ev.name, color:ev.color, shape:ev.shape, kind:'point',
    ownerId:me, memberIds:[me], memberNames:{ [me]: name },
    createdAt:now, updatedAt:now, deleted:false,
  }));
  S.pushedEv[newEvId] = now;
  saveState();
  saveEvents(); savePoints();
  watchPoints(newEvId);
  pushAll();
  rerender();
}

async function invite(evId){
  const ev = findEvent(evId);
  if(!ev || !ev.synced || !user || ev.ownerId !== user.uid) return;
  if(!navigator.onLine){
    alert('招待リンクを作るには通信が必要です。電波のある場所でお試しください。');
    return;
  }
  const code = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  try{
    await F.setDoc(F.doc(db, 'invites', code), {
      eventId:ev.id, eventName:ev.name,
      createdBy:user.uid, createdByName:myName(),
      createdAt:F.Timestamp.now(),
      expiresAt:F.Timestamp.fromMillis(Date.now() + INVITE_DAYS * 86400000),
    });
  }catch(err){
    reportError(err);
    alert('招待リンクを作れませんでした。');
    return;
  }
  const url = location.origin + location.pathname + '?join=' + code;
  const text = `dip のイベント「${ev.name}」への招待です(${INVITE_DAYS}日間有効)`;
  if(navigator.share){
    try{ await navigator.share({ title:'dip への招待', text, url }); return; }
    catch(e){ if(e && e.name === 'AbortError') return; }
  }
  showInviteLink(url);
}

function showInviteLink(url){
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal">
      <div class="modal-title">招待リンク</div>
      <div class="modal-sub">このリンクをメンバーに送ってください(${INVITE_DAYS}日間有効)。</div>
      <input class="modal-select" id="invUrl" readonly>
      <div class="btn-row">
        <button class="btn btn-ghost modal-cancel" style="margin-top:0;">閉じる</button>
        <button class="btn btn-primary" id="invCopy">コピー</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const input = back.querySelector('#invUrl');
  input.value = url;
  const close = ()=>back.remove();
  back.addEventListener('click', e=>{ if(e.target === back) close(); });
  back.querySelector('.modal-cancel').addEventListener('click', close);
  back.querySelector('#invCopy').addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(url); }
    catch(e){ input.select(); document.execCommand && document.execCommand('copy'); }
    back.querySelector('#invCopy').textContent = 'コピーしました';
  });
}

function clearJoinParam(){
  pendingJoin = null;
  const u = new URL(location.href);
  u.searchParams.delete('join');
  window.history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
}

let joinBusy = false;
async function handleJoin(){
  if(joinBusy || !pendingJoin) return;
  const code = pendingJoin;
  if(!user){
    joinBusy = true;
    showJoinLogin(code);
    return;
  }
  joinBusy = true;
  try{
    let inv;
    try{
      const snap = await F.getDoc(F.doc(db, 'invites', code));
      inv = snap.exists() ? snap.data() : null;
    }catch(err){
      alert('招待を確認できませんでした。通信できる場所で、もう一度リンクを開いてください。');
      return;
    }
    if(!inv){ alert('この招待リンクは無効です。作成者に新しいリンクを送ってもらってください。'); clearJoinParam(); return; }
    const expires = inv.expiresAt && inv.expiresAt.toMillis ? inv.expiresAt.toMillis() : 0;
    if(expires < Date.now()){ alert('この招待リンクは期限切れです。作成者に新しいリンクを送ってもらってください。'); clearJoinParam(); return; }
    const existing = findEvent(inv.eventId);
    if(existing && existing.synced && (existing.memberIds || []).includes(user.uid)){
      alert(`「${inv.eventName}」には参加済みです。`);
      clearJoinParam(); return;
    }
    if(!confirm(`「${inv.eventName}」に参加しますか?\n招待した人: ${inv.createdByName || ''}\n\n参加すると、このイベントのポイントがメンバー全員に共有されます。`)){
      clearJoinParam(); return;
    }
    const me = user.uid;
    try{
      await F.updateDoc(F.doc(db, 'events', inv.eventId), {
        memberIds: F.arrayUnion(me),
        ['memberNames.' + me]: myName(),
        joinCode: code,
      });
    }catch(err){
      reportError(err);
      alert('参加できませんでした。リンクの期限が切れているか、イベントが削除された可能性があります。');
      clearJoinParam(); return;
    }
    clearJoinParam();
    alert(`「${inv.eventName}」に参加しました。ポイントタブのイベント一覧に表示されます。`);
  } finally {
    joinBusy = false;
  }
}

function showJoinLogin(code){
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal">
      <div class="modal-title">イベントへの招待</div>
      <div class="modal-sub">招待されたイベントに参加するには、Googleアカウントでログインしてください。</div>
      <div class="modal-note">ログインすると、参加したイベントのポイントがメンバー全員と共有されます。詳しくは「情報」のプライバシーポリシーをご覧ください。</div>
      <div class="btn-row">
        <button class="btn btn-ghost modal-cancel" style="margin-top:0;">参加しない</button>
        <button class="btn btn-primary" id="joinLogin">ログインして参加</button>
      </div>
    </div>`;
  document.body.appendChild(back);
  const close = ()=>{ back.remove(); joinBusy = false; };
  back.querySelector('.modal-cancel').addEventListener('click', ()=>{ close(); clearJoinParam(); });
  back.querySelector('#joinLogin').addEventListener('click', async ()=>{
    const ok = await signIn();
    close();
    if(ok) handleJoin();
  });
}

async function leave(evId){
  const ev = findEvent(evId);
  if(!ev || !ev.synced || !user || ev.ownerId === user.uid) return;
  if(!confirm(`「${ev.name}」から抜けますか?\n\nこれ以降は同期されなくなります。これまでのポイントはこの端末に残ります。`)) return;
  const me = user.uid;
  write(F.updateDoc(F.doc(db, 'events', evId), {
    memberIds: F.arrayRemove(me),
    ['memberNames.' + me]: F.deleteField(),
  }));
  detachEventLocal(ev);
  saveEvents(); saveState();
  rerender();
}

async function removeMember(evId, uid){
  const ev = findEvent(evId);
  if(!ev || !ev.synced || !user || ev.ownerId !== user.uid || uid === user.uid) return;
  const nm = (ev.memberNames || {})[uid] || 'このメンバー';
  if(!confirm(`${nm} さんをメンバーから外しますか?\n外した人の端末には、それまでのポイントが残ります。`)) return;
  write(F.updateDoc(F.doc(db, 'events', evId), {
    memberIds: F.arrayRemove(uid),
    ['memberNames.' + uid]: F.deleteField(),
  }));
  ev.memberIds = (ev.memberIds || []).filter(x=>x !== uid);
  if(ev.memberNames) delete ev.memberNames[uid];
  saveEvents();
  rerender();
}

/* ---------------- 画面 ---------------- */
function rerender(){
  try{ renderPointsView(); }catch(e){}
  try{ renderHistoryIfOpen(); }catch(e){}
}
function refreshUI(){ rerender(); }

function statusText(){
  if(lastError) return { cls:'err', text:lastError };
  if(!navigator.onLine) return { cls:'off', text:'オフライン(電波が戻ると自動で送受信します)' };
  if(pendingWrites > 0) return { cls:'busy', text:`送信中…(${pendingWrites}件)` };
  return { cls:'ok', text:'同期済み' };
}
function refreshStatusText(){
  const el = document.querySelector('.sync-status');
  if(!el) return;
  const s = statusText();
  el.className = 'sync-status ' + s.cls;
  el.textContent = s.text;
}

function renderSyncBar(el){
  if(!el) return;
  if(status === 'loading'){ el.innerHTML = ''; return; }
  if(status === 'unavailable'){
    el.innerHTML = `<div class="sync-bar"><div class="sync-text dim">同期機能を読み込めませんでした。通信できる状態で開き直すと使えます。</div></div>`;
    return;
  }
  if(!user){
    el.innerHTML = `
      <div class="sync-bar">
        <div class="sync-text">Googleでログインすると、イベントを他の端末と同期したり、メンバーと共有したりできます。</div>
        <button class="btn btn-ghost sync-btn" id="syncLogin">ログイン</button>
      </div>`;
    el.querySelector('#syncLogin').addEventListener('click', signIn);
    return;
  }
  const s = statusText();
  el.innerHTML = `
    <div class="sync-bar">
      <div class="sync-text">
        <div class="sync-user">${escapeHtml(myName())} でログイン中</div>
        <div class="sync-status ${s.cls}">${escapeHtml(s.text)}</div>
      </div>
      <button class="btn btn-ghost sync-btn" id="syncLogout">ログアウト</button>
    </div>`;
  el.querySelector('#syncLogout').addEventListener('click', doSignOut);
}

function renderEventSection(el, ev){
  if(!el || !ev) return;
  if(status === 'loading' || status === 'unavailable'){
    el.innerHTML = status === 'unavailable'
      ? '<div class="ev-sync"><div class="ev-sync-title">同期・共有</div><div class="ev-sync-note">同期機能を読み込めませんでした。通信できる状態で開き直すと使えます。</div></div>'
      : '';
    return;
  }
  if(!ev.synced){
    el.innerHTML = `
      <div class="ev-sync">
        <div class="ev-sync-title">同期・共有</div>
        <div class="ev-sync-note">このイベントは、この端末の中だけに保存されています。同期すると、ログインした他の端末にも表示され、メンバーを招待できるようになります。</div>
        <button class="btn btn-ghost ev-sync-btn" id="evSyncOn">${user ? 'このイベントを同期する' : 'ログインして同期する'}</button>
      </div>`;
    el.querySelector('#evSyncOn').addEventListener('click', ()=>enableSync(ev.id));
    return;
  }
  const me = user ? user.uid : null;
  const owner = ev.ownerId === me;
  const names = ev.memberNames || {};
  const members = (ev.memberIds || []).slice().sort((a, b)=>(a === ev.ownerId ? -1 : b === ev.ownerId ? 1 : 0));
  el.innerHTML = `
    <div class="ev-sync">
      <div class="ev-sync-title">同期・共有<span class="ev-sync-on">同期中</span></div>
      ${!user ? '<div class="ev-sync-note">ログアウト中のため、同期を止めています。</div>' : ''}
      <div class="ev-sync-note">${owner ? 'あなたが作成したイベントです。' : `作成者: ${escapeHtml(names[ev.ownerId] || '')} さん。名前や色の変更、招待は作成者だけができます。`}</div>
      <div class="ev-members">
        ${members.map(uid=>`
          <div class="ev-member">
            <span class="em-name">${escapeHtml(names[uid] || 'メンバー')}${uid === me ? '(あなた)' : ''}</span>
            ${uid === ev.ownerId ? '<span class="em-role">作成者</span>' : ''}
            ${owner && uid !== me ? `<button class="em-remove" data-remove="${escapeHtml(uid)}">外す</button>` : ''}
          </div>`).join('')}
      </div>
      ${owner && user ? `<button class="btn btn-primary ev-sync-btn" id="evInvite">メンバーを招待</button>
        <div class="ev-sync-note">招待リンクは${INVITE_DAYS}日間有効です。リンクを知っている人は誰でも参加できるので、送る相手に気をつけてください。</div>` : ''}
      ${!owner && user ? `<button class="btn btn-ghost ev-sync-btn" id="evLeave">このイベントから抜ける</button>` : ''}
    </div>`;
  const inv = el.querySelector('#evInvite');
  if(inv) inv.addEventListener('click', ()=>invite(ev.id));
  const lv = el.querySelector('#evLeave');
  if(lv) lv.addEventListener('click', ()=>leave(ev.id));
  el.querySelectorAll('[data-remove]').forEach(b=>{
    b.addEventListener('click', ()=>removeMember(ev.id, b.dataset.remove));
  });
}
