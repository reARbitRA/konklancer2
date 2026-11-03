/** Pricing metadata is authoritative only where a provider actually supplies it.
 * A zero input/output token price is not a guarantee about account limits or other fees. */
export type PriceCategory = 'free' | 'unknown' | 'paid';
export type CatalogModel = { provider: string; id: string; name: string; priceCategory?: PriceCategory };

export { tokenPriceCategory } from './tokenPricing.js';

/** Parameter counts are only a rough size proxy, not a quality benchmark. Avoid guessing MoE counts. */
export function parameterBillions(model: CatalogModel): number | null {
  const id = model.id.toLowerCase();
  if (/\b\d+x\d+(?:\.\d+)?b\b/.test(id)) return null;
  const match = id.match(/(?:^|[\/_:.-])(\d+(?:\.\d+)?)b(?:$|[\/_:.-])/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function sortCatalogModels<T extends CatalogModel>(models: T[]): T[] {
  const order: Record<PriceCategory, number> = {free: 0, unknown: 1, paid: 2};
  return [...models].sort((a,b) => {
    const ac = a.priceCategory ?? 'unknown', bc = b.priceCategory ?? 'unknown';
    const byPrice = order[ac] - order[bc];
    if (byPrice) return byPrice;
    if (ac === 'free') {
      const av = parameterBillions(a), bv = parameterBillions(b);
      if (av !== null && bv !== null && av !== bv) return bv - av;
      if (av !== null && bv === null) return -1;
      if (av === null && bv !== null) return 1;
    }
    return a.name.localeCompare(b.name) || a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id);
  });
}
