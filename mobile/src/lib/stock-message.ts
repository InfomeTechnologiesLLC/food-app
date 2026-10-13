import { formatQty } from '@/lib/quantities';

export function stockMessage(item: {
  name: string; quantity: number; unit: string; have: number; shortage: number;
  unitMismatch: boolean; incompatibleStock: { quantity: number; unit: string }[];
}) {
  const need = formatQty(item.quantity, item.unit);
  const have = formatQty(item.have, item.unit);
  if (item.unitMismatch) {
    const other = item.incompatibleStock.map((stock) => formatQty(stock.quantity, stock.unit)).join(' + ');
    return `${item.name}: needs ${need}; ${item.have ? `you have ${have} plus ` : 'you have '}${other}. Convert or correct the pantry quantity to compare.`;
  }
  return `${item.name}: needs ${need}; you have ${have}; buy ${formatQty(item.shortage, item.unit)}.`;
}
