// 運営の Web 画面（④運営の核）。素の JS・ビルドなし。docs/supabase-ikou.md 7章・13章、docs/screen-admin.md
// - ログインは Supabase Auth の Google ログイン（supabase-js）。運営の API（Edge Function admin）にアクセストークンを付けて呼ぶ
// - データは全部 API 経由。画面は DB を直接触らない
(function () {
  'use strict';
  var CFG = window.BEYOND_ADMIN;
  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  var S = { session: null, me: null, page: '', query: {} };
  var WD = ['月', '火', '水', '木', '金', '土', '日'];
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var app = $('#app');

  // ---------- 小物 ----------
  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function hm(min) { return min === null || min === undefined || min === '' ? '' : p2(Math.floor(min / 60)) + ':' + p2(min % 60); }
  function toMin(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function wdOf(ymd) { var p = ymd.split('-'); return WD[(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7]; }
  function fmtD(ymd) { if (!ymd) return ''; var p = ymd.split('-'); return (+p[1]) + '/' + (+p[2]) + '（' + wdOf(ymd) + '）'; }
  function fmtDT(iso) { if (!iso) return ''; var d = new Date(iso); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function addMonths(ym, n) { var p = ym.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1)); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1); }
  function addDays(ymd, n) { var p = ymd.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
  function lastDay(ym) { var p = ym.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function today() { return S.me ? S.me.today : new Date(Date.now() + 9 * 3600 * 1000).toISOString().substring(0, 10); }
  function teacherName(id) { var t = (S.me ? S.me.teachers : []).find(function (x) { return x.id === id; }); return t ? t.name : id; }
  function opts(list, cur, labelOf, valueOf, blank) {
    var h = blank !== undefined ? '<option value="">' + esc(blank) + '</option>' : '';
    list.forEach(function (x) { var v = valueOf ? valueOf(x) : x, l = labelOf ? labelOf(x) : x; h += '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>'; });
    return h;
  }
  function timeOptions(cur, step, from, to) {
    var h = '<option value="">--:--</option>';
    for (var m = from || 540; m <= (to || 1320); m += step || 15) h += '<option value="' + hm(m) + '"' + (hm(m) === cur ? ' selected' : '') + '>' + hm(m) + '</option>';
    return h;
  }
  function checks(name, list, cur, labelOf, valueOf) {
    return '<div class="checks">' + list.map(function (x) { var v = valueOf ? valueOf(x) : x, l = labelOf ? labelOf(x) : x; return '<label><input type="checkbox" name="' + esc(name) + '" value="' + esc(v) + '"' + ((cur || []).indexOf(v) >= 0 ? ' checked' : '') + '>' + esc(l) + '</label>'; }).join('') + '</div>';
  }
  function tags(list) { var color = { '同期待ち': 'yellow', '枠外': 'red', '休会中': 'orange', '退会': 'orange', '要望あり': 'blue', '回数戻し済': '', 'LINE未連携': '', '休会6か月超': 'orange' }; return (list || []).map(function (t) { return '<span class="tag ' + (color[t] || 'green') + '">' + esc(t) + '</span>'; }).join(''); }
  function toast(msg, kind) {
    var el = document.createElement('div'); el.className = 't' + (kind === 'err' ? ' err' : ''); el.textContent = msg;
    $('#toast').appendChild(el); setTimeout(function () { el.remove(); }, kind === 'err' ? 7000 : 3500);
  }
  function formData(form) {
    var o = {};
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') { if (!o[el.name] || !Array.isArray(o[el.name])) o[el.name] = []; if (el.checked) o[el.name].push(el.value); }
      else o[el.name] = el.value;
    });
    return o;
  }

  // ---------- API ----------
  function api(action, params) {
    if (!S.session) return Promise.resolve({ ok: false, code: 'auth', error: 'ログインしてください' });
    return fetch(CFG.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.session.access_token }, body: JSON.stringify({ action: action, params: params || {} }) })
      .then(function (r) { return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return { ok: false, error: '応答が読めません（HTTP ' + r.status + '）' }; } }); })
      .catch(function (e) { return { ok: false, error: '通信できません（' + e.message + '）' }; })
      .then(function (res) {
        if (res && res.code === 'auth') { S.me = null; render(); }
        return res;
      });
  }
  function busy(btn, on) { if (btn) { btn.disabled = on; btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = on ? '処理中…' : btn.dataset.label; } }

  // ---------- モーダル ----------
  function openModal(o) {
    var root = $('#modal-root');
    var bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal ' + (o.size || '') + '"><div class="mh"><span>' + esc(o.title) + '</span><button type="button" class="x" title="閉じる">×</button></div><div class="mb">' + o.body + '</div>' +
      '<div class="mf">' + (o.left ? '<div class="left">' + o.left + '</div>' : '') + (o.footer || '<button type="button" class="btn sub close">閉じる</button>') + '</div></div>';
    root.appendChild(bg);
    var close = function () { bg.remove(); };
    $('.x', bg).onclick = close;
    $$('.close', bg).forEach(function (b) { b.onclick = close; });
    bg.addEventListener('click', function (e) { if (e.target === bg && !o.sticky) close(); });
    if (o.onOpen) o.onOpen(bg, close);
    return { el: bg, close: close };
  }
  function confirmBox(title, text, okLabel, danger) {
    return new Promise(function (resolve) {
      var m = openModal({ title: title, size: 'narrow', sticky: true, body: '<div style="white-space:pre-wrap">' + esc(text) + '</div>',
        footer: '<button type="button" class="btn sub close">やめる</button><button type="button" class="btn ' + (danger ? 'danger' : '') + ' ok">' + esc(okLabel || 'OK') + '</button>',
        onOpen: function (bg, close) { $('.ok', bg).onclick = function () { close(); resolve(true); }; $$('.close, .x', bg).forEach(function (b) { b.addEventListener('click', function () { resolve(false); }); }); } });
    });
  }
  function promptBox(title, text, label) {
    return new Promise(function (resolve) {
      openModal({ title: title, size: 'narrow', sticky: true, body: '<div style="white-space:pre-wrap;margin-bottom:8px">' + esc(text) + '</div><div class="field"><label>' + esc(label) + '</label><input type="text" name="v" autofocus></div>',
        footer: '<button type="button" class="btn sub close">やめる</button><button type="button" class="btn ok">OK</button>',
        onOpen: function (bg, close) { $('.ok', bg).onclick = function () { var v = $('input[name=v]', bg).value; close(); resolve(v); }; $$('.close, .x', bg).forEach(function (b) { b.addEventListener('click', function () { resolve(null); }); }); } });
    });
  }
  function showMsg(bg, text, kind) { var m = $('.fmsg', bg); if (!m) { m = document.createElement('div'); m.className = 'fmsg'; $('.mb', bg).prepend(m); } m.innerHTML = text ? '<div class="msg ' + kind + '">' + esc(text) + '</div>' : ''; if (text) $('.mb', bg).scrollIntoView({ block: 'start' }); }

  // ---------- 枠組みとログイン ----------
  var PAGES = [['home', 'ホーム'], ['students', '生徒'], ['teachers', '先生'], ['shifts', 'シフト'], ['bookings', '予約'], ['results', '実績'], ['settings', '設定'], ['logs', 'ログ'], ['staff', 'スタッフ']];
  function shell(inner) {
    var nav = PAGES.map(function (p) { return '<a href="#' + p[0] + '" class="' + (S.page === p[0] ? 'on' : '') + '">' + p[1] + '</a>'; }).join('');
    app.innerHTML = '<div class="topbar"><div class="brand">' + esc(CFG.schoolName) + ' 予約管理' + (CFG.envLabel ? '<span class="env">' + esc(CFG.envLabel) + '</span>' : '') + '</div><nav>' + nav + '</nav>' +
      '<div class="who">' + esc(S.me.staff.name || S.me.staff.email) + ' <button type="button" id="logout">ログアウト</button></div></div><div class="page" id="view">' + inner + '</div>';
    $('#logout').onclick = function () { sb.auth.signOut(); };
    return $('#view');
  }
  function renderLogin(msg) {
    var dev = CFG.devLogin ? '<div class="card" style="text-align:left;margin-top:24px"><div class="muted small">開発用：メールとパスワードでログイン（本番にはありません）</div><div class="field"><label>メール</label><input type="email" id="dev-email"></div><div class="field"><label>パスワード</label><input type="password" id="dev-pass"></div><button type="button" class="btn sub" id="dev-login">ログイン</button></div>' : '';
    app.innerHTML = '<div class="login"><h1>' + esc(CFG.schoolName) + ' 予約管理</h1><div class="note">運営のスタッフの Google アカウントでログインしてください。</div>' + (msg ? '<div class="msg err">' + esc(msg) + '</div>' : '') +
      '<button type="button" class="btn google" id="login">Google でログイン</button>' + dev + '</div>';
    $('#login').onclick = function () { sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } } }); };
    if (CFG.devLogin) $('#dev-login').onclick = function () {
      sb.auth.signInWithPassword({ email: $('#dev-email').value, password: $('#dev-pass').value }).then(function (r) { if (r.error) toast(r.error.message, 'err'); });
    };
  }
  function boot() {
    var session = S.session;
    if (!session) { S.me = null; renderLogin(); return; }
    app.innerHTML = '<div class="loading">確認中…</div>';
    api('me').then(function (r) {
      if (!r.ok) { S.me = null; if (r.code === 'forbidden') { renderLogin(r.error); } else renderLogin(r.error); return; }
      S.me = r; render();
    });
  }
  sb.auth.onAuthStateChange(function (event, session) {
    var had = !!S.session, was = S.session && S.session.access_token;
    S.session = session;
    if (event === 'SIGNED_OUT') { S.me = null; renderLogin(); return; }
    if (!S.me || !had || (session && session.access_token !== was && !S.me)) boot();
  });
  sb.auth.getSession().then(function (r) { S.session = r.data.session; boot(); });
  window.addEventListener('hashchange', render);

  // ---------- ルーティング ----------
  function render() {
    if (!S.me) { if (S.session) boot(); else renderLogin(); return; }
    var h = location.hash.replace(/^#/, '') || 'home', q = {};
    var i = h.indexOf('?'); if (i >= 0) { h.substring(i + 1).split('&').forEach(function (kv) { var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); h = h.substring(0, i); }
    S.page = PAGES.some(function (p) { return p[0] === h; }) ? h : 'home'; S.query = q;
    ({ home: pageHome, students: pageStudents, teachers: pageTeachers, shifts: pageShifts, bookings: pageBookings, results: pageResults, settings: pageSettings, logs: pageLogs, staff: pageStaff })[S.page]();
  }

  // ---------- ホーム ----------
  function bookingTable(rows, o) {
    o = o || {};
    if (!rows.length) return '<div class="muted" style="padding:8px">' + esc(o.empty || '予約はありません') + '</div>';
    return '<table class="tbl"><thead><tr>' + (o.select ? '<th><input type="checkbox" id="selall" title="すべて選ぶ"></th>' : '') + '<th>予約ID</th><th>日付</th><th>時間</th><th>生徒</th><th>先生</th><th>店舗</th><th>コース</th><th>状態</th><th>経路</th><th>注意</th><th>要望メモ</th>' + (o.actions ? '<th></th>' : '') + '</tr></thead><tbody>' +
      rows.map(function (b) {
        return '<tr data-id="' + esc(b.id) + '" class="' + (b.state === '予約中' ? '' : 'dim') + '">' + (o.select ? '<td>' + (b.state === '予約中' || b.state === '期限後欠席' ? '<input type="checkbox" class="sel" value="' + esc(b.id) + '">' : '') + '</td>' : '') + '<td class="nowrap">' + esc(b.id) + '</td><td class="nowrap">' + fmtD(b.date) + '</td><td class="nowrap">' + hm(b.start) + '〜' + hm(b.end) + '</td>' +
          '<td class="nowrap"><a href="#students?id=' + esc(b.studentId) + '">' + esc(b.studentName) + '</a></td><td class="nowrap">' + esc(b.teacherName) + '</td><td>' + esc(b.store) + '</td><td class="nowrap">' + esc(b.course) + '</td>' +
          '<td class="nowrap state-' + esc(b.state) + '">' + esc(b.state) + (b.toId ? '<span class="muted small">→' + esc(b.toId) + '</span>' : '') + '</td><td class="nowrap">' + esc(b.route) + '</td><td>' + tags(b.attention) + '</td><td class="small">' + esc(b.memo) + '</td>' +
          (o.actions ? '<td class="actions">' + o.actions(b) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function pageHome() {
    var v = shell('<h2>ホーム <span class="sub">' + fmtD(today()) + '</span></h2><div class="loading">読み込み中…</div>');
    api('home').then(function (r) {
      if (!v.isConnected) return;   // 別の画面に移ったあとに届いた応答は捨てる
      if (!r.ok) { v.innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
      var sync = r.sync.pending ? '<div class="msg warn">カレンダーへの書き出しが <b>' + r.sync.pending + ' 件</b> 待ちです（2分おきに自動で再試行します）。 <button type="button" class="btn small sub" id="retry">今すぐ再試行</button>' +
        (r.sync.failing.length ? '<br>失敗が続いているもの：' + r.sync.failing.map(function (f) { return esc(f.bookingId) + '（' + esc(f.target) + '・' + f.attempts + '回）' + esc(f.error); }).join('／') : '') + '</div>' : '';
      var runs = (r.jobRuns || []).length ? '<table class="tbl"><thead><tr><th>日付</th><th>開始</th><th>終了</th><th>結果</th></tr></thead><tbody>' + r.jobRuns.map(function (j) { return '<tr><td class="nowrap">' + fmtD(j.date) + '</td><td class="nowrap">' + fmtDT(j.startedAt) + '</td><td class="nowrap">' + (j.finishedAt ? fmtDT(j.finishedAt) : '<span class="tag yellow">実行中</span>') + '</td><td class="small">' + esc(j.result) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="muted">まだ走っていません</div>';
      var outside = r.outsideCount ? '<div class="msg warn">先生の出勤時間の外に出ている予約が <b>' + r.outsideCount + ' 件</b> あります。<a href="#bookings">予約の画面</a>で「枠外」の印を確認してください。</div>' : '';
      var att = r.attention.length ? '<table class="tbl"><thead><tr><th>日時</th><th>処理</th><th>対象</th><th>内容</th></tr></thead><tbody>' + r.attention.map(function (a) { return '<tr><td class="nowrap">' + fmtDT(a.at) + '</td><td class="nowrap">' + esc(a.job) + '</td><td class="nowrap">' + esc(a.target) + '</td><td>' + esc(a.message) + '</td></tr>'; }).join('') + '</tbody></table>'
        : '<div class="muted">対応が要るものはありません</div>';
      v.innerHTML = '<h2>ホーム <span class="sub">' + fmtD(r.today) + '</span></h2>' + sync + outside +
        '<div class="card"><h3 style="margin-top:0">今日 ' + fmtD(r.today) + '（' + r.todayList.length + ' 件）</h3>' + bookingTable(r.todayList) + '</div>' +
        '<div class="card"><h3 style="margin-top:0">明日 ' + fmtD(r.tomorrow) + '（' + r.tomorrowList.length + ' 件）</h3>' + bookingTable(r.tomorrowList) + '</div>' +
        '<div class="card"><h3 style="margin-top:0">朝の確認（対応が要るもの。30日分） <a class="btn ghost small" href="#logs">すべてのログ</a></h3>' + att + '</div>' +
        '<div class="card"><h3 style="margin-top:0">日次処理の記録（リマインド・固定枠・月初の付与など。毎朝の送信時刻に自動で走ります）</h3>' + runs + '</div>';
      if ($('#retry')) $('#retry').onclick = function () { busy($('#retry'), true); api('sync.retry').then(function (x) { toast(x.ok ? x.message : x.error, x.ok ? '' : 'err'); pageHome(); }); };
    });
  }

  // ---------- 生徒 ----------
  function pageStudents() {
    var q = S.query;
    var v = shell('<h2>生徒 <span class="sub">名簿の登録・編集、LINE 連携、回数の調整</span></h2>' +
      '<div class="toolbar"><input type="search" id="q" placeholder="氏名・フリガナ・電話番号・生徒ID" value="' + esc(q.q || '') + '" style="width:260px">' +
      '<select id="status"><option value="">在籍状況：すべて</option>' + opts(['在籍', '休会', '退会'], q.status || '') + '</select>' +
      '<select id="store"><option value="">店舗：すべて</option>' + opts(S.me.stores.map(function (s) { return s.name; }), q.store || '') + '</select>' +
      '<button type="button" class="btn sub" id="search">検索</button><span class="grow"></span><button type="button" class="btn sub" id="xlsx">Excel に出す</button><button type="button" class="btn" id="new">＋ 新規登録</button></div><div id="list" class="loading">読み込み中…</div>');
    var last = [];
    var load = function () {
      var p = { q: $('#q').value.trim(), status: $('#status').value, store: $('#store').value };
      api('students.list', p).then(function (r) {
        if (!v.isConnected) return;
        if (!r.ok) { $('#list').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
        last = r.students;
        $('#list').innerHTML = r.students.length ? '<table class="tbl"><thead><tr><th>生徒ID</th><th>氏名</th><th>フリガナ</th><th>電話番号</th><th>店舗</th><th>コース</th><th>在籍</th><th>残り／先使い</th><th>固定枠</th><th>LINE</th><th>印</th></tr></thead><tbody>' +
          r.students.map(function (s) {
            return '<tr class="click ' + (s.status === '在籍' ? '' : 'dim') + '" data-id="' + esc(s.id) + '"><td>' + esc(s.id) + '</td><td class="nowrap">' + esc(s.family + ' ' + s.given) + '</td><td class="nowrap">' + esc(s.kana) + '</td><td class="nowrap">' + esc(s.phone) + '</td><td>' + esc(s.store) + '</td><td class="nowrap">' + esc(s.course) + '</td><td>' + esc(s.status) + '</td>' +
              '<td class="num">' + s.remaining + '／' + s.advance + '</td><td class="nowrap small">' + (s.fixedWeekday ? esc(s.fixedWeekday + ' ' + s.fixedStart + ' ' + teacherName(s.fixedTeacherId)) : '') + '</td><td class="small">' + (s.lineLinked ? '連携済 ' + esc(s.lineLinkedOn) : '<span class="muted">未連携</span>') + '</td><td>' + tags(s.flags) + '</td></tr>';
          }).join('') + '</tbody></table><div class="muted small" style="padding:6px">' + r.students.length + ' 人</div>' : '<div class="muted" style="padding:8px">該当する生徒がいません</div>';
        $$('tr.click', $('#list')).forEach(function (tr) { tr.onclick = function () { studentDialog(tr.dataset.id, load); }; });
      });
    };
    $('#search').onclick = load; $('#q').onkeydown = function (e) { if (e.key === 'Enter') load(); };
    $('#status').onchange = load; $('#store').onchange = load;
    $('#new').onclick = function () { studentDialog('', load); };
    $('#xlsx').onclick = function () {
      var head = ['生徒ID', '姓', '名', 'フリガナ', '電話番号', '店舗', 'コース', '月の回数', '使用教材', '英検取得級', '在籍状況', '申請日', '申請区分', '適用月', '在籍状況変更日', '入会日', '曜日NG', '希望時間帯', '希望の先生', '固定枠_曜日', '固定枠_時間', '固定枠_先生', '備考', '残り回数', '先使い回数', '回数付与済み月', 'LINE連携日'];
      var rows = last.map(function (s) { return [s.id, s.family, s.given, s.kana, s.phone, s.store, s.course, s.monthlyCount, s.textbook, s.eiken, s.status, s.requestDate, s.requestKind, s.applyMonth, s.statusChangedOn, s.joinedOn, s.ngWeekdays.join('、'), s.timebands.join('、'), s.preferredTeachers.map(teacherName).join('、'), s.fixedWeekday, s.fixedStart, s.fixedTeacherId ? teacherName(s.fixedTeacherId) : '', s.note, s.remaining, s.advance, s.grantedMonth, s.lineLinkedOn]; });
      xlsx('ビヨンド_名簿_' + today() + '.xlsx', [{ name: '名簿', rows: [['出力日時', fmtNow()], []].concat([head], rows) }], '名簿', rows.length, '');
    };
    load();
    if (q.id) studentDialog(q.id, load);
  }

  function studentDialog(id, onDone) {
    var me = S.me, tAct = me.teachers.filter(function (t) { return t.active; });
    var draw = function (data) {
      var s = data.student || { status: '在籍', eiken: '未取得', joinedOn: today(), ngWeekdays: [], timebands: [], preferredTeachers: [], monthlyCount: '' };
      var isNew = !id;
      var body = '<form class="form" id="sf">' +
        f('姓', '<input type="text" name="family" value="' + esc(s.family) + '" required>') + f('名', '<input type="text" name="given" value="' + esc(s.given) + '" required>') +
        f('フリガナ（姓名続けて）', '<input type="text" name="kana" value="' + esc(s.kana) + '"><div class="hint">ひらがな・半角カナはカタカナに直して保存します</div>') + f('電話番号', '<input type="text" name="phone" value="' + esc(s.phone) + '"><div class="hint">ハイフンなしで保存。兄弟で同じ番号も可</div>') +
        f('店舗', '<select name="store">' + opts(me.stores.filter(function (x) { return x.active || x.name === s.store; }).map(function (x) { return x.name; }), s.store, null, null, '選んでください') + '</select>') +
        f('コース', '<select name="course" id="course">' + opts(me.courses.filter(function (x) { return x.active || x.name === s.course; }), s.course, function (c) { return c.name; }, function (c) { return c.name; }, '選んでください') + '</select>') +
        f('月の回数', '<input type="number" name="monthlyCount" min="1" value="' + esc(s.monthlyCount) + '"><div class="hint">コースを選ぶと初期値が入ります</div>') + f('使用教材', '<input type="text" name="textbook" value="' + esc(s.textbook) + '">') +
        f('英検取得級', '<select name="eiken">' + opts(me.lists.eiken, s.eiken) + '</select>') + f('入会日', '<input type="date" name="joinedOn" value="' + esc(s.joinedOn) + '">') +
        f('在籍状況', isNew ? '<input type="text" value="在籍（新規は固定）" readonly><input type="hidden" name="status" value="在籍">' : '<select name="status" id="status">' + opts(['在籍', '休会', '退会'], s.status) + '</select><div class="hint">通常の休会・退会・復帰は下の「申請」に入れてください（適用月の1日に自動で切り替わります）</div>') +
        f('申請日／申請区分', '<div class="row"><input type="date" name="requestDate" id="requestDate" value="' + esc(s.requestDate) + '" style="width:160px"><select name="requestKind" id="requestKind" style="width:110px">' + opts(['休会', '退会', '復帰'], s.requestKind, null, null, '（なし）') + '</select></div>') +
        f('適用月', '<input type="month" name="applyMonth" id="applyMonth" value="' + esc(s.applyMonth) + '"><div class="hint" id="applyHint">休会・退会は申請日から自動計算（' + me.cutoffDay + '日まで→翌月、' + (me.cutoffDay + 1) + '日以降→翌々月）。復帰は手で入れます</div>') +
        '<div class="field full"><label>曜日NG</label>' + checks('ngWeekdays', me.lists.weekdays, s.ngWeekdays) + '</div>' +
        '<div class="field full"><label>希望時間帯</label>' + checks('timebands', me.lists.timebands, s.timebands) + '</div>' +
        '<div class="field full"><label>希望の先生</label>' + checks('preferredTeachers', tAct, s.preferredTeachers, function (t) { return t.name; }, function (t) { return t.id; }) + '</div>' +
        '<div class="field full"><label>固定枠（曜日・時間・先生の3つ全部か、全部空）</label><div class="row"><select name="fixedWeekday" style="width:90px">' + opts(me.lists.weekdays, s.fixedWeekday, null, null, '曜日') + '</select>' +
        '<select name="fixedStart" style="width:110px">' + timeOptions(s.fixedStart, me.stepMinutes) + '</select><select name="fixedTeacherId" style="width:160px">' + opts(tAct, s.fixedTeacherId, function (t) { return t.name; }, function (t) { return t.id; }, '先生') + '</select></div></div>' +
        '<div class="field full"><label>備考</label><textarea name="note">' + esc(s.note) + '</textarea></div></form>' +
        (isNew ? '' : '<div class="readonly-box" style="margin-top:10px"><span>生徒ID <b>' + esc(s.id) + '</b></span><span>残り回数 <b>' + s.remaining + '</b>／先使い <b>' + s.advance + '</b></span><span>回数付与済み月 <b>' + esc(s.grantedMonth) + '</b></span>' +
          '<span>LINE <b>' + (s.lineLinked ? '連携済み ' + esc(s.lineLinkedOn) : '未連携') + '</b></span><span>在籍状況変更日 <b>' + esc(s.statusChangedOn || '—') + '</b></span><span>今日以降の予約 <b>' + data.upcoming.length + ' 件</b></span><span>登録 <b>' + fmtDT(s.createdAt) + '</b></span><span>更新 <b>' + fmtDT(s.updatedAt) + '</b></span></div>' +
          '<details style="margin-top:10px"><summary class="muted small">回数の履歴（台帳。新しい順・50件まで）</summary><table class="tbl small"><thead><tr><th>日時</th><th>列</th><th>増減</th><th>理由</th><th>予約ID</th><th>備考</th><th>その後（残り／先使い）</th><th>操作者</th></tr></thead><tbody>' +
          data.ledger.map(function (l) { return '<tr><td class="nowrap">' + fmtDT(l.at) + '</td><td>' + esc(l.col) + '</td><td class="num">' + (l.delta > 0 ? '+' : '') + l.delta + '</td><td>' + esc(l.reason) + '</td><td>' + esc(l.bookingId) + '</td><td>' + esc(l.note) + '</td><td class="num">' + l.remainingAfter + '／' + l.advanceAfter + '</td><td class="small">' + esc(l.operator) + '</td></tr>'; }).join('') + '</tbody></table></details>');
      var m = openModal({ title: isNew ? '生徒の新規登録' : '生徒の編集　' + s.family + ' ' + s.given, body: body, sticky: true,
        left: isNew ? '' : '<button type="button" class="btn sub adjust">回数の調整</button>' + (s.lineLinked ? '<button type="button" class="btn sub unlink">LINE連携を解除</button>' : '') + '<a class="btn ghost" href="#bookings?studentId=' + esc(s.id) + '">予約を見る</a>',
        footer: '<button type="button" class="btn sub close">閉じる</button><button type="button" class="btn save">保存</button>',
        onOpen: function (bg, close) {
          var form = $('#sf', bg);
          $('#course', bg).onchange = function () { var c = me.courses.find(function (x) { return x.name === $('#course', bg).value; }); if (c && (isNew || !form.monthlyCount.value)) form.monthlyCount.value = c.monthlyCount; };
          var autoApply = function () {
            var d = $('#requestDate', bg).value, k = $('#requestKind', bg).value;
            if ((k === '休会' || k === '退会') && d) { var p = d.split('-'); var n = Number(p[2]) <= me.cutoffDay ? 1 : 2; $('#applyMonth', bg).value = addMonths(p[0] + '-' + p[1], n); }
            if (!k) $('#applyMonth', bg).value = '';
          };
          $('#requestDate', bg).onchange = autoApply; $('#requestKind', bg).onchange = autoApply;
          $('.save', bg).onclick = function () {
            var d = formData(form); if (!isNew) d.studentId = id;
            var go = function () {
              busy($('.save', bg), true);
              api('students.save', d).then(function (r) {
                busy($('.save', bg), false);
                if (!r.ok) { showMsg(bg, r.error, 'err'); return; }
                toast(r.message); if (r.warnings && r.warnings.length) showMsg(bg, r.warnings.join('\n'), 'warn');
                if (onDone) onDone();
                if (isNew || !(r.warnings && r.warnings.length)) close();
              });
            };
            if (!isNew && $('#status', bg) && $('#status', bg).value !== s.status) {
              confirmBox('在籍状況の手動切替', '申請を使わず今日付で「' + $('#status', bg).value + '」に切り替えます。通常の休会・退会・復帰は「申請日・申請区分」に入れてください。よろしいですか？', '切り替える').then(function (yes) { if (yes) go(); else $('#status', bg).value = s.status; });
            } else go();
          };
          if (!isNew) {
            $('.adjust', bg).onclick = function () { adjustDialog(s, function () { close(); studentDialog(id, onDone); }); };
            if ($('.unlink', bg)) $('.unlink', bg).onclick = function () {
              confirmBox('LINE連携を解除', s.family + ' ' + s.given + ' さんの LINE 連携を解除します。\n生徒さんは次回 LINE を開いたときに初回登録をやり直します。\n兄弟で同じ LINE を使っている他の行には影響しません。', '解除する', true).then(function (yes) {
                if (!yes) return;
                api('students.unlinkLine', { studentId: id }).then(function (r) { if (!r.ok) { showMsg(bg, r.error, 'err'); return; } toast(r.message); close(); studentDialog(id, onDone); });
              });
            };
          }
        } });
    };
    if (!id) draw({}); else api('students.get', { studentId: id }).then(function (r) { if (!r.ok) { toast(r.error, 'err'); return; } draw(r); });
    function f(label, input) { return '<div class="field"><label>' + esc(label) + '</label>' + input + '</div>'; }
  }
  function adjustDialog(s, onDone) {
    openModal({ title: '回数の調整（理由つき）', size: 'narrow', sticky: true,
      body: '<div class="muted small" style="margin-bottom:8px">' + esc(s.family + ' ' + s.given) + ' さん　いま：残り ' + s.remaining + '・先使い ' + s.advance + '。特例のときだけ使います。台帳に「調整」として残ります。</div>' +
        '<form id="af"><div class="field"><label>どちらを</label><select name="col"><option value="remaining">残り回数</option><option value="advance">先使い回数</option></select></div>' +
        '<div class="field"><label>増減（例：+1、-2）</label><input type="number" name="delta" value="1" step="1"></div><div class="field"><label>理由（必須）</label><input type="text" name="note"></div></form>',
      footer: '<button type="button" class="btn sub close">やめる</button><button type="button" class="btn save">調整する</button>',
      onOpen: function (bg, close) {
        $('.save', bg).onclick = function () {
          var d = formData($('#af', bg)); d.studentId = s.id; d.delta = Number(d.delta);
          busy($('.save', bg), true);
          api('students.adjustCount', d).then(function (r) { busy($('.save', bg), false); if (!r.ok) { showMsg(bg, r.error, 'err'); return; } toast(r.message); close(); if (onDone) onDone(); });
        };
      } });
  }

  // ---------- 先生 ----------
  function pageTeachers() {
    var v = shell('<h2>先生 <span class="sub">名前・担当店舗・対応コース・Google アカウント・カレンダー</span></h2>' +
      '<div class="toolbar"><span class="muted small">写真は先生の行を押して登録します（生徒の先生選択画面に出ます。なければ頭文字の丸）</span><span class="grow"></span><button type="button" class="btn sub" id="cal">カレンダーを作成・共有（未作成の先生）</button><button type="button" class="btn" id="new">＋ 新しい先生</button></div><div id="list"></div>');
    var draw = function () {
      $('#list').innerHTML = '<table class="tbl"><thead><tr><th></th><th>先生ID</th><th>名前</th><th>担当店舗</th><th>対応コース</th><th>Google アカウント</th><th>色</th><th>ひとこと</th><th>カレンダー</th><th>状態</th></tr></thead><tbody>' +
        S.me.teachers.map(function (t) {
          return '<tr class="click ' + (t.active ? '' : 'dim') + '" data-id="' + esc(t.id) + '"><td>' + thumb(t) + '</td><td>' + esc(t.id) + '</td><td class="nowrap">' + esc(t.name) + '</td><td>' + esc(t.stores.join('、')) + '</td><td>' + esc(t.courses.join('、')) + '</td><td class="small">' + esc(t.googleAccount) + '</td><td>' + esc(t.color) + '</td><td class="small">' + esc(t.message) + '</td>' +
            '<td>' + (t.hasCalendar ? '作成済' : '<span class="tag yellow">未作成</span>') + '</td><td>' + (t.active ? '有効' : '無効') + '</td></tr>';
        }).join('') + '</tbody></table>';
      $$('tr.click', $('#list')).forEach(function (tr) { tr.onclick = function () { teacherDialog(tr.dataset.id, reload); }; });
    };
    var reload = function () { api('me').then(function (r) { if (r.ok) { S.me = r; draw(); loadPhotos(draw); } }); };
    $('#new').onclick = function () { teacherDialog('', reload); };
    $('#cal').onclick = function () {
      var btn = $('#cal');
      confirmBox('カレンダーを作成・共有', 'カレンダーが未作成の有効な先生について、専用カレンダーを作ります。Google アカウントが入っている先生には、専用カレンダー（変更可）と担当店舗の全体カレンダー（閲覧）を共有します。\n共有した先生には Google から通知メールが届きます。', '実行する').then(function (yes) {
        if (!yes) return; busy(btn, true);
        api('teachers.calendars', {}).then(function (r) { busy(btn, false); if (!r.ok) { toast(r.error, 'err'); return; } toast(r.message + (r.notes.length ? '\n' + r.notes.join('\n') : '')); reload(); });
      });
    };
    draw(); loadPhotos(draw);
  }
  function thumb(t) { var u = S.photos && S.photos[t.id]; return u ? '<img class="thumb" src="' + esc(u) + '" alt="">' : '<span class="thumb">' + esc(String(t.name || '?').charAt(0)) + '</span>'; }
  function loadPhotos(then) { api('teachers.photos').then(function (r) { if (r.ok) { S.photos = r.photos || {}; if (then) then(); } }); }
  function teacherDialog(id, onDone) {
    var me = S.me, t = me.teachers.find(function (x) { return x.id === id; }) || { stores: [], courses: [], active: true, color: '' };
    openModal({ title: id ? '先生の編集　' + t.name : '新しい先生', sticky: true,
      body: '<form class="form" id="tf"><div class="field"><label>名前</label><input type="text" name="name" value="' + esc(t.name) + '"></div><div class="field"><label>カレンダー色</label><select name="color">' + opts(me.lists.colors, t.color, null, null, '（指定なし）') + '</select></div>' +
        '<div class="field full"><label>担当店舗</label>' + checks('stores', me.stores.map(function (s) { return s.name; }), t.stores) + '</div><div class="field full"><label>対応コース</label>' + checks('courses', me.courses.map(function (c) { return c.name; }), t.courses) + '</div>' +
        '<div class="field"><label>Google アカウント（カレンダーの共有先）</label><input type="email" name="googleAccount" value="' + esc(t.googleAccount) + '"><div class="hint">空欄なら共有しない</div></div><div class="field"><label>状態</label><select name="active"><option value="true"' + (t.active ? ' selected' : '') + '>有効</option><option value="false"' + (!t.active ? ' selected' : '') + '>無効</option></select><div class="hint">無効にすると予約画面・提案から外れます。カレンダーと過去の予約はそのまま</div></div>' +
        '<div class="field full"><label>ひとこと（生徒の先生選択画面に出ます）</label><input type="text" name="message" value="' + esc(t.message) + '"></div></form>' +
        (id ? '<div class="readonly-box" style="margin-top:10px"><span>先生ID <b>' + esc(t.id) + '</b></span><span>カレンダー <b>' + (t.hasCalendar ? '作成済' : '未作成') + '</b></span></div>' +
          '<h3>写真（生徒の先生選択画面に出ます）</h3><div class="photo-box"><div id="pv">' + thumb(t) + '</div><div><input type="file" id="pfile" accept="image/*"><div class="hint">選ぶと長辺 300px に縮めて登録します。正方形に近い写真がきれいに出ます</div>' + (S.photos && S.photos[t.id] ? '<button type="button" class="btn small danger" id="pdel" style="margin-top:6px">写真を消す</button>' : '') + '</div></div>' : ''),
      footer: '<button type="button" class="btn sub close">閉じる</button><button type="button" class="btn save">保存</button>',
      onOpen: function (bg, close) {
        if ($('#pfile', bg)) $('#pfile', bg).onchange = function () {
          var f = $('#pfile', bg).files[0]; if (!f) return;
          shrinkImage(f, 300).then(function (dataUrl) { return api('teachers.photo', { teacherId: id, dataUrl: dataUrl }); }).then(function (r) {
            if (!r.ok) { showMsg(bg, r.error, 'err'); return; } toast(r.message); S.photos = S.photos || {}; S.photos[id] = r.url; $('#pv', bg).innerHTML = thumb(t); if (onDone) onDone();
          }).catch(function (e) { showMsg(bg, '画像を読めませんでした（' + e.message + '）', 'err'); });
        };
        if ($('#pdel', bg)) $('#pdel', bg).onclick = function () { api('teachers.photo', { teacherId: id, remove: true }).then(function (r) { if (!r.ok) { showMsg(bg, r.error, 'err'); return; } toast(r.message); delete S.photos[id]; $('#pv', bg).innerHTML = thumb(t); $('#pdel', bg).remove(); if (onDone) onDone(); }); };
        $('.save', bg).onclick = function () {
          var d = formData($('#tf', bg)); if (id) d.teacherId = id; d.active = d.active === 'true';
          busy($('.save', bg), true);
          api('teachers.save', d).then(function (r) { busy($('.save', bg), false); if (!r.ok) { showMsg(bg, r.error, 'err'); return; } toast(r.message); close(); if (onDone) onDone(); });
        };
      } });
  }

  // ---------- シフト ----------
  function pageShifts() {
    var month = /^\d{4}-\d{2}$/.test(S.query.month || '') ? S.query.month : today().substring(0, 7);
    var v = shell('<h2>シフト <span class="sub">基本パターン（毎週）＋休み・臨時出勤（日付指定）。マスを押すと、その日の休み・臨時出勤を入れられます</span></h2>' +
      '<div class="toolbar"><button type="button" class="btn sub small" id="prev">‹ 前の月</button><b id="mlabel" style="font-size:16px"></b><button type="button" class="btn sub small" id="next">次の月 ›</button><span class="grow"></span>' +
      '<button type="button" class="btn sub" id="xlsx">Excel に出す</button><button type="button" class="btn sub" id="regen">枠を作り直す（復旧用）</button><button type="button" class="btn" id="newbase">＋ 基本パターンを足す</button></div>' +
      '<div class="legend"><span><i style="background:#fdecea"></i>休みが入っている日</span><span><i style="background:#e6f4ea"></i>臨時出勤の日</span><span><span class="bk">2</span> 予約中の件数</span></div><div id="grid" class="loading">読み込み中…</div><div id="below"></div>');
    var go = function (m) { location.hash = '#shifts?month=' + m; };
    $('#prev').onclick = function () { go(addMonths(month, -1)); }; $('#next').onclick = function () { go(addMonths(month, 1)); };
    $('#mlabel').textContent = month.substring(0, 4) + '年' + (+month.substring(5)) + '月';
    var load = function () {
      api('shifts.month', { month: month }).then(function (r) {
        if (!v.isConnected) return;
        if (!r.ok) { $('#grid').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
        var exByKey = {}; r.exceptions.forEach(function (e) { var k = e.teacherId + '|' + e.date; (exByKey[k] = exByKey[k] || []).push(e); });
        var head = '<tr><th class="tname">先生</th>' + r.days.map(function (d) { return '<th class="' + (d.weekday === '土' ? 'sat' : d.weekday === '日' ? 'sun' : '') + '">' + (+d.ymd.substring(8)) + '<br>' + d.weekday + '</th>'; }).join('') + '</tr>';
        var rows = r.teachers.map(function (t) {
          return '<tr><td class="tname">' + esc(t.name) + '</td>' + r.days.map(function (d) {
            var k = t.id + '|' + d.ymd, ivs = r.cells[k] || [], ex = exByKey[k] || [], n = r.bookingCount[k] || 0;
            var cls = 'cell' + (d.ymd < r.today ? ' past' : '') + (d.ymd === r.today ? ' today' : '') + (ex.some(function (e) { return e.kind === '休み'; }) ? ' off' : ex.some(function (e) { return e.kind === '臨時出勤'; }) ? ' extra' : '');
            return '<td class="' + cls + '" data-t="' + esc(t.id) + '" data-d="' + d.ymd + '">' + ivs.map(function (iv) { return '<span class="iv">' + hm(iv.start).replace(/^0/, '') + '-' + hm(iv.end).replace(/^0/, '') + '</span>'; }).join('') + (n ? '<span class="bk">' + n + '</span>' : '') + '</td>';
          }).join('') + '</tr>';
        }).join('');
        $('#grid').innerHTML = '<div class="shift-grid"><table><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
        $$('td.cell', $('#grid')).forEach(function (td) { td.onclick = function () { cellDialog(td.dataset.t, td.dataset.d, r, load); }; });
        var base = '<table class="tbl"><thead><tr><th>ID</th><th>先生</th><th>曜日</th><th>時間</th><th>店舗</th><th>適用開始</th><th>適用終了</th><th>備考</th><th></th></tr></thead><tbody>' + r.base.map(function (s) {
          return '<tr class="' + (s.errors.length ? '' : '') + '"><td>' + esc(s.id) + '</td><td class="nowrap">' + esc(teacherName(s.teacherId)) + '</td><td>' + esc(s.weekday) + '</td><td class="nowrap">' + esc(s.start + '〜' + s.end) + '</td><td>' + esc(s.store) + '</td><td class="nowrap">' + esc(s.validFrom) + '</td><td class="nowrap">' + esc(s.validTo) + '</td><td class="small">' + esc(s.note) + (s.errors.length ? '<div class="msg err small" style="margin:2px 0">' + esc(s.errors.join('／')) + '</div>' : '') + '</td>' +
            '<td class="actions"><button type="button" class="btn small sub edit" data-id="' + esc(s.id) + '">編集</button><button type="button" class="btn small danger del" data-id="' + esc(s.id) + '">削除</button></td></tr>';
        }).join('') + '</tbody></table>';
        var exc = r.exceptions.length ? '<table class="tbl"><thead><tr><th>ID</th><th>先生</th><th>種別</th><th>日付</th><th>時間</th><th>店舗</th><th>備考</th><th></th></tr></thead><tbody>' + r.exceptions.map(function (s) {
          return '<tr><td>' + esc(s.id) + '</td><td class="nowrap">' + esc(teacherName(s.teacherId)) + '</td><td>' + esc(s.kind) + '</td><td class="nowrap">' + fmtD(s.date) + '</td><td class="nowrap">' + (s.start ? esc(s.start + '〜' + s.end) : '終日') + '</td><td>' + esc(s.store) + '</td><td class="small">' + esc(s.note) + '</td>' +
            '<td class="actions"><button type="button" class="btn small sub edit" data-id="' + esc(s.id) + '">編集</button><button type="button" class="btn small danger del" data-id="' + esc(s.id) + '">削除</button></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="muted" style="padding:8px">この月の休み・臨時出勤はありません</div>';
        var outside = r.outside.length ? '<div class="msg warn">先生の出勤時間の外に出ている予約が ' + r.outside.length + ' 件あります（予約は残っています。振替の連絡をお願いします） <a class="btn small sub" href="#bookings?from=' + r.outside[0].date + '&to=' + r.outside[r.outside.length - 1].date + '&state=予約中&select=' + r.outside.map(function (b) { return b.id; }).join(',') + '">予約の画面で選んだ状態で開く</a></div>' + bookingTable(r.outside) : '';
        $('#xlsx').onclick = function () {
          var base = [['出力日時', fmtNow()], [], ['ID', '先生', '曜日', '開始', '終了', '店舗', '適用開始', '適用終了', '備考']].concat(r.base.map(function (x) { return [x.id, teacherName(x.teacherId), x.weekday, x.start, x.end, x.store, x.validFrom, x.validTo, x.note]; }));
          var exc = [['対象月', month], [], ['ID', '先生', '種別', '日付', '開始', '終了', '店舗', '備考']].concat(r.exceptions.map(function (x) { return [x.id, teacherName(x.teacherId), x.kind, x.date, x.start || '終日', x.end, x.store, x.note]; }));
          var grid = [['先生'].concat(r.days.map(function (d) { return (+d.ymd.substring(8)) + '（' + d.weekday + '）'; }))].concat(r.teachers.map(function (t) { return [t.name].concat(r.days.map(function (d) { return (r.cells[t.id + '|' + d.ymd] || []).map(function (iv) { return hm(iv.start) + '-' + hm(iv.end); }).join(' '); })); }));
          xlsx('ビヨンド_シフト_' + month + '.xlsx', [{ name: '一面表示', rows: [['対象月', month], ['出力日時', fmtNow()], []].concat(grid) }, { name: '基本パターン', rows: base }, { name: '休み・臨時出勤', rows: exc }], 'シフト', r.base.length + r.exceptions.length, month);
        };
        $('#below').innerHTML = outside + '<div class="grid2"><div class="card"><h3 style="margin-top:0">基本パターン（毎週）</h3>' + base + '</div><div class="card"><h3 style="margin-top:0">この月の休み・臨時出勤</h3>' + exc + '</div></div>';
        var all = r.base.concat(r.exceptions);
        $$('.edit', $('#below')).forEach(function (b) { b.onclick = function () { shiftDialog(all.find(function (s) { return s.id === b.dataset.id; }), load); }; });
        $$('.del', $('#below')).forEach(function (b) { b.onclick = function () {
          var s = all.find(function (x) { return x.id === b.dataset.id; });
          confirmBox('シフトの行を消す', s.id + '　' + teacherName(s.teacherId) + '先生　' + s.kind + '　' + (s.kind === '基本' ? s.weekday + '曜 ' : fmtD(s.date) + ' ') + (s.start ? s.start + '〜' + s.end : '終日') + '\n\n消すと、当月・翌月の枠を作り直します。予約は消えません。', '消す', true).then(function (yes) {
            if (!yes) return; api('shifts.delete', { shiftId: s.id }).then(function (r) { if (!r.ok) { toast(r.error, 'err'); return; } toast(r.message); load(); });
          });
        }; });
      });
    };
    $('#newbase').onclick = function () { shiftDialog({ kind: '基本', teacherId: '' }, load); };
    $('#regen').onclick = function () {
      confirmBox('枠を作り直す', '全員の当月・翌月の枠を、シフトから作り直します（何かおかしいときの復旧用。ふだんはシフトを保存するたびに自動で作り直されます）。予約は消えません。', '作り直す').then(function (yes) {
        if (!yes) return; api('slots.regenerate', {}).then(function (r) { if (!r.ok) { toast(r.error, 'err'); return; } toast(r.message); load(); });
      });
    };
    load();
  }
  function cellDialog(teacherId, date, r, onDone) {
    var ivs = r.cells[teacherId + '|' + date] || [], ex = r.exceptions.filter(function (e) { return e.teacherId === teacherId && e.date === date; });
    var m = openModal({ title: teacherName(teacherId) + '先生　' + fmtD(date), size: 'narrow',
      body: '<div class="avail"><b>出勤時間</b>：' + (ivs.length ? ivs.map(function (iv) { return hm(iv.start) + '〜' + hm(iv.end) + '（' + iv.store + '）'; }).join('、') : '<span class="muted">出勤なし</span>') + '<br><b>予約中</b>：' + (r.bookingCount[teacherId + '|' + date] || 0) + ' 件</div>' +
        (ex.length ? '<h3>この日の休み・臨時出勤</h3><table class="tbl"><tbody>' + ex.map(function (e) { return '<tr><td>' + esc(e.kind) + '</td><td>' + (e.start ? esc(e.start + '〜' + e.end) : '終日') + '</td><td>' + esc(e.store) + '</td><td class="small">' + esc(e.note) + '</td><td class="actions"><button type="button" class="btn small sub edit" data-id="' + esc(e.id) + '">編集</button></td></tr>'; }).join('') + '</tbody></table>' : '') +
        '<h3>この日に入れる</h3><div class="row"><button type="button" class="btn sub add" data-kind="休み">休み（終日）</button><button type="button" class="btn sub add" data-kind="休み時間">休み（時間を指定）</button><button type="button" class="btn sub add" data-kind="臨時出勤">臨時出勤</button></div>' +
        '<div class="muted small" style="margin-top:8px">休みを入れた時間に予約があれば、保存のあとに知らせます（予約は消えません）。</div>',
      onOpen: function (bg, close) {
        $$('.add', bg).forEach(function (b) { b.onclick = function () { close(); shiftDialog({ kind: b.dataset.kind === '臨時出勤' ? '臨時出勤' : '休み', teacherId: teacherId, date: date, allDay: b.dataset.kind === '休み' }, onDone); }; });
        $$('.edit', bg).forEach(function (b) { b.onclick = function () { close(); shiftDialog(ex.find(function (e) { return e.id === b.dataset.id; }), onDone); }; });
      } });
  }
  function shiftDialog(s, onDone) {
    var me = S.me, isNew = !s.id, tAct = me.teachers.filter(function (t) { return t.active || t.id === s.teacherId; });
    var kind = s.kind || '基本';
    openModal({ title: (isNew ? 'シフトを足す：' : 'シフトの編集：') + kind, size: 'narrow', sticky: true,
      body: '<form class="form" id="wf"><input type="hidden" name="kind" value="' + esc(kind) + '">' +
        '<div class="field full"><label>先生</label><select name="teacherId"' + (isNew ? '' : ' disabled') + '>' + opts(tAct, s.teacherId, function (t) { return t.name; }, function (t) { return t.id; }, '選んでください') + '</select></div>' +
        (kind === '基本' ? '<div class="field"><label>曜日</label><select name="weekday">' + opts(me.lists.weekdays, s.weekday, null, null, '選んでください') + '</select></div>' : '<div class="field"><label>日付</label><input type="date" name="date" value="' + esc(s.date) + '"></div>') +
        (kind === '休み' ? '<div class="field"><label>休みの範囲</label><select name="allDay" id="allDay"><option value="1"' + (s.allDay || (!isNew && !s.start) ? ' selected' : '') + '>終日</option><option value="0"' + (!(s.allDay || (!isNew && !s.start)) ? ' selected' : '') + '>時間を指定</option></select></div>' : '<div class="field"><label>店舗</label><select name="store">' + opts(me.stores.map(function (x) { return x.name; }), s.store, null, null, '選んでください') + '</select></div>') +
        '<div class="field" id="timeRow"><label>開始〜終了</label><div class="row"><select name="start" style="width:110px">' + timeOptions(s.start, me.stepMinutes, 480, 1380) + '</select>〜<select name="end" style="width:110px">' + timeOptions(s.end, me.stepMinutes, 480, 1380) + '</select></div></div>' +
        (kind === '基本' ? '<div class="field"><label>適用開始日（任意）</label><input type="date" name="validFrom" value="' + esc(s.validFrom) + '"><div class="hint">「来月からシフトを変える」を前もって入れるとき</div></div><div class="field"><label>適用終了日（任意）</label><input type="date" name="validTo" value="' + esc(s.validTo) + '"></div>' : '') +
        '<div class="field full"><label>備考</label><input type="text" name="note" value="' + esc(s.note) + '"></div></form>' +
        (kind === '基本' ? '<div class="muted small">定期の休憩（毎週の同じ時間）は、基本の行を2本に分けて入れます（例：15:00〜17:00 と 17:30〜20:00）。同じ時間に2店舗は登録できません。</div>' : '') +
        '<div class="muted small" style="margin-top:6px">保存すると、その先生の当月・翌月の枠を作り直します。</div>',
      footer: '<button type="button" class="btn sub close">やめる</button><button type="button" class="btn save">保存</button>',
      onOpen: function (bg, close) {
        var form = $('#wf', bg);
        var syncTime = function () { if ($('#allDay', bg)) $('#timeRow', bg).style.display = $('#allDay', bg).value === '1' ? 'none' : ''; };
        if ($('#allDay', bg)) $('#allDay', bg).onchange = syncTime; syncTime();
        $('.save', bg).onclick = function () {
          var d = formData(form); d.teacherId = form.teacherId.value; if (!isNew) d.shiftId = s.id;
          if (d.allDay === '1') { d.start = ''; d.end = ''; } delete d.allDay;
          busy($('.save', bg), true);
          api('shifts.save', d).then(function (r) {
            busy($('.save', bg), false);
            if (!r.ok) { showMsg(bg, r.error, 'err'); return; }
            toast(r.message); close(); if (onDone) onDone();
            if (r.outside && r.outside.length) openModal({ title: '枠の外に出た予約があります', body: '<div class="msg warn">次の予約は、先生の出勤時間の外になりました。予約は残っています。振替の連絡をお願いします（日時変更は予約の画面から）。</div>' + bookingTable(r.outside) });
          });
        };
      } });
  }

  // ---------- 予約 ----------
  function pageBookings() {
    var q = S.query, me = S.me, t0 = today();
    var from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : t0, nextM = addMonths(t0.substring(0, 7), 1), to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : nextM + '-' + p2(lastDay(nextM));
    var v = shell('<h2>予約 <span class="sub">一覧・追加・日時変更・キャンセル・期限後欠席・回数を戻す・休講</span></h2>' +
      '<div class="toolbar"><label>期間</label><input type="date" id="from" value="' + from + '"> 〜 <input type="date" id="to" value="' + to + '">' +
      '<select id="teacher"><option value="">先生：すべて</option>' + opts(me.teachers, q.teacherId || '', function (t) { return t.name; }, function (t) { return t.id; }) + '</select>' +
      '<select id="store"><option value="">店舗：すべて</option>' + opts(me.stores.map(function (s) { return s.name; }), q.store || '') + '</select>' +
      '<select id="state"><option value="">状態：すべて</option>' + opts(me.lists.states, q.state === undefined ? '予約中' : q.state) + '</select>' +
      (q.studentId ? '<span class="tag blue">生徒 ' + esc(q.studentId) + ' <a href="#bookings" style="margin-left:4px">×</a></span>' : '') +
      '<button type="button" class="btn sub" id="search">表示</button><span class="grow"></span><button type="button" class="btn sub" id="xlsx">Excel に出す</button><button type="button" class="btn" id="add">＋ 予約を追加</button></div>' +
      '<div id="bulkbar" class="row" style="display:none;margin-bottom:8px"><b><span id="selcount">0</span> 件を選択中</b><button type="button" class="btn small sub" id="bulk-cancel">まとめてキャンセル</button><button type="button" class="btn small sub" id="bulk-close">まとめて休講</button><span class="muted small">（キャンセルは期限を過ぎたものを外します。休講は期限を見ません）</span></div><div id="list" class="loading">読み込み中…</div>');
    var last = [], preselect = (q.select || '').split(',').filter(Boolean);
    var selected = function () { return $$('.sel:checked', $('#list')).map(function (c) { return c.value; }); };
    var syncBar = function () { var n = selected().length; $('#bulkbar').style.display = n ? '' : 'none'; $('#selcount').textContent = n; };
    var load = function () {
      var p = { from: $('#from').value, to: $('#to').value, teacherId: $('#teacher').value, store: $('#store').value, state: $('#state').value, studentId: q.studentId || '' };
      api('bookings.list', p).then(function (r) {
        if (!v.isConnected) return;
        if (!r.ok) { $('#list').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
        last = r.bookings;
        $('#list').innerHTML = bookingTable(r.bookings, { empty: '該当する予約はありません', select: true, actions: function (b) {
          var a = [];
          if (b.state === '予約中') a.push(['move', '日時変更'], ['cancel', 'キャンセル'], ['absent', '期限後欠席'], ['close', '休講']);
          if (b.state === '期限後欠席') { if (!b.refundedAt) a.push(['refund', '回数を戻す']); a.push(['close', '休講']); }
          if (b.attention.indexOf('同期待ち') >= 0) a.push(['requeue', '書き出し直す']);
          return a.map(function (x) { return '<button type="button" class="btn small sub act" data-act="' + x[0] + '" data-id="' + esc(b.id) + '">' + x[1] + '</button>'; }).join('');
        } }) + '<div class="muted small" style="padding:6px">' + r.bookings.length + ' 件</div>';
        $$('.act', $('#list')).forEach(function (btn) { btn.onclick = function () { bookingAction(btn.dataset.act, r.bookings.find(function (b) { return b.id === btn.dataset.id; }), load); }; });
        $$('.sel', $('#list')).forEach(function (c) { if (preselect.indexOf(c.value) >= 0) c.checked = true; c.onchange = syncBar; });
        preselect = [];
        if ($('#selall')) $('#selall').onchange = function () { $$('.sel', $('#list')).forEach(function (c) { c.checked = $('#selall').checked; }); syncBar(); };
        syncBar();
      });
    };
    var bulk = function (act) {
      var ids = selected(); if (!ids.length) return;
      var names = ids.map(function (id) { var b = last.find(function (x) { return x.id === id; }); return b ? b.id + '　' + fmtD(b.date) + ' ' + hm(b.start) + ' ' + b.studentName + '／' + b.teacherName : id; });
      var title = act === 'cancel' ? 'まとめてキャンセル' : 'まとめて休講';
      confirmBox(title, ids.length + ' 件を' + (act === 'cancel' ? 'キャンセルします（回数は戻ります。期限を過ぎているものは外します）' : '休講にします（回数は戻ります。生徒さんへの連絡は LINE でお願いします）') + '：\n\n' + names.join('\n'), title, true).then(function (yes) {
        if (!yes) return;
        api('bookings.bulk', { act: act, bookingIds: ids }).then(function (r) {
          if (!r.ok) { toast(r.error, 'err'); return; }
          openModal({ title: title + '：結果（' + r.message + '）', body: '<table class="tbl"><thead><tr><th>予約ID</th><th>結果</th></tr></thead><tbody>' + r.results.map(function (x) { return '<tr><td class="nowrap">' + esc(x.id) + '</td><td class="' + (x.ok ? 'state-予約中' : x.skipped ? 'state-休講' : 'state-期限後欠席') + '">' + (x.ok ? '済：' : x.skipped ? '外した：' : '失敗：') + esc(x.message) + '</td></tr>'; }).join('') + '</tbody></table>' });
          load();
        });
      });
    };
    $('#bulk-cancel').onclick = function () { bulk('cancel'); }; $('#bulk-close').onclick = function () { bulk('closeSchool'); };
    $('#xlsx').onclick = function () {
      var rows = last.map(function (b) { return [b.id, b.date, b.weekday, hm(b.start), hm(b.end), b.studentName, b.teacherName, b.store, b.course, b.state, b.route, b.attention.join('／'), b.memo, b.refundReason, b.operator]; });
      xlsx('ビヨンド_予約一覧_' + $('#from').value + '_' + $('#to').value + '.xlsx', [{ name: '予約一覧', rows: [['期間', $('#from').value + '〜' + $('#to').value, '出力日時', fmtNow()], [], ['予約ID', '日付', '曜日', '開始', '終了', '生徒', '先生', '店舗', 'コース', '状態', '経路', '注意', '要望メモ', '回数戻し理由', '操作者']].concat(rows) }], '予約一覧', rows.length, $('#from').value + '〜' + $('#to').value);
    };
    $('#search').onclick = load; ['from', 'to', 'teacher', 'store', 'state'].forEach(function (id) { $('#' + id).onchange = load; });
    $('#add').onclick = function () { bookingForm(null, load); };
    load();
  }
  function describe(b) { return b.id + '　' + fmtD(b.date) + ' ' + hm(b.start) + '〜' + hm(b.end) + '\n' + b.studentName + ' さん／' + b.teacherName + '先生・' + b.store + '（' + b.course + '）\n状態：' + b.state; }
  function bookingAction(act, b, onDone) {
    // 書き出しは応答のあとに行われるので、数秒後にもう一度読み直して「同期待ち」の印を消す
    var done = function (r) { if (!r.ok) { toast(r.error, 'err'); return false; } toast(r.message); onDone(); setTimeout(onDone, 4000); return true; };
    if (act === 'move') { bookingForm(b, onDone); return; }
    if (act === 'requeue') { api('sync.requeue', { bookingId: b.id }).then(done); return; }
    if (act === 'cancel') {
      confirmBox('予約をキャンセル', describe(b) + '\n\nキャンセルします。回数は1回戻ります。よろしいですか？\n（変更期限を過ぎているときはキャンセルできず、「期限後欠席」を案内します）', 'キャンセルする', true).then(function (yes) {
        if (!yes) return;
        api('bookings.cancel', { bookingId: b.id }).then(function (r) {
          if (r.code === 'late') {
            confirmBox('変更期限を過ぎています', r.error + '\n\n「期限後欠席」にしますか？（回数は消化のままです）', '期限後欠席にする', true).then(function (y2) { if (y2) api('bookings.absent', { bookingId: b.id }).then(done); });
            return;
          }
          done(r);
        });
      });
    } else if (act === 'absent') {
      confirmBox('期限後欠席にする', describe(b) + '\n\n期限後欠席にします。回数は消化のままで、カレンダーの予定に「（欠席）」が付きます。よろしいですか？', '期限後欠席にする', true).then(function (yes) { if (yes) api('bookings.absent', { bookingId: b.id }).then(done); });
    } else if (act === 'refund') {
      promptBox('回数を戻す（特例）', describe(b) + '\n\n回数を1回戻します。電車の遅延・天災などの特例のときだけ使います。', '理由（必須。例：電車遅延、台風）').then(function (reason) { if (reason === null) return; api('bookings.refund', { bookingId: b.id, reason: reason }).then(done); });
    } else if (act === 'close') {
      confirmBox('休講にする（学校都合）', describe(b) + '\n\n休講にします。回数は戻ります（すでに戻してある場合は動かしません）。カレンダーの予定は消えます。\n生徒さんへの連絡は LINE でお願いします。', '休講にする', true).then(function (yes) { if (yes) api('bookings.closeSchool', { bookingId: b.id }).then(done); });
    }
  }
  /** 追加（b＝null）と日時変更（b＝元の予約） */
  function bookingForm(b, onDone) {
    var me = S.me, tAct = me.teachers.filter(function (t) { return t.active; });
    openModal({ title: b ? '予約の日時変更　' + b.id : '予約を追加', sticky: true,
      body: (b ? '<div class="msg info">' + esc(describe(b)) + '</div>' : '') + '<form class="form" id="bf">' +
        (b ? '' : '<div class="field full"><label>生徒（氏名・フリガナ・電話番号で検索）</label><div class="row"><input type="text" id="sq" placeholder="検索して選ぶ" style="flex:1"><select name="studentId" id="sid" style="flex:2"><option value="">検索してください</option></select></div><div class="hint" id="sinfo"></div></div>') +
        '<div class="field"><label>先生</label><select name="teacherId" id="tid">' + opts(tAct, b ? b.teacherId : '', function (t) { return t.name; }, function (t) { return t.id; }, '選んでください') + '</select></div>' +
        '<div class="field"><label>日付</label><input type="date" name="date" id="date" value="' + esc(b ? b.date : today()) + '" min="' + today() + '"></div>' +
        '<div class="field"><label>開始時刻</label><select name="start" id="start">' + timeOptions(b ? hm(b.start) : '', me.stepMinutes, 540, 1380) + '</select><div class="hint">終了は' + (b ? '元の予約と同じ長さ' : '生徒のコースの時間') + 'で決まります</div></div>' +
        '<div class="field"><label>&nbsp;</label><button type="button" class="btn sub" id="avail">空き確認</button></div>' +
        '<div class="field full"><label>その日のその先生の出勤時間と予約</label><div class="avail" id="availBox"><span class="muted">先生と日付を選んで「空き確認」</span></div></div></form>' +
        '<div class="muted small">' + (b ? '運営の日時変更は変更期限を過ぎていてもできます。元の予約は「振替済」になり、回数は動きません。' : '運営の追加は、生徒の希望条件や受付の締切は見ません。出勤時間の中で、先生・生徒の予約と重ならず、回数が残っていれば入ります。') + '</div>',
      footer: '<button type="button" class="btn sub close">やめる</button><button type="button" class="btn save">' + (b ? '変更する' : '追加する') + '</button>',
      onOpen: function (bg, close) {
        var form = $('#bf', bg);
        var avail = function () {
          var tid = $('#tid', bg).value, d = $('#date', bg).value; if (!tid || !d) return;
          $('#availBox', bg).innerHTML = '<span class="muted">確認中…</span>';
          api('bookings.availability', { teacherId: tid, date: d }).then(function (r) {
            if (!r.ok) { $('#availBox', bg).innerHTML = '<span class="muted">' + esc(r.error) + '</span>'; return; }
            $('#availBox', bg).innerHTML = '<b>出勤</b>：' + (r.slots.length ? r.slots.map(function (s) { return hm(s.start) + '〜' + hm(s.end) + '（' + s.store + '）'; }).join('、') : '<span class="muted">出勤なし（臨時出勤をシフトに登録してから追加してください）</span>') +
              '<br><b>予約</b>：' + (r.bookings.length ? '<ul>' + r.bookings.map(function (x) { return '<li>' + hm(x.start) + '〜' + hm(x.end) + ' ' + esc(x.studentName) + (x.state === '期限後欠席' ? '（期限後欠席）' : '') + (b && x.id === b.id ? '（この予約）' : '') + '</li>'; }).join('') + '</ul>' : 'なし');
          });
        };
        $('#avail', bg).onclick = avail; $('#tid', bg).onchange = avail; $('#date', bg).onchange = avail;
        if (b) avail();
        if (!b) {
          var timer = null;
          $('#sq', bg).oninput = function () {
            clearTimeout(timer); var q = $('#sq', bg).value.trim(); if (!q) return;
            timer = setTimeout(function () {
              api('students.list', { q: q }).then(function (r) {
                if (!r.ok) return;
                var list = r.students.filter(function (s) { return s.status !== '退会'; });
                $('#sid', bg).innerHTML = list.length ? opts(list, '', function (s) { return s.id + ' ' + s.family + ' ' + s.given + '（' + s.kana + '）' + (s.status === '休会' ? '【休会】' : '') + '　' + s.store + '・' + s.course + '・残り ' + s.remaining; }, function (s) { return s.id; }) : '<option value="">該当なし</option>';
              });
            }, 300);
          };
        }
        $('.save', bg).onclick = function () {
          var d = formData(form); if (b) d.bookingId = b.id;
          busy($('.save', bg), true);
          api(b ? 'bookings.move' : 'bookings.add', d).then(function (r) { busy($('.save', bg), false); if (!r.ok) { showMsg(bg, r.error, 'err'); return; } toast(r.message); close(); if (onDone) { onDone(); setTimeout(onDone, 4000); } });
        };
      } });
  }

  // ---------- 実績一覧（仕様書 12章）と Excel（設計書 12章：まとめ＋先生ごとのシート） ----------
  function pageResults() {
    var month = /^\d{4}-\d{2}$/.test(S.query.month || '') ? S.query.month : today().substring(0, 7);
    var v = shell('<h2>実績 <span class="sub">先生ごとの件数と明細。実施＝予約中で今日より前。休講は学校都合（当日欠席にも期限内キャンセルにも数えません）</span></h2>' +
      '<div class="toolbar"><button type="button" class="btn sub small" id="prev">‹ 前の月</button><b id="mlabel" style="font-size:16px">' + month.substring(0, 4) + '年' + (+month.substring(5)) + '月</b><button type="button" class="btn sub small" id="next">次の月 ›</button><span class="grow"></span><button type="button" class="btn" id="xlsx">Excel に出す（まとめ＋先生ごと）</button></div><div id="body" class="loading">読み込み中…</div>');
    $('#prev').onclick = function () { location.hash = '#results?month=' + addMonths(month, -1); }; $('#next').onclick = function () { location.hash = '#results?month=' + addMonths(month, 1); };
    api('results.month', { month: month }).then(function (r) {
      if (!v.isConnected) return;
      if (!r.ok) { $('#body').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
      var kc = { '実施': 'green', '期限後欠席': 'red', '期限内キャンセル': '', '休講': 'yellow', '予定': 'blue' };
      $('#body').innerHTML = '<div class="card"><h3 style="margin-top:0">先生別の件数</h3><table class="tbl"><thead><tr><th>先生</th><th>実施</th><th>期限後欠席（当日欠席）</th><th>うち回数戻し</th><th>期限内キャンセル</th><th>休講</th><th>予定（今日以降）</th></tr></thead><tbody>' +
        r.summary.map(function (x) { return '<tr' + (x.active ? '' : ' class="dim"') + '><td class="nowrap">' + esc(x.teacherName) + '</td><td class="num">' + x.done + '</td><td class="num">' + x.absent + '</td><td class="num">' + x.refunded + '</td><td class="num">' + x.cancelled + '</td><td class="num">' + x.closed + '</td><td class="num muted">' + x.planned + '</td></tr>'; }).join('') + '</tbody></table>' +
        '<div class="muted small" style="margin-top:6px">先生には、この画面を直接見せず、先生ごとの件数を伝えます（ほかの先生の生徒名が載るため）。Excel の先生ごとのシートは、その1枚だけを切り出して渡せます。金額は出しません。</div></div>' +
        '<div class="card"><h3 style="margin-top:0">明細（日付順）</h3>' + (r.detail.length ? '<table class="tbl"><thead><tr><th>日付</th><th>時間</th><th>先生</th><th>生徒</th><th>コース</th><th>区分</th><th>回数戻し</th><th>予約ID</th></tr></thead><tbody>' +
        r.detail.map(function (b) { return '<tr class="' + (b.kind === '予定' ? 'dim' : '') + '"><td class="nowrap">' + fmtD(b.date) + '</td><td class="nowrap">' + hm(b.start) + '〜' + hm(b.end) + '</td><td class="nowrap">' + esc(b.teacherName) + '</td><td class="nowrap">' + esc(b.studentName) + '</td><td class="nowrap">' + esc(b.course) + '</td><td><span class="tag ' + (kc[b.kind] || '') + '">' + esc(b.kind) + '</span></td><td class="small">' + (b.refundedAt ? '戻した：' + esc(b.refundReason) : '') + '</td><td class="small">' + esc(b.id) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="muted">この月の予約はありません</div>') + '</div>';
      $('#xlsx').onclick = function () {
        var at = fmtNow();
        var summary = [['対象月', month], ['出力日時', at], ['実施＝予約中で今日より前。期限後欠席＝当日欠席（50%）。休講＝学校都合（数えない）。金額は出しません'], [], ['先生', '実施', '期限後欠席（当日欠席）', 'うち回数戻し', '期限内キャンセル', '休講', '予定（今日以降）']]
          .concat(r.summary.map(function (x) { return [x.teacherName, x.done, x.absent, x.refunded, x.cancelled, x.closed, x.planned]; }));
        var sheets = [{ name: 'まとめ', rows: summary }];
        r.summary.forEach(function (x) {
          var mine = r.detail.filter(function (b) { return b.teacherId === x.teacherId; });
          sheets.push({ name: x.teacherName, rows: [['先生', x.teacherName, '対象月', month, '出力日時', at], ['実施', x.done, '期限後欠席', x.absent, 'うち回数戻し', x.refunded, '期限内キャンセル', x.cancelled, '休講', x.closed], [], ['日付', '曜日', '開始', '終了', '生徒', 'コース', '区分', '回数戻し理由', '予約ID']]
            .concat(mine.map(function (b) { return [b.date, b.weekday, hm(b.start), hm(b.end), b.studentName, b.course, b.kind, b.refundedAt ? b.refundReason : '', b.id]; })) });
        });
        xlsx('ビヨンド_実績_' + month + '.xlsx', sheets, '実績一覧', r.detail.length, month);
      };
    });
  }

  // ---------- ログ（処理ログ・操作ログ。⑥） ----------
  function pageLogs() {
    var kind = S.query.kind === 'audit' ? 'audit' : 'proc', att = S.query.attention === '1';
    var v = shell('<h2>ログ <span class="sub">処理ログ（自動の処理の記録）と操作ログ（だれが何をしたか）。ID は名簿と突き合わせて名前を添えます</span></h2>' +
      '<div class="tabs"><button type="button" class="' + (kind === 'proc' ? 'on' : '') + '" id="tab-proc">処理ログ</button><button type="button" class="' + (kind === 'audit' ? 'on' : '') + '" id="tab-audit">操作ログ</button>' +
      (kind === 'proc' ? '<label style="margin-left:12px"><input type="checkbox" id="att"' + (att ? ' checked' : '') + '> 対応が要るものだけ</label>' : '') + '</div><div id="list" class="loading">読み込み中…</div>');
    $('#tab-proc').onclick = function () { location.hash = '#logs?kind=proc'; }; $('#tab-audit').onclick = function () { location.hash = '#logs?kind=audit'; };
    if ($('#att')) $('#att').onchange = function () { location.hash = '#logs?kind=proc' + ($('#att').checked ? '&attention=1' : ''); };
    api('logs.list', { kind: kind, limit: 300, attention: att ? '1' : '' }).then(function (r) {
      if (!v.isConnected) return;
      if (!r.ok) { $('#list').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
      var nm = function (id) { var t = r.names || { students: {}, bookings: {} }; return String(id || '').split(/[,→]/).map(function (x) { x = x.trim(); var n = t.bookings[x] || t.students[x]; return n ? esc(x) + ' <span class="muted small">' + esc(n) + '</span>' : esc(x); }).join('<span class="muted">, </span>'); };
      if (kind === 'audit') {
        $('#list').innerHTML = '<table class="tbl"><thead><tr><th>日時</th><th>だれが</th><th>操作</th><th>対象</th><th>内容</th></tr></thead><tbody>' + r.rows.map(function (a) {
          var who = a.actorType === 'student' ? '生徒 ' + nm(a.actor) : a.actorType === 'system' ? '自動（' + esc(a.actor) + '）' : esc(a.actor);
          return '<tr><td class="nowrap">' + fmtDT(a.at) + '</td><td class="nowrap small">' + who + '</td><td class="nowrap">' + esc(a.action) + '</td><td class="small">' + esc(a.targetType) + ' ' + nm(a.targetId) + '</td><td class="small">' + esc(Object.keys(a.detail || {}).map(function (k) { return k + '：' + (Array.isArray(a.detail[k]) ? a.detail[k].join('、') : JSON.stringify(a.detail[k]).replace(/^"|"$/g, '')); }).join('　')) + '</td></tr>';
        }).join('') + '</tbody></table>';
      } else {
        $('#list').innerHTML = '<table class="tbl"><thead><tr><th>日時</th><th>処理</th><th>対象</th><th>内容</th><th></th></tr></thead><tbody>' + r.rows.map(function (a) {
          return '<tr><td class="nowrap">' + fmtDT(a.at) + '</td><td class="nowrap">' + esc(a.job) + '</td><td class="small">' + nm(a.target) + '</td><td class="small">' + esc(a.message).replace(/S\d{4}/g, function (m) { return nm(m); }) + '</td><td>' + (a.attention ? '<span class="tag red">要対応</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
      }
    });
  }

  // ---------- スタッフ（許可リスト。登録は admin だけ） ----------
  function pageStaff() {
    var me = S.me, isAdmin = me.staff.role === 'admin';
    var v = shell('<h2>スタッフ <span class="sub">運営の画面にログインできる Google アカウント。登録・変更は管理者だけ</span></h2><div id="list" class="loading">読み込み中…</div>' +
      (isAdmin ? '<div class="card"><h3 style="margin-top:0">登録・変更</h3><form class="form" id="sf"><div class="field"><label>Google アカウント（メール）</label><input type="email" name="email"></div><div class="field"><label>名前</label><input type="text" name="name"></div><div class="field"><label>役割</label><select name="role"><option value="staff">スタッフ</option><option value="admin">管理者（スタッフの登録ができる）</option></select></div><div class="field"><label>状態</label><select name="active"><option value="true">有効</option><option value="false">無効（ログインできない）</option></select></div></form><button type="button" class="btn" id="save">保存</button><div class="muted small" style="margin-top:6px">同じメールを入れると上書きです。無効にしたアカウントは、ログインできても「登録されていません」になります。</div></div>' : '<div class="muted">あなたは「スタッフ」の役割です。登録・変更は管理者にお願いしてください。</div>'));
    var load = function () {
      api('staff.list').then(function (r) {
        if (!v.isConnected) return;
        if (!r.ok) { $('#list').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
        $('#list').innerHTML = '<table class="tbl"><thead><tr><th>メール</th><th>名前</th><th>役割</th><th>状態</th><th>登録</th></tr></thead><tbody>' + r.staff.map(function (x) { return '<tr class="' + (x.active ? (isAdmin ? 'click' : '') : 'dim') + '" data-email="' + esc(x.email) + '" data-name="' + esc(x.name) + '" data-role="' + esc(x.role) + '" data-active="' + x.active + '"><td>' + esc(x.email) + (x.email === me.staff.email ? ' <span class="tag blue">あなた</span>' : '') + '</td><td>' + esc(x.name) + '</td><td>' + (x.role === 'admin' ? '管理者' : 'スタッフ') + '</td><td>' + (x.active ? '有効' : '無効') + '</td><td class="nowrap small">' + fmtDT(x.createdAt) + '</td></tr>'; }).join('') + '</tbody></table>';
        if (isAdmin) $$('tr[data-email]', $('#list')).forEach(function (tr) { tr.onclick = function () { var f = $('#sf'); f.email.value = tr.dataset.email; f.name.value = tr.dataset.name; f.role.value = tr.dataset.role; f.active.value = tr.dataset.active; }; });
      });
    };
    if (isAdmin) $('#save').onclick = function () { var d = formData($('#sf')); d.active = d.active === 'true'; busy($('#save'), true); api('staff.save', d).then(function (r) { busy($('#save'), false); toast(r.ok ? r.message : r.error, r.ok ? '' : 'err'); if (r.ok) load(); }); };
    load();
  }

  // ---------- Excel（ブラウザで組み立てる。設計書 8章）と写真の縮小 ----------
  function fmtNow() { var d = new Date(); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function xlsx(filename, sheets, logKind, count, note) {
    if (!window.XLSX) { toast('Excel の部品（SheetJS）が読み込めていません。ページを開き直してください', 'err'); return; }
    var wb = XLSX.utils.book_new(), used = {};
    sheets.forEach(function (sh) {
      var ws = XLSX.utils.aoa_to_sheet(sh.rows);
      var widths = []; sh.rows.forEach(function (r) { r.forEach(function (c, i) { var l = String(c === undefined || c === null ? '' : c).replace(/[^\x01-\x7E]/g, 'xx').length; if (!widths[i] || l > widths[i]) widths[i] = l; }); });
      ws['!cols'] = widths.map(function (w) { return { wch: Math.min(48, Math.max(6, w + 2)) }; });
      var name = String(sh.name || 'Sheet').replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31) || 'Sheet'; var base = name, k = 2; while (used[name]) { name = (base.slice(0, 28) + '(' + k + ')'); k++; } used[name] = true;
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, filename);
    api('export.log', { kind: logKind, count: count, note: note || '' });
    toast(filename + ' を出しました');
  }
  function shrinkImage(file, max) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, r = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * r); c.height = Math.round(h * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('画像として開けません')); };
      img.src = url;
    });
  }

  // ---------- 設定 ----------
  function pageSettings() {
    var me = S.me;
    var v = shell('<h2>設定 <span class="sub">項目の値を変えると、すぐに効きます。キー（項目名）は変えられません</span></h2><div id="items" class="loading">読み込み中…</div><div class="grid2"><div class="card" id="courses"></div><div class="card" id="stores"></div></div>');
    var loadItems = function () {
      api('settings.list').then(function (r) {
        if (!v.isConnected) return;
        if (!r.ok) { $('#items').innerHTML = '<div class="msg err">' + esc(r.error) + '</div>'; return; }
        $('#items').innerHTML = '<div class="card"><table class="tbl"><thead><tr><th>項目</th><th style="width:320px">値</th><th>説明</th><th></th></tr></thead><tbody>' + r.settings.map(function (s) {
          var input = s.kind === 'onoff' ? '<select data-key="' + esc(s.key) + '"><option' + (s.value === 'ON' ? ' selected' : '') + '>ON</option><option' + (s.value === 'OFF' ? ' selected' : '') + '>OFF</option></select>'
            : s.kind === 'text' ? '<textarea data-key="' + esc(s.key) + '" style="width:100%;min-height:56px">' + esc(s.value) + '</textarea>'
            : '<input type="text" data-key="' + esc(s.key) + '" value="' + esc(s.value) + '" style="width:120px">';
          return '<tr><td class="nowrap">' + esc(s.key) + '</td><td>' + input + '</td><td class="small muted">' + esc(s.note) + '</td><td class="actions"><button type="button" class="btn small sub save" data-key="' + esc(s.key) + '">保存</button></td></tr>';
        }).join('') + '</tbody></table></div>';
        $$('.save', $('#items')).forEach(function (btn) { btn.onclick = function () {
          var el = $('[data-key="' + btn.dataset.key.replace(/"/g, '\\"') + '"]', $('#items'));
          busy(btn, true); api('settings.save', { key: btn.dataset.key, value: el.value }).then(function (r) { busy(btn, false); toast(r.ok ? r.message : r.error, r.ok ? '' : 'err'); });
        }; });
      });
    };
    var drawDefs = function () {
      $('#courses').innerHTML = '<h3 style="margin-top:0">コース</h3><table class="tbl"><thead><tr><th>コース名</th><th>時間（分）</th><th>月の回数</th><th>並び</th><th>有効</th><th></th></tr></thead><tbody>' + me.courses.map(function (c) {
        return '<tr><td>' + esc(c.name) + '</td><td><input type="number" data-f="minutes" value="' + c.minutes + '" style="width:70px"></td><td><input type="number" data-f="monthlyCount" value="' + c.monthlyCount + '" style="width:70px"></td><td><input type="number" data-f="sort" value="' + c.sort + '" style="width:60px"></td><td><input type="checkbox" data-f="active"' + (c.active ? ' checked' : '') + '></td><td class="actions"><button type="button" class="btn small sub csave" data-name="' + esc(c.name) + '">保存</button></td></tr>';
      }).join('') + '<tr><td><input type="text" id="cname" placeholder="新しいコース名" style="width:150px"></td><td><input type="number" id="cmin" value="45" style="width:70px"></td><td><input type="number" id="ccount" value="4" style="width:70px"></td><td><input type="number" id="csort" value="9" style="width:60px"></td><td><input type="checkbox" id="cactive" checked></td><td class="actions"><button type="button" class="btn small" id="cadd">追加</button></td></tr></tbody></table><div class="muted small">名前は変えられません（予約・先生・名簿が名前で参照しているため）。使わなくなったコースは「有効」を外します。</div>';
      $('#stores').innerHTML = '<h3 style="margin-top:0">店舗</h3><table class="tbl"><thead><tr><th>店舗名</th><th>並び</th><th>解禁日</th><th>解禁時刻</th><th>全体カレンダー</th><th>有効</th><th></th></tr></thead><tbody>' + me.stores.map(function (s) {
        return '<tr><td>' + esc(s.name) + '</td><td><input type="number" data-f="sort" value="' + s.sort + '" style="width:60px"></td><td><input type="text" data-f="releaseDay" value="' + esc(s.releaseDay === null ? '' : s.releaseDay) + '" style="width:50px" placeholder="共通"></td><td><input type="text" data-f="releaseTime" value="' + esc(s.releaseTime) + '" style="width:70px" placeholder="共通"></td><td>' + (s.hasCalendar ? '作成済' : '<span class="tag yellow">未作成</span>') + '</td><td><input type="checkbox" data-f="active"' + (s.active ? ' checked' : '') + '></td><td class="actions"><button type="button" class="btn small sub ssave" data-name="' + esc(s.name) + '">保存</button></td></tr>';
      }).join('') + '<tr><td><input type="text" id="sname" placeholder="新しい店舗名" style="width:120px"></td><td><input type="number" id="ssort" value="9" style="width:60px"></td><td></td><td></td><td></td><td><input type="checkbox" id="sactive" checked></td><td class="actions"><button type="button" class="btn small" id="sadd">追加</button></td></tr></tbody></table><div class="muted small">解禁日・解禁時刻は、店舗ごとに解禁をずらすときだけ入れます（空欄＝設定の「予約解禁日」「予約解禁時刻」）。全体カレンダーは、先生の画面の「カレンダーを作成・共有」で作られます。</div>';
      var rowVals = function (btn) { var o = {}; $$('[data-f]', btn.closest('tr')).forEach(function (el) { o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; }); return o; };
      var after = function (r) { toast(r.ok ? r.message : r.error, r.ok ? '' : 'err'); if (r.ok) api('me').then(function (m) { if (m.ok) { S.me = me = m; drawDefs(); } }); };
      $$('.csave', v).forEach(function (btn) { btn.onclick = function () { var o = rowVals(btn); o.name = btn.dataset.name; api('courses.save', o).then(after); }; });
      $$('.ssave', v).forEach(function (btn) { btn.onclick = function () { var o = rowVals(btn); o.name = btn.dataset.name; api('stores.save', o).then(after); }; });
      $('#cadd').onclick = function () { api('courses.save', { name: $('#cname').value, minutes: $('#cmin').value, monthlyCount: $('#ccount').value, sort: $('#csort').value, active: $('#cactive').checked }).then(after); };
      $('#sadd').onclick = function () { api('stores.save', { name: $('#sname').value, sort: $('#ssort').value, active: $('#sactive').checked, releaseDay: '', releaseTime: '' }).then(after); };
    };
    loadItems(); drawDefs();
  }
})();
