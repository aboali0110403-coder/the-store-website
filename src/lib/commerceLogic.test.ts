import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEGP,
  validateCartItem,
  mergeCartItems,
  validateStockAvailability,
  calculateVerifiedSubtotal,
  evaluateCoupon,
  resolveShippingRate,
  computeOrderTotals,
  validateOrderInput,
  checkGuestRateLimit,
  verifyCaptchaAnswer,
  normalizeOrderNumber,
  validateOrderNumberInput,
  computeOrderMilestones,
} from './commerceLogic';

test('formatEGP formats English and Arabic currency correctly', () => {
  assert.equal(formatEGP(1500, 'en'), '1,500 EGP');
  assert.equal(formatEGP(0, 'en'), '0 EGP');
  assert.ok(formatEGP(1500, 'ar').includes('ج.م'));
});

test('validateCartItem enforces required properties and quantity limits', () => {
  assert.equal(validateCartItem({ productId: 'p1', size: 'M', color: 'Burgundy', quantity: 1 }).valid, true);
  assert.equal(validateCartItem({ productId: 'p1', size: 'M', color: 'Burgundy', quantity: 20 }).valid, true);
  assert.equal(validateCartItem({ productId: 'p1', size: 'M', color: 'Burgundy', quantity: 0 }).valid, false);
  assert.equal(validateCartItem({ productId: 'p1', size: 'M', color: 'Burgundy', quantity: 21 }).valid, false);
  assert.equal(validateCartItem({ productId: '', size: 'M', color: 'Burgundy', quantity: 1 }).valid, false);
});

test('mergeCartItems combines duplicates without exceeding maximum quantity', () => {
  const initial = [
    { productId: 'p1', size: 'M', color: 'Gold', quantity: 2 },
    { productId: 'p2', size: 'S', color: 'Ivory', quantity: 1 },
  ];

  // Add same variant
  const merged1 = mergeCartItems(initial, { productId: 'p1', size: 'M', color: 'Gold', quantity: 3 });
  assert.equal(merged1.length, 2);
  assert.equal(merged1[0].quantity, 5);

  // Add different size of same product
  const merged2 = mergeCartItems(merged1, { productId: 'p1', size: 'L', color: 'Gold', quantity: 1 });
  assert.equal(merged2.length, 3);

  // Capped at 20
  const capped = mergeCartItems(initial, { productId: 'p1', size: 'M', color: 'Gold', quantity: 25 });
  assert.equal(capped[0].quantity, 20);
});

test('validateStockAvailability checks stock for ready items and allows made-to-order', () => {
  const catalog = new Map([
    ['p1', { id: 'p1', price_egp: 2500, stock: 5, production_type: 'ready' as const, is_published: true }],
    ['p2', { id: 'p2', price_egp: 4000, stock: 0, production_type: 'made_to_order' as const, is_published: true }],
    ['p3', { id: 'p3', price_egp: 1200, stock: 2, production_type: 'ready' as const, is_published: false }],
    ['p4', { id: 'p4', price_egp: 5500, stock: 1, production_type: 'limited' as const, is_published: true }],
  ]);

  // Valid ready items within stock
  const check1 = validateStockAvailability([{ productId: 'p1', size: 'M', color: 'Gold', quantity: 3 }], catalog);
  assert.equal(check1.valid, true);

  // Exceeding ready stock
  const check2 = validateStockAvailability([{ productId: 'p1', size: 'M', color: 'Gold', quantity: 6 }], catalog);
  assert.equal(check2.valid, false);
  assert.ok(check2.errors[0].includes('Insufficient stock'));

  // Made to order with 0 stock is valid and never blocks order
  const check3 = validateStockAvailability([{ productId: 'p2', size: 'Free', color: 'Rose', quantity: 2 }], catalog);
  assert.equal(check3.valid, true);

  // Unpublished item is rejected
  const check4 = validateStockAvailability([{ productId: 'p3', size: 'S', color: 'Plum', quantity: 1 }], catalog);
  assert.equal(check4.valid, false);
  assert.ok(check4.errors[0].includes('not currently published'));

  // Limited edition within stock
  const check5 = validateStockAvailability([{ productId: 'p4', size: 'Free', color: 'Onyx', quantity: 1 }], catalog);
  assert.equal(check5.valid, true);

  // Limited edition exceeding stock is rejected
  const check6 = validateStockAvailability([{ productId: 'p4', size: 'Free', color: 'Onyx', quantity: 2 }], catalog);
  assert.equal(check6.valid, false);
  assert.ok(check6.errors[0].includes('Insufficient stock'));
});

