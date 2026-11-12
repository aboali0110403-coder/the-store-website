import { supabase } from './supabaseClient';
import {
  Product,
  ProductGalleryImage,
  ProductVariant,
  ShippingRate,
  Coupon,
  Order,
  CustomDesignRequest,
  CategoryItem,
  initialCategories,
  initialArtisanProducts,
  initialCoupons,
} from './store';
import { evaluateCoupon, checkGuestRateLimit } from './commerceLogic';

/**
 * Maps raw database product row into frontend Product interface
 */
function mapProductRow(row: any): Product {
  const categoryMap: Record<string, Product['category']> = {
    Dresses: 'Dresses',
    Abayas: 'Abayas',
    Kaftans: 'Kaftans',
    Tops: 'Tops',
    Sets: 'Sets',
    'Exclusive Pieces': 'Exclusive Pieces',
  };

  const images: ProductGalleryImage[] = Array.isArray(row.product_images)
    ? row.product_images.map((img: any) => ({
        id: img.id,
        product_id: img.product_id,
        image_url: img.image_url,
        alt_text: img.alt_text || row.name_en,
        sort_order: img.sort_order ?? 0,
        is_primary: Boolean(img.is_primary),
      }))
    : [];

  const variants: ProductVariant[] = Array.isArray(row.product_variants)
    ? row.product_variants.map((v: any) => ({
        id: v.id,
        product_id: v.product_id,
        size: v.size || '',
        color: v.color || '',
        sku: v.sku || '',
        stock: Number(v.stock ?? 0),
        is_active: v.is_active !== false,
      }))
    : [];

  return {
    id: row.id,
    slug: row.slug,
    name: row.name_en,
    nameAr: row.name_ar,
    category: categoryMap[row.category] ?? 'Exclusive Pieces',
    categoryAr: row.category_ar,
    price: Number(row.price_egp),
    compareAt: row.compare_at_egp == null ? undefined : Number(row.compare_at_egp),
    image: row.image_url || '/products/embroidered-dress.svg',
    alt: row.image_alt || row.name_en,
    badge: row.is_featured ? 'Exclusive' : undefined,
    description: row.description_en || '',
    descriptionAr: row.description_ar || '',
    fabric: row.fabric_en || '',
    fabricAr: row.fabric_ar || '',
    technique: row.embroidery_en || '',
    techniqueAr: row.embroidery_ar || '',
    production: row.production_type === 'made_to_order' ? 'made-to-order' : row.production_type,
    sizes: row.sizes || [],
    colors: row.colors || [],
    stock: Number(row.stock ?? 0),
    delivery: row.production_type === 'ready' ? 'Availability confirmed by the boutique' : 'Production timing confirmed after review',
    deliveryAr: row.production_type === 'ready' ? 'يُؤكد التوافر من المتجر' : 'تُحدد مدة التنفيذ بعد مراجعة الطلب',
    care: '',
    careAr: '',
    isPublished: Boolean(row.is_published),
    isFeatured: Boolean(row.is_featured),
    images,
    variants,
  };
}

/**
 * Fetch published catalog with product_images and product_variants
 */
export async function fetchCatalog(): Promise<Product[]> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(*), product_variants(*)')
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase products fetch note:', error.message);
      return initialArtisanProducts;
    }

    if (!data || data.length === 0) {
      // Graceful fallback to verified curated initial catalog
      return initialArtisanProducts;
    }

    return data.map(mapProductRow);
  } catch (err) {
    console.error('Catalog fetch error:', err);
    return initialArtisanProducts;
  }
}

/**
 * Fetch a single product by slug including gallery and variants
 */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(*), product_variants(*)')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) {
      const fallback = initialArtisanProducts.find((p) => p.slug === slug);
      return fallback || null;
    }

    return mapProductRow(data);
  } catch (err) {
    const fallback = initialArtisanProducts.find((p) => p.slug === slug);
    return fallback || null;
  }
}

/**
 * Fetch active shipping rates from Supabase
 */
export async function fetchShippingRates(): Promise<ShippingRate[]> {
  try {
    const { data, error } = await supabase
      .from('shipping_rates')
      .select('*')
      .eq('is_active', true)
      .order('governorate', { ascending: true })
      .order('area', { ascending: true });

    if (error || !data) return [];

    return data as ShippingRate[];
  } catch {
    return [];
  }
}

