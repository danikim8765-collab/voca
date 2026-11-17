// 꾸미기 (설정 > 화면 · 문제 풀기): 밝기, 강조 색, 글자 크기, 예문 글꼴, 모서리, 카드, 퀴즈 바탕, 홈에 보일 것,
// DAY별 진도 보기, 정답 반응, 앱 키보드 높이·소리.
// 첫 화면을 그리기 전에 <html> 속성(data-theme 등)으로 붙여야 깜빡이지 않아서 모듈이 아닌 보통 스크립트 (index.html <head>).
// 이 기기에만 저장(동기화 안 함). 두 모드가 같이 쓰고, 강조 색·카드·퀴즈 바탕만 모드마다 따로 (모드의 원래 모습이 다르니까).
(function (root) {
  var KEY = 'voca.look.v1';
  var CHOICES = {
    theme: ['auto', 'light', 'dark'],      // 폰 설정대로 · 늘 밝게 · 늘 어둡게
    size: ['s', 'm', 'l', 'xl'],           // 예문·보기·정답 시트 글자
    font: ['sans', 'serif'],               // 영어 예문 글꼴
    radius: ['round', 'soft', 'square'],   // 모서리
    react: ['calm', 'mid', 'fun'],         // 정답 반응
    kb: ['s', 'm', 'l'],                   // 앱 키보드 키 높이
    days: ['grid', 'lines', 'heat'],       // 홈 DAY별 진도: 격자 · 줄 막대 · 잔디
    accent: ['navy', 'forest', 'grape', 'coral', 'ink'],
    edge: ['shadow', 'line'],              // 카드 구분: 그림자 · 얇은 테두리
    glow: ['warm', 'sky', 'mint', 'none'], // 퀴즈 바탕 아래쪽 빛
  };
  var HIDE = ['coach', 'plan', 'practice', 'book', 'days']; // 홈에서 숨길 수 있는 덩어리 ('오늘' 카드는 늘 보임)
  var DEFAULT = { theme: 'auto', size: 'm', font: 'sans', radius: 'round', react: 'mid', kb: 'm', days: 'grid', sound: false, buzz: false, kbSound: false, hide: [] };
  var MODE_DEFAULT = { ex: { accent: 'navy', edge: 'shadow', glow: 'warm' }, word: { accent: 'ink', edge: 'line', glow: 'none' } };
  // 상태 표시줄 색 = 바탕색
  var BAR = { ex: { light: '#f3f5f9', dark: '#0e1626' }, word: { light: '#f7f6f1', dark: '#17171a' } };

  var pick = function (v, list, def) { return list.indexOf(v) >= 0 ? v : def; };
  // 저장된 값을 믿지 않고 고를 수 있는 값으로만 (예전 기기·고장 난 값이면 기본값)
  function clean(o) {
    o = o && typeof o === 'object' ? o : {};
    var out = {};
    ['theme', 'size', 'font', 'radius', 'react', 'kb', 'days'].forEach(function (k) { out[k] = pick(o[k], CHOICES[k], DEFAULT[k]); });
    ['sound', 'buzz', 'kbSound'].forEach(function (k) { out[k] = o[k] === true; });
    out.hide = HIDE.filter(function (k) { return Array.isArray(o.hide) && o.hide.indexOf(k) >= 0; });
    ['ex', 'word'].forEach(function (m) {
      var src = o[m] && typeof o[m] === 'object' ? o[m] : {}, d = MODE_DEFAULT[m];
      out[m] = { accent: pick(src.accent, CHOICES.accent, d.accent), edge: pick(src.edge, CHOICES.edge, d.edge), glow: pick(src.glow, CHOICES.glow, d.glow) };
    });
    return out;
  }

  var api = { KEY: KEY, CHOICES: CHOICES, HIDE: HIDE, DEFAULT: DEFAULT, MODE_DEFAULT: MODE_DEFAULT, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // 테스트 (node)
  if (typeof document === 'undefined') return;

  var doc = document.documentElement;
  var mode = function () { return doc.getAttribute('data-mode') === 'word' ? 'word' : 'ex'; };
  var mq = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  var cur;
  try { cur = clean(JSON.parse(root.localStorage.getItem(KEY) || '{}')); } catch (e) { cur = clean({}); }

  function apply() {
    var m = mode(), mm = cur[m];
    var dark = cur.theme === 'dark' || (cur.theme === 'auto' && !!(mq && mq.matches));
    var attrs = {
      'data-theme': dark ? 'dark' : 'light', 'data-size': cur.size, 'data-font': cur.font, 'data-radius': cur.radius,
      'data-react': cur.react, 'data-kb': cur.kb, 'data-accent': mm.accent, 'data-edge': mm.edge, 'data-glow': mm.glow,
      'data-hide': cur.hide.join(' '),
    };
    for (var k in attrs) doc.setAttribute(k, attrs[k]);
    doc.style.colorScheme = dark ? 'dark' : 'light'; // 날짜 칸·스크롤바도 같이
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BAR[m][dark ? 'dark' : 'light']);
  }
  // 폰 설정을 따를 때 폰이 밝기를 바꾸면 바로
  if (mq) {
    var onScheme = function () { if (cur.theme === 'auto') apply(); };
    if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);
  }

  api.get = function () { return cur; };
  api.mode = mode;
  // set({ size: 'l' }) · set({ accent: 'grape' }) (강조 색·카드·퀴즈 바탕은 지금 모드에만)
  api.set = function (patch) {
    var next = JSON.parse(JSON.stringify(cur)), m = mode();
    for (var k in patch) {
      if (k === 'accent' || k === 'edge' || k === 'glow') next[m][k] = patch[k];
      else next[k] = patch[k];
    }
    cur = clean(next);
    try { root.localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* 저장이 막혀도 이번엔 바뀜 */ }
    apply();
    return cur;
  };
  api.reset = function () {
    try { root.localStorage.removeItem(KEY); } catch (e) { /* */ }
    cur = clean({});
    apply();
    return cur;
  };
  api.apply = apply;
  root.VocaLook = api;
  apply();
})(typeof window !== 'undefined' ? window : this);
