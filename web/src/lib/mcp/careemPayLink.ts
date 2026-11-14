/**
 * Careem Pay helpers shared by the `careem_pay_settle_debt` MCP tool and the
 * Careem Pay settle modal, so the link a user shares matches what the tool
 * settles. Amounts are integer minor units (fils); 100 fils = AED 1.
 */

/** Careem Pay tag for a Payd user, e.g. "Rahul Mehta" -> "@rahulmehta.careem". */
export function careemPayTag(name: string | null | undefined): string {
  const handle = (name || 'payd').toLowerCase().replace(/[^a-z0-9]/g, '') || 'payd';
  return `@${handle}.careem`;
}

/** Formats integer fils as a fixed 2-decimal AED string without float math. */
export function filsToAedString(amountMinor: number): string {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Shareable web link that opens a Careem Pay request for the given amount. */
export function careemPayLink(tag: string, amountMinor: number): string {
  return `https://careem.me/pay?tag=${encodeURIComponent(tag)}&amount=${filsToAedString(amountMinor)}&currency=AED`;
}

/** In-app deep link that opens the Careem Pay transfer screen. */
export function careemPayDeeplink(recipient: { tag?: string; phone?: string }, amountMinor: number): string {
  const who = recipient.phone
    ? `phone=${encodeURIComponent(recipient.phone)}`
    : `tag=${encodeURIComponent(recipient.tag || '')}`;
  return `careem://pay/transfer?${who}&amount=${filsToAedString(amountMinor)}&currency=AED`;
}
