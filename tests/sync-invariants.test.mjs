import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkspace, mergeBusiness } from '../worker.js';

function state(overrides = {}) {
  return {
    version: 6,
    users: [],
    currentUser: null,
    settings: {},
    prices: [],
    sales: [],
    collections: [],
    milk: [],
    stockPurchases: [],
    stockUsage: [],
    expenses: [],
    customers: [],
    vendors: [],
    vendorPayments: [],
    cashChecks: [],
    cashOpenings: [],
    audit: [],
    customerSales: [],
    customerPayments: [],
    customerBills: [],
    customerOpeningBalances: [],
    internalTransfers: [],
    milkPriceVarieties: [],
    __tombstones: {},
    ...overrides
  };
}

test('sync retries merge by stable ID without duplicates', () => {
  const first = state({ sales: [{ id: 'sale-1', businessId: 'hiren', amount: 100 }] });
  const merged = mergeBusiness(first, state({ sales: [{ id: 'sale-1', businessId: 'hiren', amount: 100 }] }), {}, 'hiren', 'u_owner');
  assert.equal(merged.sales.length, 1);
  assert.equal(merged.sales[0].amount, 100);
});

test('a cloud tombstone blocks a stale record from being recreated', () => {
  const existing = state({ sales: [{ id: 'sale-1', businessId: 'hiren', amount: 100 }] });
  const deleted = mergeWorkspace(existing, state({ sales: [{ id: 'sale-1', businessId: 'hiren', amount: 100 }] }), 'hiren', { sales: ['sale-1'] }, 'u_owner');
  assert.equal(deleted.sales.length, 0);
  assert.ok(deleted.__tombstones.sales['sale-1']);
  const staleRetry = mergeWorkspace(deleted, state({ sales: [{ id: 'sale-1', businessId: 'hiren', amount: 100 }] }), 'hiren', {}, 'u_owner');
  assert.equal(staleRetry.sales.length, 0);
  assert.ok(staleRetry.__tombstones.sales['sale-1']);
});

test('Hiren sync preserves Akash partition and Hiren records', () => {
  const remote = state({
    sales: [{ id: 'hiren-sale', businessId: 'hiren', amount: 100 }],
    settings: { __businesses: { akash: state({ sales: [{ id: 'akash-sale', businessId: 'akash', amount: 200 }] }) } }
  });
  const merged = mergeWorkspace(remote, state({ sales: [] }), 'hiren', {}, 'u_owner');
  assert.equal(merged.sales.length, 1);
  assert.equal(merged.sales[0].id, 'hiren-sale');
  assert.equal(merged.settings.__businesses.akash.sales[0].id, 'akash-sale');
});

test('Akash sync cannot overwrite Hiren partition', () => {
  const remote = state({
    sales: [{ id: 'hiren-sale', businessId: 'hiren', amount: 100 }],
    settings: { __businesses: { akash: state({ sales: [] }) } }
  });
  const incoming = state({ settings: { __businesses: { akash: state({ sales: [{ id: 'akash-sale', businessId: 'akash', amount: 200 }] }) } } });
  const merged = mergeWorkspace(remote, incoming, 'akash', {}, 'u_akash');
  assert.equal(merged.sales[0].id, 'hiren-sale');
  assert.equal(merged.settings.__businesses.akash.sales.length, 1);
  assert.equal(merged.settings.__businesses.akash.sales[0].id, 'akash-sale');
});

test('cross-business records are rejected instead of silently synced', () => {
  assert.throws(
    () => mergeWorkspace(state(), state({ sales: [{ id: 'foreign-sale', businessId: 'akash', amount: 100 }] }), 'hiren', {}, 'u_owner'),
    /belongs to akash/
  );
});

test('internal transfers and customer opening balances remain in Hiren partition', () => {
  const remote = state({ settings: { __businesses: { akash: state() } } });
  const incoming = state({
    internalTransfers: [{ id: 'transfer-1', businessId: 'hiren', amount: 300 }],
    customerOpeningBalances: [{ id: 'opening-1', businessId: 'hiren', customerId: 'customer-1', amount: 500 }]
  });
  const merged = mergeWorkspace(remote, incoming, 'hiren', {}, 'u_owner');
  assert.equal(merged.internalTransfers.length, 1);
  assert.equal(merged.customerOpeningBalances.length, 1);
  const akashAttempt = mergeWorkspace(merged, state({ settings: { __businesses: { akash: state({ internalTransfers: [{ id: 'wrong-transfer', businessId: 'akash', amount: 5 }] }) } } }), 'akash', {}, 'u_akash');
  assert.equal(akashAttempt.settings.__businesses.akash.internalTransfers.length, 0);
});