test('calculateVerifiedSubtotal ignores client-tampered prices', () => {
  const verifiedPrices = new Map([
    ['p1', 2500],
    ['p2', 1500],
  ]);

  const items = [
    { productId: 'p1', size: 'M', color: 'Gold', quantity: 2 },
    { productId: 'p2', size: 'S', color: 'Rose', quantity: 1 },
  ];

  const subtotal = calculateVerifiedSubtotal(items, verifiedPrices);
  assert.equal(subtotal, 2500 * 2 + 1500 * 1); // 6500
});

test('evaluateCoupon verifies percentages, fixed discounts, and minimum orders', () => {
  const percentageCoupon = {
    code: 'ELEGANCE10',
    discount_type: 'percentage' as const,
    discount_value: 10,
    min_order_egp: 1000,
    is_active: true,
  };

  // Valid 10%
  const res1 = evaluateCoupon('elegance10', 5000, percentageCoupon);
  assert.equal(res1.valid, true);
  assert.equal(res1.discount, 500);

  // Below minimum order
  const res2 = evaluateCoupon('ELEGANCE10', 800, percentageCoupon);
  assert.equal(res2.valid, false);
  assert.ok(res2.error?.includes('Minimum order'));

  // Inactive coupon
  const inactiveCoupon = { ...percentageCoupon, is_active: false };
  assert.equal(evaluateCoupon('ELEGANCE10', 5000, inactiveCoupon).valid, false);

  const expiredCoupon = {
    ...percentageCoupon,
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  };
  assert.equal(evaluateCoupon('ELEGANCE10', 5000, expiredCoupon).valid, false);

  // Fixed discount
  const fixedCoupon = {
    code: 'MERO200',
    discount_type: 'fixed' as const,
    discount_value: 200,
    is_active: true,
  };
  assert.equal(evaluateCoupon('MERO200', 1500, fixedCoupon).discount, 200);

  const cappedCoupon = { ...percentageCoupon, max_discount_egp: 300 };
  assert.equal(evaluateCoupon('ELEGANCE10', 5000, cappedCoupon).discount, 300);

  const futureCoupon = {
    ...percentageCoupon,
    starts_at: new Date(Date.now() + 60_000).toISOString(),
  };
  assert.equal(evaluateCoupon('ELEGANCE10', 5000, futureCoupon).valid, false);
  assert.equal(evaluateCoupon('UNKNOWN', 5000, percentageCoupon).valid, false);
  assert.equal(evaluateCoupon('', 5000, null).valid, false);
});

test('resolveShippingRate correctly maps governorates and handles unconfigured ones', () => {
  const rates = [
    { governorate: 'Cairo', fee_egp: 60, is_active: true },
    { governorate: 'Alexandria', fee_egp: 85, is_active: true },
    { governorate: 'Aswan', fee_egp: 120, is_active: false },
  ];

  const cairo = resolveShippingRate('cairo', rates);
  assert.equal(cairo.isConfigured, true);
  assert.equal(cairo.fee, 60);

  const alex = resolveShippingRate('Alexandria', rates);
  assert.equal(alex.isConfigured, true);
  assert.equal(alex.fee, 85);

  const aswan = resolveShippingRate('Aswan', rates);
  assert.equal(aswan.isConfigured, false); // inactive

  const unconfigured = resolveShippingRate('Matrouh', rates);
  assert.equal(unconfigured.isConfigured, false);
  assert.equal(unconfigured.fee, 0);
});

test('computeOrderTotals produces exact totals without negative numbers', () => {
  const result = computeOrderTotals({
    subtotal: 3000,
    shipping: 75,
    discount: 300,
  });

  assert.equal(result.subtotal, 3000);
  assert.equal(result.shipping, 75);
  assert.equal(result.discount, 300);
  assert.equal(result.total, 2775);

  // Discount exceeding subtotal
  const excess = computeOrderTotals({
    subtotal: 500,
    shipping: 50,
    discount: 800,
  });
  assert.equal(excess.discount, 500);
  assert.equal(excess.total, 50);
});

