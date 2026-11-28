// 꾸미기 (설정 > 화면 · 소리, 앱 키보드는 설정 > 공부): 테마(오리지널·네온), 밝기, 글자 크기, 예문 글꼴, 홈에 보일 것,
// DAY별 진도 보기, 정답 반응, 앱 키보드 높이·소리.
// 첫 화면을 그리기 전에 <html> 속성(data-skin · data-theme 등)으로 붙여야 깜빡이지 않아서 모듈이 아닌 보통 스크립트 (index.html <head>).
// 색은 테마가 정함: 오리지널은 모드마다 정해진 색(예문 인디고 · 단어 먹색), 네온은 늘 어둡게.
// (예전의 강조 색·모서리·카드·퀴즈 바탕 고르기는 2026-11-28에 없앰. 저장돼 있던 값은 읽을 때 버림)
// 동기화·백업에도 들어감(at = 바꾼 시각, 더 최근에 바꾼 기기 것으로). share를 끄면 이 기기에만 (share는 기기마다, 동기화 안 함)
(function (root) {
  var KEY = 'voca.look.v1';
  var CHOICES = {
    skin: ['orig', 'neon'],                // 테마: 오리지널 · 네온(늘 어둡게)
    theme: ['auto', 'light', 'dark'],      // 밝기 (오리지널만): 폰 설정대로 · 늘 밝게 · 늘 어둡게
    size: ['s', 'm', 'l', 'xl'],           // 예문·보기·정답 시트 글자
    font: ['sans', 'serif'],               // 영어 예문 글꼴
    react: ['calm', 'mid', 'fun'],         // 정답 반응
    kb: ['s', 'm', 'l'],                   // 앱 키보드 키 높이
    days: ['grid', 'lines', 'heat'],       // 홈 DAY별 진도: 격자 · 줄 막대 · 잔디
  };
  var HIDE = ['coach', 'plan', 'practice', 'book', 'days']; // 홈에서 숨길 수 있는 덩어리 ('오늘' 카드는 늘 보임)
  var DEFAULT = { skin: 'orig', theme: 'auto', size: 'm', font: 'sans', react: 'mid', kb: 'm', days: 'grid', sound: false, buzz: false, kbSound: false, hide: [], at: 0, share: true };
  // 꾸미기 저장 형식 판: 3부터 모드마다 따로 고르던 색·카드·바탕이 없음
  var VER = 3;
  // 상태 표시줄 색 = 바탕색
  var BAR = { ex: { light: '#f2f4f7', dark: '#0f121c' }, word: { light: '#f7f6f1', dark: '#17171a' }, neon: '#07080f' };

  var pick = function (v, list, def) { return list.indexOf(v) >= 0 ? v : def; };
  // 저장된 값을 믿지 않고 고를 수 있는 값으로만 (예전 기기·고장 난 값이면 기본값)
  function clean(o) {
    o = o && typeof o === 'object' ? o : {};
    var out = {};
    for (var k in CHOICES) out[k] = pick(o[k], CHOICES[k], DEFAULT[k]);
    ['sound', 'buzz', 'kbSound'].forEach(function (k) { out[k] = o[k] === true; });
    out.at = typeof o.at === 'number' && o.at > 0 ? o.at : 0;
    out.share = o.share !== false;
    out.hide = HIDE.filter(function (k) { return Array.isArray(o.hide) && o.hide.indexOf(k) >= 0; });
    out.v = VER;
    return out;
  }

  // 동기화·백업에 넣는 몫: 기기마다인 share는 뺌
  function shared(o) { var c = clean(o), out = {}; for (var k in c) if (k !== 'share') out[k] = c[k]; return out; }
  // 두 기기의 꾸미기 중 더 최근에 바꾼 것 (같으면 이 기기 것). 둘 다 없으면 null
  function mergeLook(local, remote) {
    var ok = function (x) { return !!(x && typeof x === 'object'); };
    if (!ok(remote)) return ok(local) ? shared(local) : null;
    if (!ok(local)) return shared(remote);
    return (clean(remote).at > clean(local).at) ? shared(remote) : shared(local);
  }
  var sameLook = function (x, y) { return JSON.stringify(x ? shared(x) : null) === JSON.stringify(y ? shared(y) : null); };

  var api = { KEY: KEY, CHOICES: CHOICES, HIDE: HIDE, DEFAULT: DEFAULT, clean: clean, shared: shared, mergeLook: mergeLook, sameLook: sameLook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // 테스트 (node)
  if (typeof document === 'undefined') return;

  var doc = document.documentElement;
  var mode = function () { return doc.getAttribute('data-mode') === 'word' ? 'word' : 'ex'; };
  var mq = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  var cur;
  try { cur = clean(JSON.parse(root.localStorage.getItem(KEY) || '{}')); } catch (e) { cur = clean({}); }

  function apply() {
    var m = mode(), neon = cur.skin === 'neon';
    var dark = neon || cur.theme === 'dark' || (cur.theme === 'auto' && !!(mq && mq.matches)); // 네온은 늘 어둡게
    var attrs = {
      'data-skin': cur.skin, 'data-theme': dark ? 'dark' : 'light', 'data-size': cur.size, 'data-font': cur.font,
      'data-react': cur.react, 'data-kb': cur.kb, 'data-hide': cur.hide.join(' '),
    };
    for (var k in attrs) doc.setAttribute(k, attrs[k]);
    doc.style.colorScheme = dark ? 'dark' : 'light'; // 날짜 칸·스크롤바도 같이
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', neon ? BAR.neon : BAR[m][dark ? 'dark' : 'light']);
  }
  // 폰 설정을 따를 때 폰이 밝기를 바꾸면 바로
  if (mq) {
    var onScheme = function () { if (cur.theme === 'auto' && cur.skin !== 'neon') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }

  api.get = function () { return cur; };
  api.mode = mode;
  api.onChange = null; // app.js가 동기화를 걸어 둠
  var store = function () { try { root.localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* 저장이 막혀도 이번엔 바뀜 */ } };
  // set({ size: 'l' }) · set({ skin: 'neon' })
  api.set = function (patch) {
    var next = JSON.parse(JSON.stringify(cur));
    for (var k in patch) next[k] = patch[k];
    if (!('share' in patch)) next.at = Date.now(); // 동기화 여부만 바꿀 땐 꾸미기를 바꾼 게 아님
    cur = clean(next);
    store();
    apply();
    if (api.onChange) api.onChange(cur);
    return cur;
  };
  // 처음 모습으로 (다른 기기에도 처음 모습이 가게 바꾼 시각은 남김). 동기화 여부는 그대로
  api.reset = function () {
    cur = clean({ at: Date.now(), share: cur.share });
    store();
    apply();
    if (api.onChange) api.onChange(cur);
    return cur;
  };
  // 동기화·백업에서 받은 꾸미기를 씀. stamp = 백업처럼 지금 바꾼 걸로 쳐서 다른 기기에도 퍼지게
  api.adopt = function (o, stamp) {
    var next = shared(o);
    if (stamp) next.at = Date.now();
    next.share = cur.share;
    cur = clean(next);
    store();
    apply();
    if (stamp && api.onChange) api.onChange(cur);
    return cur;
  };
  api.apply = apply;
  root.VocaLook = api;
  apply();
})(typeof window !== 'undefined' ? window : this);
