import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { lineTotal, roundMoney, sumMoney } from './money.util';

test('roundMoney', () => {
  assert.equal(roundMoney(10.1 + 0.2), 10.3);
  assert.equal(roundMoney(1.005), 1.01);
});

test('lineTotal', () => {
  assert.equal(lineTotal(3, 10.5), 31.5);
  assert.equal(lineTotal(2, 0.1), 0.2);
});

test('sumMoney', () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
});