test('validateOrderInput catches invalid delivery details', () => {
  const valid = validateOrderInput({
    name: 'Fatima El-Sayed',
    phone: '01012345678',
    governorate: 'Cairo',
    city_area: 'Zamalek',
    address: '15 Gezira Street, Apt 4B',
  });
  assert.equal(valid.valid, true);

  const invalid = validateOrderInput({
    name: 'F',
    phone: '123',
    governorate: '',
    city_area: '',
    address: 'Street',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.phone);
  assert.ok(invalid.errors.governorate);
  assert.ok(invalid.errors.city_area);
  assert.ok(invalid.errors.address);
});

test('checkGuestRateLimit enforces sliding window abuse limits', () => {
  const ip = 'client_test_unique_' + Date.now();
  for (let i = 0; i < 5; i++) {
    const res = checkGuestRateLimit(ip, 5, 60000);
    assert.equal(res.allowed, true);
  }

  // 6th request is rejected
  const rejected = checkGuestRateLimit(ip, 5, 60000);
  assert.equal(rejected.allowed, false);
  assert.ok(rejected.retryAfterSeconds && rejected.retryAfterSeconds > 0);
});

test('verifyCaptchaAnswer validates arithmetic answers correctly', () => {
  assert.equal(verifyCaptchaAnswer(14, '14'), true);
  assert.equal(verifyCaptchaAnswer(14, 14), true);
  assert.equal(verifyCaptchaAnswer(14, '15'), false);
  assert.equal(verifyCaptchaAnswer(14, 'abc'), false);
});

test('normalizeOrderNumber and validateOrderNumberInput properly format and check order references', () => {
  assert.equal(normalizeOrderNumber('1001'), 'MERO-1001');
  assert.equal(normalizeOrderNumber('mero-1001'), 'MERO-1001');
  assert.equal(normalizeOrderNumber('  MERO-2026-X1  '), 'MERO-2026-X1');

  const valid = validateOrderNumberInput('MERO-1001');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, 'MERO-1001');

  const shortValid = validateOrderNumberInput('1002');
  assert.equal(shortValid.valid, true);
  assert.equal(shortValid.normalized, 'MERO-1002');

  const empty = validateOrderNumberInput('');
  assert.equal(empty.valid, false);

  const invalid = validateOrderNumberInput('$$');
  assert.equal(invalid.valid, false);
});

test('computeOrderMilestones derives correct 5-step progression states', () => {
  // Pending: step 1 is current, 2..5 are upcoming
  const pendingMilestones = computeOrderMilestones('pending');
  assert.equal(pendingMilestones.length, 5);
  assert.equal(pendingMilestones[0].progress, 'current');
  assert.equal(pendingMilestones[1].progress, 'upcoming');

  // In production: step 1 & 2 completed, step 3 is current, 4 & 5 upcoming
  const inProdMilestones = computeOrderMilestones('in_production');
  assert.equal(inProdMilestones[0].progress, 'completed');
  assert.equal(inProdMilestones[1].progress, 'completed');
  assert.equal(inProdMilestones[2].progress, 'current');
  assert.equal(inProdMilestones[3].progress, 'upcoming');
  assert.equal(inProdMilestones[4].progress, 'upcoming');

  // Delivered: all 5 are completed (or last step completed/reached)
  const deliveredMilestones = computeOrderMilestones('delivered');
  assert.equal(deliveredMilestones[0].progress, 'completed');
  assert.equal(deliveredMilestones[1].progress, 'completed');
  assert.equal(deliveredMilestones[2].progress, 'completed');
  assert.equal(deliveredMilestones[3].progress, 'completed');
  assert.equal(deliveredMilestones[4].progress, 'current');
});

test('multi-item mixed cart validates ready stock while exempting made_to_order', () => {
  const catalog = new Map([
    ['ready-item', { id: 'ready-item', price_egp: 3000, stock: 2, production_type: 'ready' as const, is_published: true }],
    ['bespoke-item', { id: 'bespoke-item', price_egp: 7500, stock: 0, production_type: 'made_to_order' as const, is_published: true }],
    ['limited-item', { id: 'limited-item', price_egp: 6000, stock: 1, production_type: 'limited' as const, is_published: true }],
  ]);

  // Mixed cart within available limits
  const validCart = [
    { productId: 'ready-item', size: 'M', color: 'Black', quantity: 2 },
    { productId: 'bespoke-item', size: 'Tailored', color: 'Ivory', quantity: 3 }, // 0 stock but made_to_order
    { productId: 'limited-item', size: 'L', color: 'Gold', quantity: 1 },
  ];
  const checkPass = validateStockAvailability(validCart, catalog);
  assert.equal(checkPass.valid, true);

  // Exceeding ready stock fails
  const invalidCart = [
    { productId: 'ready-item', size: 'M', color: 'Black', quantity: 3 }, // only 2 in stock
    { productId: 'bespoke-item', size: 'Tailored', color: 'Ivory', quantity: 5 },
  ];
  const checkFail = validateStockAvailability(invalidCart, catalog);
  assert.equal(checkFail.valid, false);
  assert.ok(checkFail.errors[0].includes('Insufficient stock'));
});
