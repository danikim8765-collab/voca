// 컴퓨터 단축키 (설정 > 단축키): 퀴즈에서 누를 키를 직접 정함.
// 키는 자판 자리(e.code)로 저장해서 한글 자판 상태여도 같은 자리면 먹음. 이 기기에만 저장 (키보드가 기기마다 달라서)
// Shift·Ctrl·Alt·⌘ 같은 조합 키는 '혼자 눌렀다 떼면'으로 씀 (Shift+글자로 대문자 친 건 안 먹음)
// 조합 키는 왼쪽·오른쪽을 따로 붙일 수 있음. 처음 힌트의 'Shift'처럼 쪽이 없으면 양쪽 다

export const KEYS_KEY = 'voca.keys.v1';

// [이름, 설정 화면에 보일 말] (이 순서로 보임)
export const KEY_ACTIONS = [
  ['c1', '보기 1'], ['c2', '보기 2'], ['c3', '보기 3'], ['c4', '보기 4'],
  ['hint', '힌트'], ['idk', '모르겠어요'], ['next', '계속하기'], ['mark', '형광펜'], ['speak', '발음 듣기'], ['quit', '그만하기'],
];
export const KEY_DEFAULT = { c1: 'Digit1', c2: 'Digit2', c3: 'Digit3', c4: 'Digit4', hint: 'Shift', idk: '', next: '', mark: 'Space', speak: '', quit: 'Escape' };
// Enter는 늘 채점·계속하기 (그래서 Space는 처음부터 채점 다음 형광펜에), Tab은 칸 옮기기라 못 바꿈
export const FIXED_KEYS = ['Enter', 'Tab'];
// 문제를 푸는 중(답하기 전)에 쓰는 것: 직접 입력 문제에선 글자 키가 입력으로 먼저 감
export const WHILE_ANSWERING = ['hint', 'idk', 'quit'];

const MOD_RE = /^(Shift|Control|Alt|Meta)(Left|Right)?$/;

// 숫자 패드 숫자는 위 숫자와 같은 키, 숫자 패드 Enter는 Enter (예전 이름 OSLeft·OSRight는 Meta)
export function normKey(code) {
  code = String(code || '').replace(/^OS(Left|Right)$/, 'Meta$1');
  if (code === 'NumpadEnter') return 'Enter';
  const m = /^Numpad(\d)$/.exec(code);
  return m ? 'Digit' + m[1] : code;
}
export const isModKey = c => MOD_RE.test(c);
// 키 이벤트에서 누른 자리 이름. 어떤 노트북·키보드는 오른쪽 Shift 같은 조합 키의 e.code를 비워서 보내서,
// 그때는 e.key(없으면 옛 keyCode)와 e.location(1 왼쪽, 2 오른쪽)으로 맞춤
const MOD_BY_KEYCODE = { 16: 'Shift', 17: 'Control', 18: 'Alt', 91: 'Meta', 92: 'Meta', 93: 'Meta' };
export function keyOf(e) {
  const c = normKey(e && e.code);
  if (c || !e) return c;
  const base = ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key) ? e.key : e.key === 'OS' ? 'Meta' : MOD_BY_KEYCODE[e.keyCode] || '';
  if (!base) return '';
  return base + (e.location === 1 ? 'Left' : e.location === 2 ? 'Right' : '');
}
// 조합 키의 쪽을 뗀 이름 (ShiftRight → Shift)
export const modBase = c => (MOD_RE.exec(c) || [])[1] || '';
// 같은 키로 치는가: 같거나, 한쪽이 'Shift'(양쪽)이고 다른 쪽이 ShiftLeft·ShiftRight
const overlap = (a, b) => !!a && !!b && (a === b || (isModKey(a) && isModKey(b) && modBase(a) === modBase(b) && (a === modBase(a) || b === modBase(b))));
// 앱 키보드(직접 입력 문제)가 글자로 받는 키
export const kbTypes = c => /^(Key[A-Z]|Space|Quote|Minus|Backspace)$/.test(c);
// 글 칸(검색·입력 칸)에서 글자로 쳐지는 키
export const isTypingKey = c => /^(Key[A-Z]|Digit\d|Space|Quote|Minus|Equal|Backspace|Comma|Period|Slash|Semicolon|Bracket(Left|Right)|Backslash|Backquote|Intl\w+)$/.test(c);

// 저장된 값을 믿지 않음: 없으면 기본값, ''은 '없음', 못 쓰는 키·겹친 키는 정리
export function cleanKeys(o) {
  o = o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  const out = {}, used = new Set();
  for (const [a] of KEY_ACTIONS) {
    let c = a in o ? (typeof o[a] === 'string' ? normKey(o[a]) : KEY_DEFAULT[a]) : KEY_DEFAULT[a];
    if (c && (!/^[A-Za-z0-9]{1,24}$/.test(c) || FIXED_KEYS.includes(c) || [...used].some(u => overlap(u, c)))) c = '';
    if (c) used.add(c);
    out[a] = c;
  }
  return out;
}

// action에 code를 붙임. 다른 동작이 쓰던 키면 서로 맞바꿈 (code ''이면 지움)
// 다른 동작이 양쪽 'Shift'인데 오른쪽 Shift를 붙이면, 그 동작은 남은 왼쪽 Shift로 (narrowed)
export function assignKey(map, action, code) {
  const m = cleanKeys(map);
  code = normKey(code);
  const none = { map: m, swapped: null, narrowed: null };
  if (!(action in m) || FIXED_KEYS.includes(code)) return none;
  const other = code ? Object.keys(m).find(a => a !== action && overlap(m[a], code)) || null : null;
  let swapped = null, narrowed = null;
  if (other && m[other] === modBase(code) && code !== m[other]) {
    m[other] = m[other] + (code.endsWith('Right') ? 'Left' : 'Right');
    narrowed = other;
  } else if (other) {
    m[other] = m[action];
    swapped = other;
  }
  m[action] = code;
  return { map: cleanKeys(m), swapped, narrowed };
}

// 누른 키(e.code)에 붙은 동작. 오른쪽 Shift를 누르면 'ShiftRight' 다음 양쪽 'Shift' 순서로 찾음
export function actionFor(map, code) {
  code = normKey(code);
  if (!code) return null;
  return Object.keys(map).find(a => map[a] === code) || (isModKey(code) && Object.keys(map).find(a => map[a] === modBase(code))) || null;
}

const NAMES = {
  Space: 'Space', Escape: 'Esc', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: '⌘/Win',
  ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift', ControlLeft: '왼쪽 Ctrl', ControlRight: '오른쪽 Ctrl',
  AltLeft: '왼쪽 Alt', AltRight: '오른쪽 Alt', MetaLeft: '왼쪽 ⌘/Win', MetaRight: '오른쪽 ⌘/Win', Backspace: 'Backspace', Delete: 'Del',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Quote: "'", Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
  Semicolon: ';', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`', CapsLock: 'Caps Lock', Insert: 'Ins',
  PageUp: 'PgUp', PageDown: 'PgDn', Home: 'Home', End: 'End', ContextMenu: 'Menu',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
  Lang1: '한/영', Lang2: '한자', HangulMode: '한/영', HanjaMode: '한자',
};
export function keyLabel(code) {
  if (!code) return '없음';
  if (/^Key[A-Z]$/.test(code)) return code[3];
  if (/^Digit\d$/.test(code)) return code[5];
  return NAMES[code] || code;
}
