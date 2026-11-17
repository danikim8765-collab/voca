// 컴퓨터 단축키 (설정 > 단축키): 퀴즈에서 누를 키를 직접 정함.
// 키는 자판 자리(e.code)로 저장해서 한글 자판 상태여도 같은 자리면 먹음. 이 기기에만 저장 (키보드가 기기마다 달라서)
// Shift·Ctrl·Alt·⌘ 같은 조합 키는 '혼자 눌렀다 떼면'으로 씀 (Shift+글자로 대문자 친 건 안 먹음)

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

const MODS = { ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Meta', MetaRight: 'Meta', OSLeft: 'Meta', OSRight: 'Meta' };

// 왼쪽·오른쪽 Shift는 같은 키, 숫자 패드 숫자는 위 숫자와 같은 키, 숫자 패드 Enter는 Enter
export function normKey(code) {
  code = String(code || '');
  if (MODS[code]) return MODS[code];
  if (code === 'NumpadEnter') return 'Enter';
  const m = /^Numpad(\d)$/.exec(code);
  return m ? 'Digit' + m[1] : code;
}
export const isModKey = c => c === 'Shift' || c === 'Control' || c === 'Alt' || c === 'Meta';
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
    if (c && (!/^[A-Za-z0-9]{1,24}$/.test(c) || FIXED_KEYS.includes(c) || used.has(c))) c = '';
    if (c) used.add(c);
    out[a] = c;
  }
  return out;
}

// action에 code를 붙임. 다른 동작이 쓰던 키면 서로 맞바꿈 (code ''이면 지움)
export function assignKey(map, action, code) {
  const m = cleanKeys(map);
  code = normKey(code);
  if (!(action in m) || FIXED_KEYS.includes(code)) return { map: m, swapped: null };
  const other = code ? Object.keys(m).find(a => a !== action && m[a] === code) || null : null;
  if (other) m[other] = m[action];
  m[action] = code;
  return { map: m, swapped: other };
}

export function actionFor(map, code) {
  code = normKey(code);
  if (!code) return null;
  return Object.keys(map).find(a => map[a] === code) || null;
}

const NAMES = {
  Space: 'Space', Escape: 'Esc', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: '⌘/Win', Backspace: 'Backspace', Delete: 'Del',
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