/**
 * Validates a coupon code against Supabase or boutique rules
 */
export async function validateCoupon(
  code: string,
  subtotal: number
): Promise<{ valid: boolean; discount: number; error?: string; coupon?: Coupon }> {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) return { valid: false, discount: 0 };

  try {
    // Attempt querying database coupons
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', cleanCode)
      .maybeSingle();

    if (data) {
      const rule = {
        code: data.code,
        // `percent` is accepted only as a read-compatibility alias; the canonical
        // database/application value is `percentage`.
        discount_type: data.discount_type === 'percent' ? 'percentage' : data.discount_type || 'percentage',
        discount_value: Number(data.discount_value || data.discount_percent || data.discount_amount || 0),
        max_discount_egp: data.max_discount_egp == null ? null : Number(data.max_discount_egp),
        min_order_egp: data.min_order_egp ? Number(data.min_order_egp) : undefined,
        is_active: data.is_active !== false,
        starts_at: data.starts_at || null,
        expires_at: data.expires_at || data.valid_until,
      };
      const evalResult = evaluateCoupon(cleanCode, subtotal, rule);
      return { ...evalResult, coupon: data as Coupon };
    }
  } catch {
    // If coupons table RLS is restricted to admin, check against verified boutique promotions
  }

  const fallback = initialCoupons.find((c) => c.code.toUpperCase() === cleanCode);
  const evalResult = evaluateCoupon(cleanCode, subtotal, fallback || null);
  return { ...evalResult, coupon: fallback };
}

/**
 * Submit guest order using existing submit_store_order RPC.
 * Never inserts orders directly from the browser.
 * Never supplies prices from the frontend.
 */
export async function submitStoreOrder(params: {
  customer_name: string;
  phone: string;
  email?: string;
  governorate: string;
  city_area: string;
  address: string;
  notes?: string;
  payment_method: 'cash_on_delivery' | 'prepaid' | 'deposit';
  items: Array<{ product_id: string; size: string; color: string; quantity: number }>;
  idempotency_key: string;
}): Promise<{
  order_id: string;
  order_number: string;
  subtotal_egp: number;
  shipping_egp: number;
  total_egp: number;
}> {
  // Client rate-limiting check
  const rateLimit = checkGuestRateLimit(`guest_order_${params.phone || 'client'}`);
  if (!rateLimit.allowed) {
    throw new Error(
      `Rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds} seconds before submitting again.`
    );
  }

  // Call the official RPC
  const { data, error } = await supabase.rpc('submit_store_order', {
    p_customer_name: params.customer_name.trim(),
    p_phone: params.phone.trim(),
    p_email: params.email ? params.email.trim() : null,
    p_governorate: params.governorate.trim(),
    p_city_area: params.city_area.trim(),
    p_address: params.address.trim(),
    p_notes: params.notes ? params.notes.trim() : null,
    p_payment_method: params.payment_method,
    p_items: params.items.map((i) => ({
      product_id: i.product_id,
      size: i.size || '',
      color: i.color || '',
      quantity: Math.max(1, Math.min(20, i.quantity)),
    })),
    p_idempotency_key: params.idempotency_key,
  });

  if (error) {
    throw new Error(error.message || 'The order could not be saved in the boutique system.');
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !result.order_number) {
    // In case RPC returned an empty list or unexpected shape
    throw new Error('Could not retrieve order reference number.');
  }

  return {
    order_id: result.order_id || result.id || '',
    order_number: result.order_number,
    subtotal_egp: Number(result.subtotal_egp ?? 0),
    shipping_egp: Number(result.shipping_egp ?? 0),
    total_egp: Number(result.total_egp ?? 0),
  };
}

/**
 * Submit custom design request using existing submit_custom_design_request RPC
 */
