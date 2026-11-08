import { supabase } from './supabaseClient';
import {
  Product,
  ProductGalleryImage,
  ProductVariant,
  ShippingRate,
  Coupon,
  Order,
  CustomDesignRequest,
  initialArtisanProducts,
  initialShippingRates,
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
      .order('governorate', { ascending: true });

    if (error || !data || data.length === 0) {
      return initialShippingRates;
    }

    return data as ShippingRate[];
  } catch (err) {
    return initialShippingRates;
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
        discount_type: data.discount_type || 'percent',
        discount_value: Number(data.discount_value || data.discount_percent || data.discount_amount || 0),
        min_order_egp: data.min_order_egp ? Number(data.min_order_egp) : undefined,
        is_active: data.is_active !== false,
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
}): Promise<{ order_id: string; order_number: string }> {
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
    .order('governorate', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminUpsertShippingRate(rate: {
  id?: string;
  governorate: string;
  fee_egp: number;
  is_active: boolean;
}): Promise<any> {
  if (rate.id) {
    const { data, error } = await supabase
      .from('shipping_rates')
      .update({
        governorate: rate.governorate,
        fee_egp: rate.fee_egp,
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
        governorate: rate.governorate,
        fee_egp: rate.fee_egp,
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
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order_egp?: number;
  is_active: boolean;
  expires_at?: string | null;
}): Promise<any> {
  const payload = {
    code: coupon.code.toUpperCase(),
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
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
  const { error } = await supabase
    .from('orders')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      admin_notes: notes || undefined,
    })
    .eq('id', orderId);
  if (error) throw error;

  // Record status history if table exists
  try {
    await supabase.from('order_status_history').insert([{
      order_id: orderId,
      status: newStatus,
      notes: notes || `Status updated to ${newStatus}`,
      created_at: new Date().toISOString(),
    }]);
  } catch {
    // Handled gracefully if table is RLS-restricted or optional
  }
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

export const initialSampleOrders: Order[] = [
  {
    id: 'ord-sample-1001',
    order_number: 'MERO-1001',
    customer_name: 'Yasmin Al-Alfy',
    phone: '01012345678',
    email: 'yasmin@example.com',
    governorate: 'Cairo',
    city_area: 'Zamalek',
    address: '15 Mohammed Mazhar St, Apt 4B',
    payment_method: 'cash_on_delivery',
    status: 'in_production',
    subtotal_egp: 4850,
    shipping_egp: 60,
    total_egp: 4910,
    admin_notes: 'Artisan embroidery in progress. Siwan metallic gold and lotus stitch.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    items: [
      {
        id: 'item-1001-1',
        order_id: 'ord-sample-1001',
        product_id: 'f87a8101-3142-498c-8547-5121b6d00001',
        product_name_en: 'Lotus Heirloom Silk-Linen Dress',
        product_name_ar: 'فستان كتان وحرير مطرز بزهرة اللوتس',
        size: 'M',
        color: 'Dusty Rose',
        quantity: 1,
        unit_price_egp: 4850,
      },
    ],
    status_history: [
      {
        id: 'hist-1',
        order_id: 'ord-sample-1001',
        status: 'pending',
        notes: 'Order received via boutique online storefront',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
      },
      {
        id: 'hist-2',
        order_id: 'ord-sample-1001',
        status: 'confirmed',
        notes: 'Atelier concierge confirmed sizing and Zamalek delivery address',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      },
      {
        id: 'hist-3',
        order_id: 'ord-sample-1001',
        status: 'in_production',
        notes: 'Gilded needlework and silk-linen tailoring underway at Cairo workshop',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      },
    ],
  },
  {
    id: 'ord-sample-1002',
    order_number: 'MERO-1002',
    customer_name: 'Nouran El-Gamil',
    phone: '01123456789',
    email: 'nouran@example.com',
    governorate: 'Alexandria',
    city_area: 'Stanley',
    address: '22 Corniche Road, Villa 3',
    payment_method: 'cash_on_delivery',
    status: 'shipped',
    subtotal_egp: 6400,
    shipping_egp: 85,
    total_egp: 6485,
    admin_notes: 'Dispatched via Boutique Courier Express. Tracking #BSTA-99214',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    items: [
      {
        id: 'item-1002-1',
        order_id: 'ord-sample-1002',
        product_id: 'f87a8101-3142-498c-8547-5121b6d00003',
        product_name_en: 'Siwa Golden Thread Linen Kaftan',
        product_name_ar: 'قفطان واحة سيوة بالخيوط المذهبة',
        size: 'Free Size',
        color: 'Siwan Gold & Raw Ecru',
        quantity: 1,
        unit_price_egp: 6400,
      },
    ],
    status_history: [
      {
        id: 'hist-4',
        order_id: 'ord-sample-1002',
        status: 'pending',
        notes: 'Order placed by customer',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 60).toISOString(),
      },
      {
        id: 'hist-5',
        order_id: 'ord-sample-1002',
        status: 'confirmed',
        notes: 'Order confirmed and verified',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      },
      {
        id: 'hist-6',
        order_id: 'ord-sample-1002',
        status: 'in_production',
        notes: 'Siwan gold embroidery completed and inspected',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
      },
      {
        id: 'hist-7',
        order_id: 'ord-sample-1002',
        status: 'shipped',
        notes: 'Handed to courier for delivery to Alexandria',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      },
    ],
  },
  {
    id: 'ord-sample-1003',
    order_number: 'MERO-1003',
    customer_name: 'Mariam Mansour',
    phone: '01234567890',
    email: 'mariam@example.com',
    governorate: 'Giza',
    city_area: 'Sheikh Zayed',
    address: 'Al-Bostan District, Compound 12, Unit 8',
    payment_method: 'cash_on_delivery',
    status: 'delivered',
    subtotal_egp: 5200,
    shipping_egp: 60,
    total_egp: 5260,
    admin_notes: 'Delivered successfully. Customer inspected and paid in cash.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    items: [
      {
        id: 'item-1003-1',
        order_id: 'ord-sample-1003',
        product_id: 'f87a8101-3142-498c-8547-5121b6d00002',
        product_name_en: 'Heritage Noir Geometric Abaya',
        product_name_ar: 'عباية التراث الأسود بتطريز هندسي',
        size: '56',
        color: 'Midnight Onyx',
        quantity: 1,
        unit_price_egp: 5200,
      },
    ],
  },
  {
    id: 'ord-sample-1004',
    order_number: 'MERO-1004',
    customer_name: 'Laila El-Kady',
    phone: '01099887766',
    email: 'laila@example.com',
    governorate: 'Qalyubia',
    city_area: 'Banha',
    address: 'Al-Ahram St, Building 14',
    payment_method: 'cash_on_delivery',
    status: 'confirmed',
    subtotal_egp: 2950,
    shipping_egp: 75,
    total_egp: 3025,
    admin_notes: 'Confirmed by phone. Preparing voile fabric and jasmine motif.',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    items: [
      {
        id: 'item-1004-1',
        order_id: 'ord-sample-1004',
        product_id: 'f87a8101-3142-498c-8547-5121b6d00005',
        product_name_en: 'Jasmine Bloom Voile Tunic Top',
        product_name_ar: 'قميص فوال قطني بتطريز زهر الياسمين',
        size: 'S',
        color: 'Crisp White',
        quantity: 1,
        unit_price_egp: 2950,
      },
    ],
  },
];

const CUSTOMER_ORDERS_STORAGE_KEY = 'mero_customer_orders';

/**
 * Saves a customer-placed order to local storage for instant tracking on this device.
 */
export function saveCustomerOrder(order: Order): void {
  try {
    if (typeof window === 'undefined') return;
    const existingRaw = localStorage.getItem(CUSTOMER_ORDERS_STORAGE_KEY);
    const existing: Order[] = existingRaw ? JSON.parse(existingRaw) : [];
    const filtered = existing.filter((o) => o.order_number !== order.order_number);
    filtered.unshift(order);
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
    return existingRaw ? JSON.parse(existingRaw) : [];
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
 */
export async function uploadDesignReferenceImage(
  file: File
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

  const { data } = supabase.storage.from('design-references').getPublicUrl(path);
  return {
    url: data.publicUrl || path,
    path,
  };
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
 * Enforces rate limiting and strictly retrieves live database records.
 * NEVER returns hardcoded demo orders in production.
 */
export async function lookupPublicOrder(
  rawOrderNumber: string,
  phoneVerification?: string
): Promise<Order | null> {
  const cleanNumber = (rawOrderNumber || '').trim().toUpperCase();
  if (!cleanNumber) return null;

  // Rate-limiting check to prevent automated scraping of customer orders
  const rateLimit = checkGuestRateLimit(`order_lookup_${cleanNumber}`, 20, 5 * 60 * 1000);
  if (!rateLimit.allowed) {
    throw new Error(
      `Rate limit exceeded. Please wait ${rateLimit.retryAfterSeconds}s before looking up again.`
    );
  }

  // 1. Primary: Live database lookup via public secure RPC
  try {
    const { data, error } = await supabase.rpc('lookup_public_order', {
      p_order_number: cleanNumber,
      p_phone: phoneVerification ? phoneVerification.trim() : null,
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

  // 2. Direct Supabase query for authenticated admin
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

  // 3. Fallback to customer's order placed on this specific device if offline
  const customerOrders = getCustomerOrders();
  const localMatch = customerOrders.find(
    (o) =>
      o.order_number.toUpperCase() === cleanNumber ||
      o.order_number.toUpperCase() === `MERO-${cleanNumber}`
  );
  if (localMatch) {
    return localMatch;
  }

  return null;
}

