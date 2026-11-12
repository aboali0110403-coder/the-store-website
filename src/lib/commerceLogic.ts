/**
 * Pure e-commerce calculations, validations, and security logic for Mero Boutique.
 * Fully decoupled from UI/DOM for fast, deterministic unit testing.
 */

export type CurrencyLanguage = 'en' | 'ar';

export interface CartItemInput {
  productId: string;
  size: string;
  color: string;
  quantity: number;
}

export interface ProductVariantStock {
  id: string;
  product_id?: string;
  size: string;
  color: string;
  stock: number;
  is_active: boolean;
}

export interface ProductPriceStock {
  id: string;
  price_egp: number;
  stock: number;
  production_type: 'ready' | 'made_to_order' | 'limited';
  is_published: boolean;
  variants?: ProductVariantStock[];
}

export interface CouponRule {
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_egp?: number;
  max_discount_egp?: number | null;
  is_active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
}

export interface ShippingRateRule {
  governorate: string;
  fee_egp: number;
  is_active: boolean;
}

export interface OrderCalculationResult {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  couponApplied?: string;
}

/**
 * Format currency in Egyptian Pounds (EGP) for both English and Arabic.
 */
export function formatEGP(amount: number, language: CurrencyLanguage = 'en'): string {
  const safeAmount = Math.max(0, Number(amount) || 0);
  if (language === 'ar') {
    return `${safeAmount.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج.م`;
  }
  return `${safeAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })} EGP`;
}

/**
 * Validates a single cart item.
 * Quantity must be an integer between 1 and 20.
 */
export function validateCartItem(item: CartItemInput): { valid: boolean; error?: string } {
  if (!item.productId || typeof item.productId !== 'string') {
    return { valid: false, error: 'Product ID is required' };
  }
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
    return { valid: false, error: 'Quantity must be an integer between 1 and 20' };
  }
  return { valid: true };
}

/**
 * Merges cart items to prevent duplicate line items.
 * If productId, size, and color match, quantities are combined (capped at max 20).
 */
export function mergeCartItems(existingItems: CartItemInput[], newItem: CartItemInput): CartItemInput[] {
  const index = existingItems.findIndex(
    (i) => i.productId === newItem.productId && i.size === newItem.size && i.color === newItem.color
  );

  if (index >= 0) {
    const updated = [...existingItems];
    const combinedQuantity = Math.min(20, updated[index].quantity + newItem.quantity);
    updated[index] = { ...updated[index], quantity: combinedQuantity };
    return updated;
  }

  return [...existingItems, { ...newItem, quantity: Math.min(20, Math.max(1, newItem.quantity)) }];
}

/**
 * Validates cart items against live product catalog and variant stock.
 * Rules:
 * - made_to_order items are never restricted by stock and never block checkout.
 * - If product has configured variants, requested variant must exist and be active.
 * - Variant stock is checked strictly; never silently falls back to base product stock.
 * - If product has no variants, base product stock is checked for ready/limited pieces.
 */
