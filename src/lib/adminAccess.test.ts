import assert from 'node:assert/strict';
import test from 'node:test';
import { createLatestGate, resolveAdminAccess } from './adminAccess.ts';
import { shippingRateSummary } from './adminLabels.ts';

const row = [{ user_id: 'u1' }];

test('grants only when the allowlist query succeeds with a row', async () => {
  assert.equal(await resolveAdminAccess(async () => ({ data: row, error: null })), 'granted');
});

test('denies when the query succeeds with no rows or null data', async () => {
  assert.equal(await resolveAdminAccess(async () => ({ data: [], error: null })), 'denied');
  assert.equal(await resolveAdminAccess(async () => ({ data: null, error: null })), 'denied');
});

test('a query error is an error, never granted and never reported as denied', async () => {
  let calls = 0;
  const result = await resolveAdminAccess(async () => {
    calls++;
    return { data: null, error: { message: 'boom' } };
  });
  assert.equal(result, 'error');
  assert.equal(calls, 2);
});

test('a thrown query is an error and fails closed', async () => {
  const result = await resolveAdminAccess(async () => {
    throw new Error('network');
  });
  assert.equal(result, 'error');
});

test('retries once after a transient error and then grants', async () => {
  let calls = 0;
  const result = await resolveAdminAccess(async () => {
    calls++;
    return calls === 1 ? { data: null, error: { message: 'transient' } } : { data: row, error: null };
  });
  assert.equal(result, 'granted');
  assert.equal(calls, 2);
});

test('does not retry a definitive denial', async () => {
  let calls = 0;
  const result = await resolveAdminAccess(async () => {
    calls++;
    return { data: [], error: null };
  });
  assert.equal(result, 'denied');
  assert.equal(calls, 1);
});

test('an older check cannot apply after a newer one started', () => {
  const gate = createLatestGate();
  const first = gate.start();
  const second = gate.start();
  assert.equal(first(), false);
  assert.equal(second(), true);
});

test('invalidate (sign-out) stops any in-flight check from applying', () => {
  const gate = createLatestGate();
  const check = gate.start();
  gate.invalidate();
  assert.equal(check(), false);
});

test('shipping summary is localized and does not alter stored values', () => {
  const rate = { fee_egp: 75, estimated_min_days: 2, estimated_max_days: 4, is_active: true };
  assert.equal(shippingRateSummary(rate, false), '75 EGP · 2–4 days · Active');
  assert.equal(shippingRateSummary(rate, true), '75 جنيه · 2–4 أيام · مفعّل');
  assert.equal(shippingRateSummary({ ...rate, is_active: false }, true), '75 جنيه · 2–4 أيام · غير مفعّل');
  assert.equal(shippingRateSummary({ ...rate, is_active: false }, false), '75 EGP · 2–4 days · Inactive');
});
