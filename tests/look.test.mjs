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
  assert.deepEqual(o.ex, { accent: 'grape', edge: 'line', glow: MODE_DEFAULT.ex.glow }); // 없는 바탕 → 기본
  assert.deepEqual(o.word, MODE_DEFAULT.word);
});

test('꾸미기: 예전 판에 저장된 기본값(그림자·피치 바탕·테두리)은 새 기본(평평하게·단색)으로, 일부러 고른 건 그대로', () => {
  const old = clean({ ex: { accent: 'navy', edge: 'shadow', glow: 'warm' }, word: { edge: 'line', glow: 'sky' } });
  assert.deepEqual(old.ex, MODE_DEFAULT.ex);
  assert.equal(old.word.edge, MODE_DEFAULT.word.edge);
  assert.equal(old.word.glow, 'sky');
  const now = clean({ v: 2, ex: { edge: 'shadow', glow: 'warm' } }); // 새 판에서 고른 그림자·피치는 그대로
  assert.equal(now.ex.edge, 'shadow');
  assert.equal(now.ex.glow, 'warm');
  assert.equal(clean(now).ex.edge, 'shadow'); // 다시 정리해도 그대로
});

test('꾸미기 합치기: 바꾼 시각이 더 최근인 쪽, 기기마다인 share는 빼고', () => {
  const { mergeLook, shared } = require('../js/look.js');
  assert.equal(mergeLook({ at: 5, size: 'l' }, { at: 9, size: 's' }).size, 's');
  assert.equal(mergeLook({ at: 9, size: 'l' }, { at: 5, size: 's' }).size, 'l');
  assert.equal(mergeLook({ at: 5, size: 'l' }, { at: 5, size: 's' }).size, 'l'); // 같으면 이 기기
  assert.equal(mergeLook({ size: 'l' }, null).size, 'l');
  assert.equal(mergeLook(null, null), null);
  assert.ok(!('share' in shared({ share: false })));
});