export function validateStockAvailability(
  items: CartItemInput[],
  products: Map<string, ProductPriceStock>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product) {
      errors.push(`Product ${item.productId} is no longer available.`);
      continue;
    }
    if (!product.is_published) {
      errors.push(`Product "${item.productId}" is not currently published.`);
      continue;
    }

    // made_to_order products are never limited by available stock
    if (product.production_type === 'made_to_order') {
      continue;
    }

    const hasConfiguredVariants =
      Array.isArray(product.variants) && product.variants.some((v) => v.is_active);

    if (hasConfiguredVariants) {
      const matchedVariant = product.variants?.find(
        (v) =>
          v.is_active &&
          v.size.trim().toLowerCase() === item.size.trim().toLowerCase() &&
          v.color.trim().toLowerCase() === item.color.trim().toLowerCase()
      );

      if (!matchedVariant) {
        errors.push(
          `Variant "${item.size} / ${item.color}" is not available for product "${product.id}".`
        );
        continue;
      }

      if (
        (product.production_type === 'ready' || product.production_type === 'limited') &&
        matchedVariant.stock < item.quantity
      ) {
        errors.push(
          `Insufficient stock for product "${product.id}" (${item.size} / ${item.color}). Requested: ${item.quantity}, Available: ${matchedVariant.stock}.`
        );
      }
    } else {
      // Product without variants
      if (
        (product.production_type === 'ready' || product.production_type === 'limited') &&
        product.stock < item.quantity
      ) {
        errors.push(
          `Insufficient stock for product "${product.id}". Requested: ${item.quantity}, Available: ${product.stock}.`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculates subtotal directly from verified product database prices.
 * NEVER trusts frontend prices.
 */
export function calculateVerifiedSubtotal(
  items: CartItemInput[],
  verifiedPrices: Map<string, number>
): number {
  return items.reduce((sum, item) => {
    const price = verifiedPrices.get(item.productId) ?? 0;
    return sum + price * item.quantity;
  }, 0);
}

/**
 * Validates a coupon against current order subtotal and active rules.
 */
export function evaluateCoupon(
  code: string,
  subtotal: number,
  coupon?: CouponRule | null
): { valid: boolean; discount: number; error?: string } {
  if (!code || !code.trim()) {
    return { valid: false, discount: 0 };
  }
  const cleanCode = code.trim().toUpperCase();

  if (!coupon || coupon.code.toUpperCase() !== cleanCode) {
    return { valid: false, discount: 0, error: 'Invalid coupon code' };
  }

  if (!coupon.is_active) {
    return { valid: false, discount: 0, error: 'This coupon is inactive' };
  }

  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > Date.now()) {
    return { valid: false, discount: 0, error: 'This coupon is not active yet' };
  }

  if (coupon.expires_at) {
    const expiry = new Date(coupon.expires_at).getTime();
    if (expiry < Date.now()) {
      return { valid: false, discount: 0, error: 'This coupon has expired' };
    }
  }

  if (coupon.min_order_egp && subtotal < coupon.min_order_egp) {
    return {
      valid: false,
      discount: 0,
      error: `Minimum order amount of ${formatEGP(coupon.min_order_egp)} required for this coupon`,
    };
  }

  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = (subtotal * coupon.discount_value) / 100;
  } else {
    discount = Math.min(subtotal, coupon.discount_value);
  }

  if (coupon.max_discount_egp != null) {
    discount = Math.min(discount, coupon.max_discount_egp);
  }

  // Ensure discount does not exceed subtotal
  discount = Math.max(0, Math.min(subtotal, Math.round(discount)));

  return { valid: true, discount };
}

/**
 * Matches a governorate to a shipping rate.
 */
export function resolveShippingRate(
  governorate: string,
  rates: ShippingRateRule[]
): { fee: number; isConfigured: boolean } {
  if (!governorate) return { fee: 0, isConfigured: false };

  const matched = rates.find(
    (r) => r.is_active && r.governorate.trim().toLowerCase() === governorate.trim().toLowerCase()
  );

  if (matched) {
    return { fee: Number(matched.fee_egp), isConfigured: true };
  }

  return { fee: 0, isConfigured: false };
}

/**
 * Calculates complete order totals.
 */
export function computeOrderTotals(params: {
  subtotal: number;
  shipping: number;
  discount: number;
}): OrderCalculationResult {
  const safeSubtotal = Math.max(0, params.subtotal);
  const safeShipping = Math.max(0, params.shipping);
  const safeDiscount = Math.max(0, Math.min(safeSubtotal, params.discount));
  const total = Math.max(0, safeSubtotal - safeDiscount + safeShipping);

  return {
    subtotal: safeSubtotal,
    shipping: safeShipping,
    discount: safeDiscount,
    total,
  };
}

/**
 * Validates checkout form submission details.
 */
export function validateOrderInput(input: {
  name: string;
  phone: string;
  governorate: string;
  city_area: string;
  address: string;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!input.name || input.name.trim().length < 2) {
    errors.name = 'Full name must be at least 2 characters';
  }
  // Egyptian or international phone check: at least 7 digits
  const cleanPhone = (input.phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 7) {
    errors.phone = 'Please provide a valid phone number (at least 7 digits)';
  }
  if (!input.governorate || input.governorate.trim().length < 2) {
    errors.governorate = 'Governorate selection is required';
  }
  if (!input.city_area || input.city_area.trim().length < 2) {
    errors.city_area = 'City or area is required';
  }
  if (!input.address || input.address.trim().length < 8) {
    errors.address = 'Detailed address must be at least 8 characters';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * In-memory sliding window rate limiter for guest checkout & custom design requests.
 * Blocks spam/abuse while allowing genuine customer submissions.
 */
interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkGuestRateLimit(
  identifier: string,
  maxRequests: number = 5,
  windowMs: number = 10 * 60 * 1000 // 10 minutes
): { allowed: boolean; remaining: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier) || { timestamps: [] };

  // Filter timestamps within current window
  const validTimestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (validTimestamps.length >= maxRequests) {
    const oldest = validTimestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  validTimestamps.push(now);
  rateLimitStore.set(identifier, { timestamps: validTimestamps });

  return {
    allowed: true,
    remaining: maxRequests - validTimestamps.length,
  };
}

/**
 * Verifies guest human verification challenge (CAPTCHA / math question).
 */
export function verifyCaptchaAnswer(expectedAnswer: number, userAnswer: string | number): boolean {
  const parsed = Number(userAnswer);
  if (Number.isNaN(parsed)) return false;
  return parsed === expectedAnswer;
}

/**
 * Normalizes user-entered order numbers (e.g. "1001" -> "MERO-1001", trims whitespace, uppercases).
 */
export function normalizeOrderNumber(input: string): string {
  if (!input) return '';
  const clean = input.trim().toUpperCase();
  if (/^\d{3,6}$/.test(clean)) {
    return `MERO-${clean}`;
  }
  return clean;
}

/**
 * Validates order reference query format.
 */
export function validateOrderNumberInput(input: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeOrderNumber(input);
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Please enter your order reference number' };
  }
  if (normalized.length < 4 || !/^[A-Z0-9\-_#]{4,35}$/.test(normalized.replace('#', ''))) {
    return {
      valid: false,
      normalized,
      error: 'Please enter a valid order reference format (e.g. MERO-1001)',
    };
  }
  return { valid: true, normalized };
}

export type MilestoneProgress = 'completed' | 'current' | 'upcoming';

export interface OrderMilestone {
  step: number;
  key: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  progress: MilestoneProgress;
}

/**
 * Derives structured 5-milestone progression for Mero Boutique orders based on status.
 */
export function computeOrderMilestones(status: string): OrderMilestone[] {
  const normalizedStatus = (status || 'pending').toLowerCase().trim();

  // Status mapping to progression step (1 to 5)
  // 1: pending
  // 2: confirmed
  // 3: in_production / ready_to_ship
  // 4: shipped / out_for_delivery
  // 5: delivered
  let currentStep = 1;
  if (normalizedStatus === 'confirmed') currentStep = 2;
  else if (normalizedStatus === 'in_production' || normalizedStatus === 'ready_to_ship') currentStep = 3;
  else if (normalizedStatus === 'shipped' || normalizedStatus === 'out_for_delivery') currentStep = 4;
  else if (normalizedStatus === 'delivered' || normalizedStatus === 'completed') currentStep = 5;

  const milestones: Array<{
    step: number;
    key: string;
    titleEn: string;
    titleAr: string;
    descEn: string;
    descAr: string;
  }> = [
    {
      step: 1,
      key: 'received',
      titleEn: 'Order Received',
      titleAr: 'تم تسجيل الطلب',
      descEn: 'Your artisanal garment request was recorded in our Cairo boutique system.',
      descAr: 'تم استلام وتسجيل بيانات طلبك في نظام الدار بالقاهرة بنجاح.',
    },
    {
      step: 2,
      key: 'confirmed',
      titleEn: 'Atelier Confirmed',
      titleAr: 'مراجعة وتأكيد الطلب',
      descEn: 'Styling concierge has confirmed sizing, fabric allocation, and delivery route.',
      descAr: 'قام فريق الأتيليه بمراجعة وتأكيد المقاسات والخامات وجدولة الشحن.',
    },
    {
      step: 3,
      key: 'crafting',
      titleEn: 'Handcrafting & Inspection',
      titleAr: 'التطريز اليدوي وفحص الجودة',
      descEn: 'Artisans execute hand embroidery, finishing stitches, and meticulous quality inspection.',
      descAr: 'تباشر الحرفيات مراجعة التطريز اليدوي وفحص الجودة الدقيق والكي والتغليف الفاخر.',
    },
    {
      step: 4,
      key: 'shipped',
      titleEn: 'Out for Delivery',
      titleAr: 'تم التسليم لشركة الشحن',
      descEn: 'Handed over to our specialized courier for safe doorstep delivery with inspection right.',
      descAr: 'الطلب في عهدة مندوب الشحن المتخصص متوجهاً إلى عنوانك مع حق المعاينة.',
    },
    {
      step: 5,
      key: 'delivered',
      titleEn: 'Delivered',
      titleAr: 'تم الاستلام بنجاح',
      descEn: 'Delivered to your address after full inspection and payment.',
      descAr: 'تم تسليم القطعة لعميلتنا الكريمة واستيفاء المبلغ بعد الفحص والمعاينة.',
    },
  ];

  return milestones.map((m) => {
    let progress: MilestoneProgress = 'upcoming';
    if (m.step < currentStep) progress = 'completed';
    else if (m.step === currentStep) progress = 'current';

    return {
      ...m,
      progress,
    };
  });
}
