import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JsonSplitter } from './rl/stream.ts';

test('splits JSON objects that follow each other without separators', () => {
  const s = new JsonSplitter();
  assert.deepEqual(s.push('{"Event":"A","Data":{}}{"Event":"B","Data":{"x":"}{"}}'), [{ Event: 'A', Data: {} }, { Event: 'B', Data: { x: '}{' } }]);
});

test('keeps a half message until the rest arrives', () => {
  const s = new JsonSplitter();
  assert.deepEqual(s.push('{"Event":"Upd'), []);
  assert.deepEqual(s.push('ateState","Data":{"a":"\\"}"}}'), [{ Event: 'UpdateState', Data: { a: '"}' } }]);
});
