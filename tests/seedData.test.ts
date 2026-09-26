import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_ACTIVITY, INITIAL_EXCEPTIONS, INITIAL_SHIFT_MESSAGES } from '../src/seedData';
import { isFirstShift } from '../src/yardRules';

test('sample lists are newest first, like entries the server adds', () => {
  for (const list of [INITIAL_ACTIVITY, INITIAL_EXCEPTIONS, INITIAL_SHIFT_MESSAGES]) {
    const times = list.map(item => Date.parse(item.timestamp));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  }
});

test('sample notes are filed under the shift of their plant time', () => {
  for (const m of INITIAL_SHIFT_MESSAGES) {
    const shift = isFirstShift(m.timestamp) ? '1st Shift' : '2nd Shift';
    assert.equal(m.shift, shift, m.id);
    // A supervisor's title names the same shift as the log the note is filed under
    if (/Supervisor/.test(m.sender)) assert.match(m.sender, new RegExp(shift));
  }
});
