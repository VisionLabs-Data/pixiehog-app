/**
 * Runnable check for orderToMythicEvent.
 * Run: node app/common.server/mythic/order-to-event.check.ts
 * (Node 22.18+ strips TS types natively.)
 */
import assert from 'node:assert';
import { orderToMythicEvent } from './order-to-event.ts';

// --- orders/create ---
const created = orderToMythicEvent('ORDERS_CREATE', {
  id: 12345,
  order_number: 1001,
  email: 'buyer@example.com',
  created_at: '2026-07-15T10:00:00Z',
  total_price: '80.00',
  subtotal_price: '75.00',
  total_tax: '2.00',
  total_discounts: '15.00',
  currency: 'USD',
  discount_codes: [{ code: 'BLACKFRIDAY' }],
  total_shipping_price_set: { shop_money: { amount: '3.00' } },
  customer: { first_name: 'Ada', last_name: 'L', phone: '+15551234' },
  line_items: [{ product_id: 1, variant_id: 2, sku: 'SKU1', title: 'Tee', price: '30.00', quantity: 2, vendor: 'Acme' }],
})!;
assert.equal(created.event, 'Order Completed');
assert.equal(created.distinct_id, 'buyer@example.com');
assert.equal(created.uuid, 'shopify-order-12345');
assert.equal(created.timestamp, new Date('2026-07-15T10:00:00Z').getTime());
assert.equal(created.properties.total, 80);
assert.equal(created.properties.revenue, 75);
assert.equal(created.properties.shipping, 3);
assert.equal(created.properties.coupon, 'BLACKFRIDAY');
assert.deepEqual((created.properties.$set as any).email, 'buyer@example.com');
assert.equal((created.properties.products as any[]).length, 1);
assert.equal((created.properties.products as any[])[0].price, 30);

// --- anonymous order falls back to synthetic distinct_id, no $set ---
const anon = orderToMythicEvent('orders/create', { id: 9, line_items: [] })!;
assert.equal(anon.distinct_id, 'shopify-order-9');
assert.equal(anon.properties.$set, undefined);

// --- orders/cancelled ---
const cancelled = orderToMythicEvent('ORDERS_CANCELLED', {
  id: 55,
  cancelled_at: '2026-07-15T12:00:00Z',
  total_price: '10.00',
  currency: 'USD',
  cancel_reason: 'customer',
})!;
assert.equal(cancelled.event, 'Order Cancelled');
assert.equal(cancelled.uuid, 'shopify-order-cancel-55');
assert.equal(cancelled.properties.cancel_reason, 'customer');

// --- refunds/create sums transactions ---
const refund = orderToMythicEvent('REFUNDS_CREATE', {
  id: 777,
  order_id: 55,
  created_at: '2026-07-15T13:00:00Z',
  transactions: [{ amount: '4.00', currency: 'USD' }, { amount: '1.00', currency: 'USD' }],
})!;
assert.equal(refund.event, 'Order Refunded');
assert.equal(refund.distinct_id, 'shopify-order-55');
assert.equal(refund.uuid, 'shopify-refund-777');
assert.equal(refund.properties.total, 5);

// --- unmapped topic returns null ---
assert.equal(orderToMythicEvent('products/update', { id: 1 }), null);

console.log('order-to-event.check.ts: all assertions passed');
