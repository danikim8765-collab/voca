import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanKeys, assignKey, actionFor, normKey, keyLabel, kbTypes, isTypingKey, KEY_DEFAULT } from '../js/keys.js';

test('단축키: 비었거나 고장 난 값이면 기본값', () => {
  for (const bad of [null, undefined, 'x', 3, []]) assert.deepEqual(cleanKeys(bad), KEY_DEFAULT);
  assert.equal(cleanKeys({ hint: 5 }).hint, 'Shift');
});

test('단축키: 없음(\'\')은 그대로, 못 쓰는 키·겹친 키는 비움', () => {
  const m = cleanKeys({ idk: '', hint: 'Enter', speak: 'KeyS', next: 'KeyS', quit: '<x>', mark: '' });
  assert.equal(m.idk, '');
  assert.equal(m.hint, '');
  assert.equal(m.next, 'KeyS'); // 겹치면 목록 앞쪽(계속하기)이 가짐
  assert.equal(m.speak, '');
  assert.equal(m.quit, '');
});

test('단축키: 같은 키를 붙이면 서로 맞바꿈, 빈 키면 지움', () => {
  const r = assignKey(KEY_DEFAULT, 'hint', 'Digit1');
  assert.equal(r.swapped, 'c1');
  assert.equal(r.map.hint, 'Digit1');
  assert.equal(r.map.c1, 'Shift');
  const r2 = assignKey(r.map, 'c1', '');
  assert.equal(r2.map.c1, '');
  assert.equal(r2.swapped, null);
  assert.equal(assignKey(KEY_DEFAULT, 'mark', 'Enter').map.mark, 'Space'); // Enter는 못 바꿈
  const r3 = assignKey(KEY_DEFAULT, 'next', 'Space'); // 계속하기를 Space로 돌리면 형광펜은 없음으로
  assert.equal(r3.map.next, 'Space');
  assert.equal(r3.map.mark, '');
});

test('단축키: 왼·오른 Shift, 숫자 패드 숫자는 같은 키', () => {
  assert.equal(normKey('ShiftRight'), 'Shift');
  assert.equal(normKey('Numpad3'), 'Digit3');
  assert.equal(normKey('NumpadEnter'), 'Enter');
  assert.equal(actionFor(KEY_DEFAULT, 'Numpad2'), 'c2');
  assert.equal(actionFor(KEY_DEFAULT, 'ShiftLeft'), 'hint');
  assert.equal(actionFor(KEY_DEFAULT, 'KeyZ'), null);
});

test('단축키: 이름과 글자 키 구분', () => {
  assert.equal(keyLabel('KeyQ'), 'Q');
  assert.equal(keyLabel('Digit4'), '4');
  assert.equal(keyLabel('Escape'), 'Esc');
  assert.equal(keyLabel(''), '없음');
  assert.ok(kbTypes('KeyQ') && kbTypes('Space') && !kbTypes('Digit1') && !kbTypes('Escape'));
  assert.ok(isTypingKey('Digit1') && isTypingKey('Slash') && !isTypingKey('F2') && !isTypingKey('ArrowLeft'));
});
