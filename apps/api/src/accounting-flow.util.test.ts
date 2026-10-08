import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyRound, lineTotal as lt } from './money.util';

test('purchase then sale then return balances', () => {
  const buyQty = 10;
  const buyCost = 100;
  const purchaseTotal = moneyRound(buyQty * buyCost);
  const sellQty = 3;
  const sellPrice = 150;
  const saleTotal = moneyRound(sellQty * sellPrice);
  const cogs = moneyRound(sellQty * buyCost);
  const gross = moneyRound(saleTotal - cogs);
  const returnQty = 1;
  const refund = moneyRound(returnQty * sellPrice);
  const stockAfter = buyQty - sellQty + returnQty;
  assert.equal(purchaseTotal, 1000);
  assert.equal(saleTotal, 450);
  assert.equal(gross, 150);
  assert.equal(refund, 150);
  assert.equal(stockAfter, 8);
  assert.equal(lt(2, 19.99), moneyRound(2 * 19.99));
});
