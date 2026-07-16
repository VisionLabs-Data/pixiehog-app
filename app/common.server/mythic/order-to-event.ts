/**
 * Pure transform: Shopify order/refund webhook payload -> Mythic server event.
 *
 * These are the AUTHORITATIVE conversion signals (server-to-server, can't be
 * blocked by the browser). They reuse the Segment/PostHog ecommerce event names
 * so they line up with the client-side pixel's `Order Completed` etc.
 *
 * Each event carries a STABLE `uuid` derived from the Shopify id so webhook
 * re-deliveries dedupe on Mythic's side.
 * ponytail: no cross-source dedupe vs the browser pixel — Mythic treats the
 * server event as authoritative; suppress the client `checkout_completed` if
 * you need strict one-count-per-order.
 */

export interface MythicServerEvent {
  event: string;
  distinct_id: string;
  uuid: string;
  timestamp: number;
  properties: Record<string, unknown>;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const ts = (s: unknown): number => {
  if (!s) return new Date().getTime();
  const parsed = new Date(String(s)).getTime();
  return Number.isFinite(parsed) ? parsed : new Date().getTime();
};

function orderProducts(order: any) {
  return (order.line_items || []).map((li: any, i: number) => ({
    product_id: li.product_id != null ? String(li.product_id) : null,
    variant_id: li.variant_id != null ? String(li.variant_id) : null,
    sku: li.sku || null,
    name: li.title || li.name || null,
    variant: li.variant_title || null,
    brand: li.vendor || null,
    price: num(li.price),
    quantity: num(li.quantity),
    position: i + 1,
  }));
}

function personSet(order: any): Record<string, unknown> | undefined {
  const email = order.email || order.contact_email || order.customer?.email || null;
  if (!email) return undefined;
  return {
    email,
    ...(order.customer?.first_name ? { first_name: order.customer.first_name } : {}),
    ...(order.customer?.last_name ? { last_name: order.customer.last_name } : {}),
    ...(order.customer?.phone || order.phone ? { phone: order.customer?.phone || order.phone } : {}),
  };
}

/**
 * Returns null for topics we don't map (caller skips forwarding).
 * `topic` is the Shopify webhook topic, e.g. "ORDERS_CREATE" or "orders/create".
 */
export function orderToMythicEvent(topic: string, payload: any): MythicServerEvent | null {
  const t = String(topic).toUpperCase().replace('/', '_');

  if (t === 'ORDERS_CREATE') {
    const order = payload;
    const email = order.email || order.contact_email || order.customer?.email || null;
    return {
      event: 'Order Completed',
      distinct_id: email || `shopify-order-${order.id}`,
      uuid: `shopify-order-${order.id}`,
      timestamp: ts(order.created_at),
      properties: {
        $lib: 'vizhog-shopify-webhook',
        source: 'shopify-webhook',
        order_id: String(order.id),
        order_number: order.order_number ?? order.number ?? null,
        checkout_id: order.checkout_id != null ? String(order.checkout_id) : null,
        affiliation: 'Shopify',
        total: num(order.total_price),
        subtotal: num(order.subtotal_price),
        revenue: num(order.subtotal_price),
        tax: num(order.total_tax),
        shipping: num(order.total_shipping_price_set?.shop_money?.amount),
        discount: num(order.total_discounts),
        currency: order.currency || null,
        coupon: (order.discount_codes || []).map((d: any) => d.code).filter(Boolean).join(',') || null,
        products: orderProducts(order),
        ...(personSet(order) ? { $set: personSet(order) } : {}),
      },
    };
  }

  if (t === 'ORDERS_CANCELLED') {
    const order = payload;
    const email = order.email || order.contact_email || order.customer?.email || null;
    return {
      event: 'Order Cancelled',
      distinct_id: email || `shopify-order-${order.id}`,
      uuid: `shopify-order-cancel-${order.id}`,
      timestamp: ts(order.cancelled_at || order.updated_at),
      properties: {
        $lib: 'vizhog-shopify-webhook',
        source: 'shopify-webhook',
        order_id: String(order.id),
        order_number: order.order_number ?? order.number ?? null,
        affiliation: 'Shopify',
        total: num(order.total_price),
        currency: order.currency || null,
        cancel_reason: order.cancel_reason || null,
        ...(personSet(order) ? { $set: personSet(order) } : {}),
      },
    };
  }

  if (t === 'REFUNDS_CREATE') {
    const refund = payload;
    const amount = (refund.transactions || []).reduce(
      (sum: number, tx: any) => sum + (num(tx.amount) || 0),
      0
    );
    return {
      event: 'Order Refunded',
      distinct_id: `shopify-order-${refund.order_id}`,
      uuid: `shopify-refund-${refund.id}`,
      timestamp: ts(refund.created_at),
      properties: {
        $lib: 'vizhog-shopify-webhook',
        source: 'shopify-webhook',
        order_id: String(refund.order_id),
        refund_id: String(refund.id),
        affiliation: 'Shopify',
        total: amount || null,
        currency: (refund.transactions || [])[0]?.currency || null,
        note: refund.note || null,
      },
    };
  }

  return null;
}
