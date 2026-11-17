import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { clean, DEFAULT, MODE_DEFAULT } = require('../js/look.js');

test('꾸미기: 비었거나 고장 난 값이면 기본값', () => {
  for (const bad of [null, undefined, 'x', 3, []]) {
    const o = clean(bad);
    assert.equal(o.theme, DEFAULT.theme);
    assert.deepEqual(o.ex, MODE_DEFAULT.ex);
    assert.deepEqual(o.word, MODE_DEFAULT.word);
    assert.deepEqual(o.hide, []);
    assert.equal(o.sound, false);
  }
});

test('꾸미기: 고를 수 있는 값만 남김, 모드마다 색·카드·바탕은 따로', () => {
  const o = clean({ theme: 'dark', size: 'huge', font: 'serif', hide: ['days', 'today', 'coach', 'days'], sound: 'yes', buzz: true,
    ex: { accent: 'grape', edge: 'line', glow: 'rainbow' }, word: { accent: 'pink' } });
  assert.equal(o.theme, 'dark');
  assert.equal(o.size, 'm');           // 없는 크기 → 보통
  assert.equal(o.font, 'serif');
  assert.deepEqual(o.hide, ['coach', 'days']); // '오늘' 카드는 못 숨김, 겹친 건 하나로
  assert.equal(o.sound, false);        // true만 켬
  assert.equal(o.buzz, true);
  assert.deepEqual(o.ex, { accent: 'grape', edge: 'line', glow: 'warm' });
  assert.deepEqual(o.word, MODE_DEFAULT.word);
});