export async function submitCustomDesignRequest(params: {
  customer_name: string;
  phone: string;
  email?: string;
  garment_type: string;
  preferred_fabric?: string;
  preferred_colors?: string;
  embroidery_style?: string;
  size_details?: string;
  description: string;
  reference_image_urls?: string[];
  target_budget_egp?: number;
  needed_by?: string;
}): Promise<{ request_id: string; request_number: string }> {
  const rateLimit = checkGuestRateLimit(`guest_custom_${params.phone || 'client'}`);
  if (!rateLimit.allowed) {
    throw new Error(`Rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds}s.`);
  }

  const { data, error } = await supabase.rpc('submit_custom_design_request', {
    p_customer_name: params.customer_name.trim(),
    p_phone: params.phone.trim(),
    p_email: params.email ? params.email.trim() : null,
    p_garment_type: params.garment_type.trim(),
    p_preferred_fabric: params.preferred_fabric ? params.preferred_fabric.trim() : null,
    p_preferred_colors: params.preferred_colors ? params.preferred_colors.trim() : null,
    p_embroidery_style: params.embroidery_style ? params.embroidery_style.trim() : null,
    p_size_details: params.size_details ? params.size_details.trim() : null,
    p_description: params.description.trim(),
    p_reference_image_urls: params.reference_image_urls || [],
    p_target_budget_egp: params.target_budget_egp || null,
    p_needed_by: params.needed_by || null,
  });

  if (error) {
    throw new Error(error.message || 'Could not record custom design request.');
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    request_id: result.request_id || result.id || '',
    request_number: result.request_number,
  };
}

// ==========================================
// ADMIN DASHBOARD & MANAGEMENT API
// Restricts all operations to authenticated store admins
// ==========================================

export async function checkAdminAuthorization(): Promise<{
  authorized: boolean;
  userId?: string;
  email?: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { authorized: false };
  }

  try {
    const { data: adminRows, error } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', session.user.id);

    if (error || !adminRows || adminRows.length === 0) {
      return { authorized: false, userId: session.user.id, email: session.user.email };
    }

    return { authorized: true, userId: session.user.id, email: session.user.email };
  } catch {
    return { authorized: false, userId: session.user.id, email: session.user.email };
  }
}

