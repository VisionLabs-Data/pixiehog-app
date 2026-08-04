/**
 * Run with: npx tsx app/common.server/compliance.check.ts
 *
 * The one thing that must never regress: a privacy webhook's audit line cannot
 * contain the contact details the request exists to erase. The handlers this
 * replaced logged the whole payload, so customer email and phone landed in the
 * platform log stream — a durable copy created BY the erasure request.
 */
import assert from 'node:assert';
import { complianceAuditRecord } from './compliance';

/* ── An audit line never carries customer contact details ─────────────────── */
{
  const record = complianceAuditRecord(
    'customers/redact',
    'shop.myshopify.com',
    {
      customer: { id: 191167, email: 'shopper@example.com', phone: '+15551234567' },
      orders_to_redact: [299938, 299939, 299940],
    },
    { erased_records: 0 },
  );

  const serialized = JSON.stringify(record);
  for (const pii of ['shopper@example.com', '+15551234567', 'shopper', '5551234567']) {
    assert.ok(!serialized.includes(pii), `audit line must not contain ${pii}`);
  }

  assert.strictEqual(record.customer_id, '191167', 'the Shopify customer id traces the request');
  assert.strictEqual(record.orders_in_scope, 3, 'orders in scope are counted, not copied');
  assert.strictEqual(record.topic, 'customers/redact');
  assert.strictEqual(record.shop, 'shop.myshopify.com');
}

/* ── A data request reads its own id and order list shape ─────────────────── */
{
  const record = complianceAuditRecord(
    'customers/data_request',
    'shop.myshopify.com',
    {
      customer: { id: '191167', email: 'shopper@example.com' },
      orders_requested: [299938],
      data_request: { id: 9999 },
    },
    { disclosed_records: 0 },
  );
  assert.strictEqual(record.data_request_id, '9999', 'the data request id is recorded');
  assert.strictEqual(record.orders_in_scope, 1);
  assert.ok(!JSON.stringify(record).includes('shopper@example.com'));
}

/* ── shop/redact has no customer block — must not throw or invent one ─────── */
for (const payload of [{ shop_id: 954889, shop_domain: 'shop.myshopify.com' }, {}, null, undefined]) {
  const record = complianceAuditRecord('shop/redact', 'shop.myshopify.com', payload, {
    sessions_deleted: 2,
  });
  assert.strictEqual(record.customer_id, null, 'no customer block means no customer id');
  assert.strictEqual(record.data_request_id, null);
  assert.strictEqual(record.orders_in_scope, 0);
  assert.strictEqual(record.sessions_deleted, 2, 'the outcome is what proves we acted');
}

/* ── Unexpected payload shapes degrade instead of throwing ────────────────── */
{
  const record = complianceAuditRecord(
    'customers/redact',
    'shop.myshopify.com',
    { customer: { id: undefined }, orders_to_redact: 'not-an-array' as unknown as unknown[] },
    {},
  );
  assert.strictEqual(record.customer_id, null);
  assert.strictEqual(record.orders_in_scope, 0, 'a non-array order list counts as none');
}

console.log('compliance: privacy audit lines carry ids and outcomes, never contact details ✓');
