import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { clean, DEFAULT } = require('../js/look.js');

test('꾸미기: 비었거나 고장 난 값이면 기본값 (테마는 오리지널)', () => {
  for (const bad of [null, undefined, 'x', 3, []]) {
    const o = clean(bad);
    assert.equal(o.skin, 'orig');
    assert.equal(o.theme, DEFAULT.theme);
    assert.deepEqual(o.hide, []);
    assert.equal(o.sound, false);
  }
});

test('꾸미기: 고를 수 있는 값만 남김', () => {
  const o = clean({ skin: 'neon', theme: 'dark', size: 'huge', font: 'serif', hide: ['days', 'today', 'coach', 'days'], sound: 'yes', buzz: true });
  assert.equal(o.skin, 'neon');
  assert.equal(o.theme, 'dark');
  assert.equal(o.size, 'm');           // 없는 크기 → 보통
  assert.equal(o.font, 'serif');
  assert.deepEqual(o.hide, ['coach', 'days']); // '오늘' 카드는 못 숨김, 겹친 건 하나로
  assert.equal(o.sound, false);        // true만 켬
  assert.equal(o.buzz, true);
  assert.equal(clean({ skin: 'pink' }).skin, 'orig'); // 없는 테마 → 오리지널
});

test('꾸미기: 없앤 강조 색·모서리·카드·퀴즈 바탕은 예전에 저장돼 있어도 버림', () => {
  const o = clean({ radius: 'square', ex: { accent: 'grape', edge: 'line', glow: 'warm' }, word: { accent: 'coral' }, size: 'l', v: 2 });
  for (const k of ['radius', 'ex', 'word', 'accent', 'edge', 'glow']) assert.ok(!(k in o), k);
  assert.equal(o.size, 'l'); // 남은 건 그대로
  assert.equal(o.skin, 'orig');
  assert.equal(o.v, 3);
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
