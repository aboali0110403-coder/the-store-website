import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

test('resolveShippingRate prefers normalized area rates and falls back only to an explicit governorate default', () => {
  const rates = [
    { governorate: 'Cairo', area: '', fee_egp: 60, is_active: true },
    { governorate: 'Cairo', area: 'Zamalek', fee_egp: 75, is_active: true },
    { governorate: 'Cairo', area: 'Maadi', fee_egp: 80, is_active: true },
    { governorate: 'Alexandria', area: 'Smouha', fee_egp: 85, is_active: true },
    { governorate: 'Giza', area: 'Dokki', fee_egp: 65, is_active: false },
    { governorate: 'Giza', area: '', fee_egp: 60, is_active: true },
    { governorate: 'Aswan', area: '', fee_egp: 120, is_active: false },
  ];

  const exact = resolveShippingRate(' cairo ', ' zamalek ', rates);
  assert.deepEqual(exact, { fee: 75, isConfigured: true });

  const explicitDefault = resolveShippingRate('Cairo', 'Heliopolis', rates);
  assert.deepEqual(explicitDefault, { fee: 60, isConfigured: true });

  const blankAreaUsesDefault = resolveShippingRate('Cairo', '', rates);
  assert.deepEqual(blankAreaUsesDefault, { fee: 60, isConfigured: true });

  const inactiveAreaUsesDefault = resolveShippingRate('Giza', 'Dokki', rates);
  assert.deepEqual(inactiveAreaUsesDefault, { fee: 60, isConfigured: true });

  const exactWithoutFallback = resolveShippingRate('Alexandria', 'Borg El Arab', rates);
  assert.deepEqual(exactWithoutFallback, { fee: 0, isConfigured: false });

  const inactiveDefault = resolveShippingRate('Aswan', 'Any Area', rates);
  assert.deepEqual(inactiveDefault, { fee: 0, isConfigured: false });

  const unknownGovernorate = resolveShippingRate('Matrouh', 'Marsa Matrouh', rates);
  assert.deepEqual(unknownGovernorate, { fee: 0, isConfigured: false });

  const ambiguous = resolveShippingRate('Cairo', 'Zamalek', [
    ...rates,
    { governorate: 'CAIRO', area: ' ZAMALEK ', fee_egp: 90, is_active: true },
  ]);
  assert.deepEqual(ambiguous, { fee: 0, isConfigured: false });
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

test('TrackOrder reuses lookup credentials for realtime, polling, and manual refresh', () => {
  const trackingPage = readFileSync(join(process.cwd(), 'src', 'pages', 'TrackOrder.tsx'), 'utf8');

  assert.match(trackingPage, /lookupCredentialsRef = useRef/);
  assert.match(trackingPage, /phone: phoneParam\?\.trim\(\) \|\| undefined/);
  assert.match(trackingPage, /token: token\?\.trim\(\) \|\| undefined/);
  assert.equal(
    (trackingPage.match(/performLookup\(order\.order_number, credentials\.phone, credentials\.token, false\)/g) || []).length,
    3
  );
  assert.match(trackingPage, /performLookup\(urlOrder, urlPhone \|\| undefined, urlToken \|\| undefined, true\)/);
});

test('Phase 6 migration contract preserves sole trigger history, idempotency, cancellation stock restore, and private notes', () => {
  const migrationDirectory = join(process.cwd(), 'supabase', 'migrations');
  const migrationName = readdirSync(migrationDirectory).find((name) =>
    name.endsWith('_phase6_forward_only_order_shipping_integrity.sql')
  );
  assert.ok(migrationName, 'the generated Phase 6 migration must exist');
  const migration = readFileSync(join(migrationDirectory, migrationName), 'utf8');

  const getFunction = (name: string) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.notEqual(start, -1, `migration must replace public.${name}`);
    const end = migration.indexOf('$function$;', start);
    assert.notEqual(end, -1, `public.${name} must have a complete dollar-quoted body`);
    return migration.slice(start, end + '$function$;'.length);
  };

  const submit = getFunction('submit_store_order');
  const updateStatus = getFunction('admin_update_order_status');
  const lookup = getFunction('lookup_public_order');

  assert.doesNotMatch(submit, /INSERT\s+INTO\s+public\.order_status_history/i);
  assert.doesNotMatch(updateStatus, /INSERT\s+INTO\s+public\.order_status_history/i);
  assert.match(migration, /orders_record_status_history/);
  assert.match(submit, /pg_advisory_xact_lock/);
  assert.match(submit, /IF FOUND THEN RETURN NEXT; RETURN; END IF;/);
  assert.match(updateStatus, /v_new_status = 'cancelled'/);
  assert.match(updateStatus, /stock = stock \+ v_item\.quantity/);
  assert.match(updateStatus, /admin_notes = coalesce\(p_note, admin_notes\)/i);
  assert.match(lookup, /CASE WHEN public\.is_admin\(\) THEN h\.note ELSE NULL END/);
  assert.match(lookup, /o\.tracking_token::text\s*=\s*trim\(p_tracking_token\)/);
  assert.match(lookup, /length\(regexp_replace\(trim\(p_phone\)/);

  const rateResolution = submit.match(/-- Resolve selected area[\s\S]*?-- End shipping resolution/);
  assert.ok(rateResolution, 'migration must mark the deterministic shipping-resolution block');
  assert.match(rateResolution[0], /sr\.area/);
  assert.match(rateResolution[0], /Multiple active shipping rates/);
  assert.match(rateResolution[0], /Shipping rate is not configured/);
  assert.doesNotMatch(rateResolution[0], /LIMIT\s+1/i);
});
