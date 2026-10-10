import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePayment, customerBalance } from './credit-payment.util';
import { roundMoney } from './money.util';

test('allocate full payment across oldest invoices first', () => {
  const open = [
    { id: 'a', remaining: 100 },
    { id: 'b', remaining: 50 },
  ];
  const { allocations, leftover } = allocatePayment(open, 120);
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].saleId, 'a');
  assert.equal(allocations[0].applied, 100);
  assert.equal(allocations[0].remainingAfter, 0);
  assert.equal(allocations[1].saleId, 'b');
  assert.equal(allocations[1].applied, 20);
  assert.equal(allocations[1].remainingAfter, 30);
  assert.equal(leftover, 0);
});

test('allocate to specific invoice only', () => {
  const open = [
    { id: 'a', remaining: 100 },
    { id: 'b', remaining: 50 },
  ];
  const { allocations, leftover } = allocatePayment(open, 40, 'b');
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0].saleId, 'b');
  assert.equal(allocations[0].applied, 40);
  assert.equal(leftover, 0);
});

test('overpay leaves leftover', () => {
  const open = [{ id: 'a', remaining: 10 }];
  const { allocations, leftover } = allocatePayment(open, 25);
  assert.equal(allocations[0].applied, 10);
  assert.equal(leftover, 15);
});

test('customer balance after partial credit sales', () => {
  const sales = [
    { total: 200, paidAmount: 50 },
    { total: 100, paidAmount: 100 },
  ];
  assert.equal(customerBalance(sales), 150);
});

test('sale line and credit remaining consistency', () => {
  const total = roundMoney(3 * 19.99);
  const paid = 20;
  const remaining = Math.max(0, roundMoney(total - paid));
  assert.equal(total, 59.97);
  assert.equal(remaining, 39.97);
});
