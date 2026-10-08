import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { computeStockPieces, piecesFromPurchaseLine, assertSufficientStock, roundStock } from './stock.util';

test('piecesFromPurchaseLine: piece vs pack', () => {
  assert.equal(piecesFromPurchaseLine({ quantity: 5, unit: 'قطعة' }), 5);
  assert.equal(piecesFromPurchaseLine({ quantity: 2, unit: 'PACK', piecesPerPack: 10 }), 20);
  assert.equal(piecesFromPurchaseLine({ quantity: 2, unit: 'علبة', piecesPerPack: 12 }), 24);
});

test('computeStockPieces: purchase - return + movements', () => {
  const stock = computeStockPieces({
    purchases: [
      { quantity: 10, unit: 'قطعة' },
      { quantity: 1, unit: 'PACK', piecesPerPack: 10 },
    ],
    returns: [{ quantity: 2, unit: 'قطعة' }],
    movements: [
      { quantity: -5, type: 'SALE' },
      { quantity: 1, type: 'ADJUSTMENT' },
    ],
  });
  // 10 + 10 - 2 - 5 + 1 = 14
  assert.equal(stock, 14);
});

test('assertSufficientStock throws when oversold', () => {
  assert.throws(() => assertSufficientStock(3, 5, 'قلم'), /الرصيد غير كاف/);
  assert.doesNotThrow(() => assertSufficientStock(5, 5, 'قلم'));
});

test('roundStock', () => {
  assert.equal(roundStock(1.23456), 1.235);
});
