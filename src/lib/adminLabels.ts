export interface ShippingRateSummaryInput {
  fee_egp: number | string;
  estimated_min_days: number | string;
  estimated_max_days: number | string;
  is_active: boolean;
}

/** One-line summary of a shipping rate in the admin list. Stored values are never changed. */
export function shippingRateSummary(rate: ShippingRateSummaryInput, isAr: boolean): string {
  const range = `${rate.estimated_min_days}–${rate.estimated_max_days}`;
  if (isAr) {
    return `${rate.fee_egp} جنيه · ${range} أيام · ${rate.is_active ? 'مفعّل' : 'غير مفعّل'}`;
  }
  return `${rate.fee_egp} EGP · ${range} days · ${rate.is_active ? 'Active' : 'Inactive'}`;
}