export async function adminGetProducts(): Promise<any[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), product_variants(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function adminUpsertProduct(payload: any): Promise<any> {
  if (payload.id) {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', payload.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from('products').insert([payload]).select().single();
    if (error) throw error;
    return data;
  }
}

export async function adminDeleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

// Product Images Gallery Management
export async function adminAddProductImage(img: {
  product_id: string;
  image_url: string;
  alt_text?: string;
  sort_order?: number;
  is_primary?: boolean;
}): Promise<any> {
  const { data, error } = await supabase
    .from('product_images')
    .insert([{
      product_id: img.product_id,
      image_url: img.image_url,
      alt_text: img.alt_text || '',
      sort_order: img.sort_order ?? 0,
      is_primary: Boolean(img.is_primary),
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adminDeleteProductImage(imageId: string): Promise<void> {
  const { error } = await supabase.from('product_images').delete().eq('id', imageId);
  if (error) throw error;
}

// Product Variants & Stock Management
export async function adminUpsertProductVariant(variant: {
  id?: string;
  product_id: string;
  size: string;
  color: string;
  sku?: string;
  stock: number;
  is_active: boolean;
}): Promise<any> {
  if (variant.id) {
    const { data, error } = await supabase
      .from('product_variants')
      .update({
        size: variant.size,
        color: variant.color,
        sku: variant.sku || '',
        stock: variant.stock,
        is_active: variant.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', variant.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('product_variants')
      .insert([{
        product_id: variant.product_id,
        size: variant.size,
        color: variant.color,
        sku: variant.sku || '',
        stock: variant.stock,
        is_active: variant.is_active,
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function adminDeleteProductVariant(variantId: string): Promise<void> {
  const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
  if (error) throw error;
}

// Shipping Rates Management
export async function adminGetShippingRates(): Promise<ShippingRate[]> {
  const { data, error } = await supabase
    .from('shipping_rates')
    .select('*')
    .order('governorate', { ascending: true })
    .order('area', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminUpsertShippingRate(rate: {
  id?: string;
  governorate: string;
  area: string;
  fee_egp: number;
  estimated_min_days: number;
  estimated_max_days: number;
  is_active: boolean;
}): Promise<any> {
  if (rate.id) {
    const { data, error } = await supabase
      .from('shipping_rates')
      .update({
        governorate: rate.governorate.trim(),
        area: rate.area.trim(),
        fee_egp: rate.fee_egp,
        estimated_min_days: rate.estimated_min_days,
        estimated_max_days: rate.estimated_max_days,
        is_active: rate.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rate.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('shipping_rates')
      .insert([{
        governorate: rate.governorate.trim(),
        area: rate.area.trim(),
        fee_egp: rate.fee_egp,
        estimated_min_days: rate.estimated_min_days,
        estimated_max_days: rate.estimated_max_days,
        is_active: rate.is_active,
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function adminDeleteShippingRate(id: string): Promise<void> {
  const { error } = await supabase.from('shipping_rates').delete().eq('id', id);
  if (error) throw error;
}

// Coupon Management
export async function adminGetCoupons(): Promise<Coupon[]> {
  try {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch {
    return initialCoupons;
  }
}

export async function adminUpsertCoupon(coupon: {
  id?: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_discount_egp?: number | null;
  min_order_egp?: number;
  is_active: boolean;
  expires_at?: string | null;
}): Promise<any> {
  const payload = {
    code: coupon.code.toUpperCase(),
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    ...(coupon.max_discount_egp !== undefined ? { max_discount_egp: coupon.max_discount_egp } : {}),
    min_order_egp: coupon.min_order_egp || 0,
    is_active: coupon.is_active,
    expires_at: coupon.expires_at || null,
  };

  if (coupon.id) {
    const { data, error } = await supabase.from('coupons').update(payload).eq('id', coupon.id).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase.from('coupons').insert([payload]).select().single();
    if (error) throw error;
    return data;
  }
}

export async function adminDeleteCoupon(id: string): Promise<void> {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) throw error;
}

// ==========================================
// CATEGORIES MANAGEMENT (Explore by Category)
// ==========================================

const CATEGORIES_CACHE_KEY = 'mero_cached_categories';

/**
 * Fetch published categories for homepage and navigation
 */
export async function fetchCategories(): Promise<CategoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (!error && data && data.length > 0) {
      const mapped: CategoryItem[] = data.map((row: any) => ({
        id: row.id,
        slug: row.slug,
        name: row.name_en,
        nameAr: row.name_ar,
        filter: row.filter,
        image: row.image_url,
        description: row.description_en || '',
        descriptionAr: row.description_ar || '',
        sort_order: row.sort_order ?? 0,
        is_published: row.is_published !== false,
      }));
      try {
        localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(mapped));
      } catch {}
      return mapped;
    }
  } catch (err) {
    console.warn('Categories query note:', err);
  }

  // Check local cache if admin edited offline or before remote table migration
  try {
    const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return initialCategories;
}

/**
 * Admin: retrieve all categories (including unpublished)
 */
export async function adminGetCategories(): Promise<CategoryItem[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!error && data && data.length > 0) {
      return data.map((row: any) => ({
        id: row.id,
        slug: row.slug,
        name: row.name_en,
        nameAr: row.name_ar,
        filter: row.filter,
        image: row.image_url,
        description: row.description_en || '',
        descriptionAr: row.description_ar || '',
        sort_order: row.sort_order ?? 0,
        is_published: row.is_published !== false,
      }));
    }
  } catch (err) {
    console.warn('Admin categories query note:', err);
  }

  try {
    const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  return initialCategories;
}

/**
 * Admin: insert or update category in database.
 * Throws DB error if Supabase fails; updates cache ONLY upon success.
 */
export async function adminUpsertCategory(category: CategoryItem): Promise<CategoryItem> {
  const payload = {
    slug: category.slug,
    name_en: category.name,
    name_ar: category.nameAr,
    filter: category.filter,
    image_url: category.image,
    description_en: category.description || '',
    description_ar: category.descriptionAr || '',
    sort_order: category.sort_order ?? 0,
    is_published: category.is_published !== false,
    updated_at: new Date().toISOString(),
  };

  let savedItem: CategoryItem = { ...category };

  if (category.id) {
    const { data, error } = await supabase
      .from('categories')
      .update(payload)
      .eq('id', category.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase database error updating category: ${error.message}`);
    }
    if (data) {
      savedItem = {
        id: data.id,
        slug: data.slug,
        name: data.name_en,
        nameAr: data.name_ar,
        filter: data.filter,
        image: data.image_url,
        description: data.description_en,
        descriptionAr: data.description_ar,
        sort_order: data.sort_order,
        is_published: data.is_published,
      };
    }
  } else {
    const { data, error } = await supabase
      .from('categories')
      .upsert([payload], { onConflict: 'slug' })
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase database error creating category: ${error.message}`);
    }
    if (data) {
      savedItem = {
        id: data.id,
        slug: data.slug,
        name: data.name_en,
        nameAr: data.name_ar,
        filter: data.filter,
        image: data.image_url,
        description: data.description_en,
        descriptionAr: data.description_ar,
        sort_order: data.sort_order,
        is_published: data.is_published,
      };
    }
  }

  // Update local cache ONLY upon verified database success
  try {
    const current = await adminGetCategories();
    const updated = current.map((c) => (c.slug === savedItem.slug ? { ...c, ...savedItem } : c));
    if (!updated.some((c) => c.slug === savedItem.slug)) {
      updated.push(savedItem);
    }
    localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(updated));
  } catch {}

  return savedItem;
}

/**
 * Admin: delete category with assigned products safety verification.
 * Fails if products are assigned to this category or if Supabase DB rejects.
 */
export async function adminDeleteCategory(idOrSlug: string, categoryFilter?: string): Promise<void> {
  // 1. Guard check: prevent deletion if products are linked to this category
  if (categoryFilter) {
    const { count, error: countErr } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category', categoryFilter);

    if (!countErr && count && count > 0) {
      throw new Error(
        `Cannot delete category "${categoryFilter}": ${count} product(s) are currently assigned to it. Reassign or delete those products first.`
      );
    }
  }

  // 2. Perform DB deletion
  const { error } = await supabase
    .from('categories')
    .delete()
    .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`);

  if (error) {
    throw new Error(`Supabase database error deleting category: ${error.message}`);
  }

  // 3. Update local cache ONLY upon confirmed database success
  try {
    const cached = localStorage.getItem(CATEGORIES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const filtered = parsed.filter((c: CategoryItem) => c.id !== idOrSlug && c.slug !== idOrSlug);
      localStorage.setItem(CATEGORIES_CACHE_KEY, JSON.stringify(filtered));
    }
  } catch {}
}


// Orders & Status History & Payment Transactions
export async function adminGetOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((o: any) => ({
    ...o,
    items: o.order_items,
  }));
}

export async function adminUpdateOrderStatus(
  orderId: string,
  newStatus: string,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_order_status', {
    p_order_id: orderId,
    p_new_status: newStatus,
    p_note: notes || null,
  });
  if (error) throw error;
}

export async function adminGetCustomDesignRequests(): Promise<CustomDesignRequest[]> {
  const { data, error } = await supabase
    .from('custom_design_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function adminUpdateCustomDesignStatus(
  requestId: string,
  status: string,
  adminNotes?: string
): Promise<void> {
  const { error } = await supabase
    .from('custom_design_requests')
    .update({
      status,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Public Order Status Lookup & Tracking
// -----------------------------------------------------------------------------

// Production Mode: Zero fake / sample orders.
// All order queries are executed against live Supabase database via secure RPC or stored device orders.
const CUSTOMER_ORDERS_STORAGE_KEY = 'mero_customer_orders';

/**
 * Saves a customer-placed order to local storage for instant tracking on this device.
 */
export function saveCustomerOrder(order: Order): void {
  try {
    if (typeof window === 'undefined') return;
    const existingRaw = localStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY);
    const existing: Order[] = existingRaw ? JSON.parse(existingRaw) : [];
    // Keep only non-sensitive receipt metadata. Phone, email, address and line items
    // must never persist in browser storage on shared devices.
    const safeSummary = {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      total_egp: order.total_egp,
      created_at: order.created_at,
      updated_at: order.updated_at,
    } as Order;
    const filtered = existing.filter((o) => o.order_number !== safeSummary.order_number);
    filtered.unshift(safeSummary);
    localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch {
    // Storage quota or privacy mode
  }
}

/**
 * Retrieves all orders placed by the current browser/customer.
 */
export function getCustomerOrders(): Order[] {
  try {
    if (typeof window === 'undefined') return [];
    const existingRaw = localStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY);
    const existing: Order[] = existingRaw ? JSON.parse(existingRaw) : [];
    const safeSummaries = existing
      .filter((order) => order && typeof order.order_number === 'string')
      .map(
        (order) =>
          ({
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            total_egp: order.total_egp,
            created_at: order.created_at,
            updated_at: order.updated_at,
          }) as Order
      )
      .slice(0, 20);
    // Also scrub records written by older builds that contained PII.
    localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(safeSummaries));
    return safeSummaries;
  } catch {
    return [];
  }
}

/**
 * Direct file upload for product images to Supabase Storage ('product-images' bucket).
 * Validates JPEG, PNG, WebP and enforces 5MB limit.
 */
export async function uploadProductImage(
  file: File,
  productId?: string
): Promise<{ url: string; path: string }> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file format. Only JPEG, PNG, and WebP images are allowed.');
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE) {
    throw new Error('File size exceeds the 5 MB maximum limit.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'webp';
  const cleanName = file.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const path = `${productId ? `prod_${productId}` : 'products'}/${Date.now()}_${cleanName}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Upload to storage failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return {
    url: data.publicUrl,
    path,
  };
}

/**
 * Direct file upload for customer custom design reference images ('design-references' bucket).
 * Validates JPEG, PNG, WebP and enforces 5MB limit.
 * PRIVACY: The 'design-references' bucket is strictly PRIVATE. This function returns the
 * relative storage path only, NEVER a public URL.
 */
export async function uploadDesignReferenceImage(
  file: File
): Promise<{ path: string }> {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file format. Only JPEG, PNG, and WebP images are allowed.');
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE) {
    throw new Error('File size exceeds the 5 MB maximum limit.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'webp';
  const path = `references/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('design-references')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Reference image upload failed: ${uploadError.message}`);
  }

  return {
    path,
  };
}

/**
 * Generates a short-lived signed URL for an authorized administrator to view
 * private bespoke reference images from the 'design-references' storage bucket.
 */
export async function getSignedDesignReferenceUrl(
  path: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const { data, error } = await supabase.storage
    .from('design-references')
    .createSignedUrl(cleanPath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not generate secure view URL for reference image.');
  }

  return data.signedUrl;
}

/**
 * Delete image from Supabase storage bucket
 */
export async function deleteStorageFile(
  bucket: 'product-images' | 'design-references',
  path: string
): Promise<void> {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch (err) {
    console.warn(`Could not delete storage file ${path}:`, err);
  }
}

/**
 * Public-facing Order Status Lookup function.
 * Queries Supabase database directly via lookup_public_order RPC.
 * Enforces rate limiting, phone verification, and returns sanitized data.
 * NEVER returns hardcoded demo orders or leaks private customer information.
 */
export async function lookupPublicOrder(
  rawOrderNumber: string,
  phoneVerification?: string,
  trackingToken?: string
): Promise<Order | null> {
  const cleanNumber = (rawOrderNumber || '').trim().toUpperCase();
  if (!cleanNumber) return null;

  // Rate-limiting check to prevent brute-force order enumeration
  const rateLimit = checkGuestRateLimit(`order_lookup_${cleanNumber}`, 15, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    throw new Error(
      `Rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds}s before looking up again.`
    );
  }

  const cleanPhone = phoneVerification ? phoneVerification.replace(/\D/g, '') : '';

  // 1. Primary: Live database lookup via public secure RPC (with phone verification and optional token)
  try {
    const { data, error } = await supabase.rpc('lookup_public_order', {
      p_order_number: cleanNumber,
      p_phone: cleanPhone || null,
      p_tracking_token: trackingToken ? trackingToken.trim() : null,
    });

    if (!error && data) {
      const orderData = typeof data === 'string' ? JSON.parse(data) : data;
      if (orderData && orderData.order_number) {
        // Sync latest status to customer orders storage if this device previously placed it
        try {
          const currentLocal = getCustomerOrders();
          const matchIdx = currentLocal.findIndex(
            (o) => o.order_number.toUpperCase() === orderData.order_number.toUpperCase()
          );
          if (matchIdx >= 0) {
            currentLocal[matchIdx] = {
              ...currentLocal[matchIdx],
              status: orderData.status,
              updated_at: orderData.updated_at,
              status_history: orderData.status_history || currentLocal[matchIdx].status_history,
            };
            localStorage.setItem(CUSTOMER_ORDERS_STORAGE_KEY, JSON.stringify(currentLocal));
          }
        } catch {
          // Ignore local storage error
        }
        return orderData as Order;
      }
    }
  } catch (err) {
    console.warn('Live order lookup note:', err);
  }

  // 2. Direct Supabase query for authenticated admin session ONLY
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*), order_status_history(*)')
        .or(`order_number.eq.${cleanNumber},order_number.eq.MERO-${cleanNumber}`)
        .maybeSingle();

      if (data) {
        return {
          ...data,
          items: data.order_items,
          status_history: data.order_status_history,
        };
      }
    }
  } catch {
    // Handled gracefully
  }

  return null;
}
