import React, { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Package,
  ShoppingBag,
  Scissors,
  Truck,
  Tag,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Plus,
  Save,
  Trash2,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useBoutique } from '../components/SiteShell';
import {
  adminGetProducts,
  adminUpsertProduct,
  adminDeleteProduct,
  adminAddProductImage,
  adminDeleteProductImage,
  adminUpsertProductVariant,
  adminDeleteProductVariant,
  adminGetShippingRates,
  adminUpsertShippingRate,
  adminDeleteShippingRate,
  adminGetCoupons,
  adminUpsertCoupon,
  adminDeleteCoupon,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminGetCustomDesignRequests,
  adminUpdateCustomDesignStatus,
} from '../lib/api';
import { formatEGP } from '../lib/commerceLogic';

type Tab =
  | 'products'
  | 'gallery'
  | 'variants'
  | 'shipping'
  | 'coupons'
  | 'orders'
  | 'custom_requests';

export default function Admin() {
  const { language, refreshCatalog } = useBoutique();
  const isAr = language === 'ar';

  // Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('products');

  // Data states
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [shippingRates, setShippingRates] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customRequests, setCustomRequests] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Forms
  const [productForm, setProductForm] = useState({
    id: '',
    slug: '',
    name_en: '',
    name_ar: '',
    category: 'Dresses',
    category_ar: 'فساتين',
    description_en: '',
    description_ar: '',
    fabric_en: '',
    fabric_ar: '',
    embroidery_en: '',
    embroidery_ar: '',
    price_egp: '',
    compare_at_egp: '',
    image_url: '',
    image_alt: '',
    production_type: 'ready',
    sizes: 'S, M, L',
    colors: 'Dusty Rose, Antique Ivory',
    stock: '5',
    is_published: true,
    is_featured: false,
  });

  const [galleryForm, setGalleryForm] = useState({
    image_url: '',
    alt_text: '',
    sort_order: '0',
    is_primary: false,
  });

  const [variantForm, setVariantForm] = useState({
    id: '',
    size: 'M',
    color: 'Dusty Rose',
    sku: '',
    stock: '5',
    is_active: true,
  });

  const [shippingForm, setShippingForm] = useState({
    id: '',
    governorate: 'Cairo',
    fee_egp: '60',
    is_active: true,
  });

  const [couponForm, setCouponForm] = useState({
    id: '',
    code: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: '10',
    min_order_egp: '1500',
    is_active: true,
    expires_at: '',
  });

  const [orderStatusNotes, setOrderStatusNotes] = useState<Record<string, string>>({});

  // Verify authentication and admin authorization
  const verifyAccess = useCallback(async (userSession: any) => {
    if (!userSession?.user) {
      setIsAuthorized(false);
      return;
    }

    try {
      // Query admin_users allowlist
      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userSession.user.id);

      if (error || !data || data.length === 0) {
        setIsAuthorized(false);
        setAuthError(
          isAr
            ? 'هذا الحساب غير مصرح له كمسؤول. يجب إضافة معرف المستخدم (UUID) إلى جدول admin_users.'
            : 'Access Denied: Account is not in the store admin allowlist (public.admin_users).'
        );
      } else {
        setIsAuthorized(true);
        setAuthError('');
      }
    } catch {
      setIsAuthorized(false);
      setAuthError('Authorization check failed.');
    }
  }, [isAr]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) verifyAccess(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) verifyAccess(session);
      else setIsAuthorized(false);
    });

    return () => subscription.unsubscribe();
  }, [verifyAccess]);

  // Load admin data
  const loadDashboardData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const [prods, rates, coups, ords, reqs] = await Promise.allSettled([
        adminGetProducts(),
        adminGetShippingRates(),
        adminGetCoupons(),
        adminGetOrders(),
        adminGetCustomDesignRequests(),
      ]);

      if (prods.status === 'fulfilled') {
        setProducts(prods.value);
        if (prods.value.length > 0 && !selectedProductId) {
          setSelectedProductId(prods.value[0].id);
        }
      }
      if (rates.status === 'fulfilled') setShippingRates(rates.value);
      if (coups.status === 'fulfilled') setCoupons(coups.value);
      if (ords.status === 'fulfilled') setOrders(ords.value);
      if (reqs.status === 'fulfilled') setCustomRequests(reqs.value);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to refresh data.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, selectedProductId]);

  useEffect(() => {
    if (isAuthorized) {
      loadDashboardData();
    }
  }, [isAuthorized, loadDashboardData]);

  // Sign in handler
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setSession(data.session);
      await verifyAccess(data.session);
      setPassword('');
    } catch (err: any) {
      setAuthError(err?.message || (isAr ? 'بيانات الدخول غير صحيحة.' : 'Invalid email or password.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setIsAuthorized(false);
    setEmail('');
    setPassword('');
  };

  // Product Save
  const handleSaveProduct = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const payload: any = {
        slug: productForm.slug.trim(),
        name_en: productForm.name_en.trim(),
        name_ar: productForm.name_ar.trim(),
        category: productForm.category,
        category_ar: productForm.category_ar.trim(),
        description_en: productForm.description_en,
        description_ar: productForm.description_ar,
        fabric_en: productForm.fabric_en,
        fabric_ar: productForm.fabric_ar,
        embroidery_en: productForm.embroidery_en,
        embroidery_ar: productForm.embroidery_ar,
        price_egp: Number(productForm.price_egp),
        compare_at_egp: productForm.compare_at_egp ? Number(productForm.compare_at_egp) : null,
        image_url: productForm.image_url,
        image_alt: productForm.image_alt,
        production_type: productForm.production_type,
        sizes: productForm.sizes.split(',').map((x) => x.trim()).filter(Boolean),
        colors: productForm.colors.split(',').map((x) => x.trim()).filter(Boolean),
        stock: Number(productForm.stock),
        is_published: productForm.is_published,
        is_featured: productForm.is_featured,
        updated_at: new Date().toISOString(),
      };
      if (productForm.id) payload.id = productForm.id;

      await adminUpsertProduct(payload);
      setStatusMessage(isAr ? 'تم حفظ المنتج بنجاح!' : 'Product saved successfully!');
      await refreshCatalog();
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save product.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await adminDeleteProduct(id);
      await refreshCatalog();
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Delete failed.');
    }
  };

  // Gallery Image Add
  const handleAddGalleryImage = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !galleryForm.image_url) return;
    setLoading(true);
    try {
      await adminAddProductImage({
        product_id: selectedProductId,
        image_url: galleryForm.image_url.trim(),
        alt_text: galleryForm.alt_text.trim(),
        sort_order: Number(galleryForm.sort_order),
        is_primary: galleryForm.is_primary,
      });
      setGalleryForm({ image_url: '', alt_text: '', sort_order: '0', is_primary: false });
      setStatusMessage('Gallery photo added.');
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not add image.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGalleryImage = async (id: string) => {
    try {
      await adminDeleteProductImage(id);
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not delete image.');
    }
  };

  // Variant Save
  const handleSaveVariant = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    setLoading(true);
    try {
      await adminUpsertProductVariant({
        id: variantForm.id || undefined,
        product_id: selectedProductId,
        size: variantForm.size.trim(),
        color: variantForm.color.trim(),
        sku: variantForm.sku.trim(),
        stock: Number(variantForm.stock),
        is_active: variantForm.is_active,
      });
      setVariantForm({ id: '', size: 'M', color: 'Dusty Rose', sku: '', stock: '5', is_active: true });
      setStatusMessage('Variant updated.');
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save variant.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVariant = async (id: string) => {
    try {
      await adminDeleteProductVariant(id);
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not delete variant.');
    }
  };

  // Shipping Rate Save
  const handleSaveShippingRate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminUpsertShippingRate({
        id: shippingForm.id || undefined,
        governorate: shippingForm.governorate.trim(),
        fee_egp: Number(shippingForm.fee_egp),
        is_active: shippingForm.is_active,
      });
      setShippingForm({ id: '', governorate: 'Cairo', fee_egp: '60', is_active: true });
      setStatusMessage('Shipping rate updated.');
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save shipping rate.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShippingRate = async (id: string) => {
    try {
      await adminDeleteShippingRate(id);
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not delete shipping rate.');
    }
  };

  // Coupon Save
  const handleSaveCoupon = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await adminUpsertCoupon({
        id: couponForm.id || undefined,
        code: couponForm.code.trim().toUpperCase(),
        discount_type: couponForm.discount_type,
        discount_value: Number(couponForm.discount_value),
        min_order_egp: Number(couponForm.min_order_egp),
        is_active: couponForm.is_active,
        expires_at: couponForm.expires_at || null,
      });
      setCouponForm({
        id: '',
        code: '',
        discount_type: 'percent',
        discount_value: '10',
        min_order_egp: '1500',
        is_active: true,
        expires_at: '',
      });
      setStatusMessage('Coupon saved.');
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not save coupon.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    try {
      await adminDeleteCoupon(id);
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not delete coupon.');
    }
  };

  // Order Status Update
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    const notes = orderStatusNotes[orderId] || '';
    try {
      await adminUpdateOrderStatus(orderId, status, notes);
      setStatusMessage(`Order status updated to ${status}.`);
      await loadDashboardData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not update order status.');
    }
  };

  // Selected Product for Gallery / Variants
  const activeProduct = products.find((p) => p.id === selectedProductId);

  // UNAUTHORIZED STATE
  if (!session || !isAuthorized) {
    return (
      <main className="admin-page">
        <div className="container admin-shell">
          <div className="admin-topbar">
            <div className="flex items-center gap-3">
              <img src="/mero-logo.png" alt="Mero Boutique" className="admin-logo-img" />
              <div>
                <span className="eyebrow">MERO / SECURITY BOUNDARY</span>
                <h1>{isAr ? 'بوابة إدارة ميرو بوتيك' : 'Atelier Administration'}</h1>
              </div>
            </div>
            <div className="admin-status">
              <span className="status-dot" />
              <span>{isAr ? 'منطقة محمية بصلاحيات المشرف' : 'Store Admin Access Only'}</span>
            </div>
          </div>

          <div className="admin-gate">
            <div className="admin-gate-icon">
              {session && !isAuthorized ? (
                <ShieldAlert size={28} className="text-[#a34d55]" />
              ) : (
                <ShieldCheck size={28} />
              )}
            </div>

            <h2>
              {session && !isAuthorized
                ? isAr
                  ? 'حساب غير مصرح له'
                  : 'Unauthorized Access'
                : isAr
                ? 'تسجيل دخول المشرف'
                : 'Administrator Sign-In'}
            </h2>

            <p>
              {session && !isAuthorized
                ? isAr
                  ? 'أنت مسجل الدخول، لكن حسابك غير موجود في قائمة مسؤولي المتجر (public.admin_users). تم تقييد كافة الصلاحيات الإدارية وفق سياسات RLS.'
                  : 'Your account is authenticated, but not in the store admin allowlist (public.admin_users). Administrative privileges are strictly enforced by RLS.'
                : isAr
                ? 'سجلي الدخول بحساب المشرف المسجل في Supabase Auth لإدارة المنتجات والطلبات والكوبونات والشحن.'
                : 'Sign in with your verified Supabase owner credentials to manage catalog, gallery, stock, orders, and coupons.'}
            </p>

            {authError && <div className="mero-error max-w-md w-full">{authError}</div>}

            {session && !isAuthorized ? (
              <div className="flex gap-3">
                <button type="button" className="outline-button" onClick={handleLogout}>
                  <LogOut size={14} />
                  {isAr ? 'تسجيل الخروج' : 'Sign Out'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="w-full max-w-sm flex flex-col gap-3 my-3">
                <label className="mero-field">
                  <span>{isAr ? 'البريد الإلكتروني' : 'Email Address'}</span>
                  <input
                    type="email"
                    required
                    placeholder="owner@meroboutique.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <label className="mero-field">
                  <span>{isAr ? 'كلمة المرور' : 'Password'}</span>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>

                <button type="submit" className="solid-button full-width mt-2" disabled={loading}>
                  {loading ? (isAr ? 'جارٍ التحقق…' : 'Authenticating…') : isAr ? 'دخول المسؤول' : 'Sign In'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    );
  }

  // AUTHORIZED ADMIN VIEW
  return (
    <main className="admin-page">
      <div className="container admin-shell">
        {/* Topbar */}
        <div className="admin-topbar">
          <div className="flex items-center gap-3">
            <img src="/mero-logo.png" alt="Mero Boutique" className="admin-logo-img" />
            <div>
              <span className="eyebrow">MERO / CONTROL ATELIER</span>
              <h1>{isAr ? 'لوحة تحكم ميرو بوتيك' : 'Store Administration'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="admin-status">
              <span className="status-dot online" />
              <span>{session.user.email}</span>
            </div>
            <button type="button" className="mero-text-button" onClick={handleLogout}>
              <LogOut size={14} />
              {isAr ? 'خروج' : 'Sign Out'}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="mero-tabs">
          <button
            className={activeTab === 'products' ? 'active' : ''}
            onClick={() => setActiveTab('products')}
          >
            <Package size={15} />
            {isAr ? 'المنتجات' : 'Products'} ({products.length})
          </button>

          <button
            className={activeTab === 'gallery' ? 'active' : ''}
            onClick={() => setActiveTab('gallery')}
          >
            <ImageIcon size={15} />
            {isAr ? 'معرض الصور' : 'Product Gallery'}
          </button>

          <button
            className={activeTab === 'variants' ? 'active' : ''}
            onClick={() => setActiveTab('variants')}
          >
            <Layers size={15} />
            {isAr ? 'المقاسات والمخزون' : 'Variants & Stock'}
          </button>

          <button
            className={activeTab === 'shipping' ? 'active' : ''}
            onClick={() => setActiveTab('shipping')}
          >
            <Truck size={15} />
            {isAr ? 'أسعار الشحن' : 'Shipping Rates'} ({shippingRates.length})
          </button>

          <button
            className={activeTab === 'coupons' ? 'active' : ''}
            onClick={() => setActiveTab('coupons')}
          >
            <Tag size={15} />
            {isAr ? 'كوبونات الخصم' : 'Coupons'} ({coupons.length})
          </button>

          <button
            className={activeTab === 'orders' ? 'active' : ''}
            onClick={() => setActiveTab('orders')}
          >
            <ShoppingBag size={15} />
            {isAr ? 'الطلبات والمعاملات' : 'Orders & Payments'} ({orders.length})
          </button>

          <button
            className={activeTab === 'custom_requests' ? 'active' : ''}
            onClick={() => setActiveTab('custom_requests')}
          >
            <Scissors size={15} />
            {isAr ? 'التصاميم الخاصة' : 'Bespoke Requests'} ({customRequests.length})
          </button>

          <button
            type="button"
            className="mero-refresh"
            onClick={loadDashboardData}
            title="Refresh from Database"
          >
            <RefreshCw size={14} />
            {isAr ? 'تحديث' : 'Refresh'}
          </button>
        </nav>

        {statusMessage && <div className="form-success">{statusMessage}</div>}
        {errorMessage && <div className="mero-error">{errorMessage}</div>}

        {/* 1. PRODUCTS TAB */}
        {activeTab === 'products' && (
          <div>
            <form className="mero-editor" onSubmit={handleSaveProduct}>
              <div className="mero-editor-head">
                <h2>{productForm.id ? (isAr ? 'تعديل المنتج' : 'Edit Product') : isAr ? 'إضافة منتج جديد' : 'Add New Product'}</h2>
                <button
                  type="button"
                  className="mero-text-button"
                  onClick={() =>
                    setProductForm({
                      id: '',
                      slug: '',
                      name_en: '',
                      name_ar: '',
                      category: 'Dresses',
                      category_ar: 'فساتين',
                      description_en: '',
                      description_ar: '',
                      fabric_en: '',
                      fabric_ar: '',
                      embroidery_en: '',
                      embroidery_ar: '',
                      price_egp: '',
                      compare_at_egp: '',
                      image_url: '',
                      image_alt: '',
                      production_type: 'ready',
                      sizes: 'S, M, L',
                      colors: 'Dusty Rose, Antique Ivory',
                      stock: '5',
                      is_published: true,
                      is_featured: false,
                    })
                  }
                >
                  <Plus size={14} />
                  {isAr ? 'نموذج جديد' : 'New Blank Form'}
                </button>
              </div>

              <div className="mero-form-grid">
                <label className="mero-field">
                  <span>Slug (URL identifier) *</span>
                  <input
                    required
                    value={productForm.slug}
                    onChange={(e) => setProductForm({ ...productForm, slug: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Name (English) *</span>
                  <input
                    required
                    value={productForm.name_en}
                    onChange={(e) => setProductForm({ ...productForm, name_en: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>الاسم بالعربية *</span>
                  <input
                    required
                    value={productForm.name_ar}
                    onChange={(e) => setProductForm({ ...productForm, name_ar: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Category (English) *</span>
                  <select
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  >
                    <option value="Dresses">Dresses</option>
                    <option value="Abayas">Abayas</option>
                    <option value="Kaftans">Kaftans</option>
                    <option value="Tops">Tops</option>
                    <option value="Sets">Sets</option>
                    <option value="Exclusive Pieces">Exclusive Pieces</option>
                  </select>
                </label>

                <label className="mero-field">
                  <span>التصنيف بالعربية *</span>
                  <input
                    required
                    value={productForm.category_ar}
                    onChange={(e) => setProductForm({ ...productForm, category_ar: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Price in EGP *</span>
                  <input
                    type="number"
                    required
                    value={productForm.price_egp}
                    onChange={(e) => setProductForm({ ...productForm, price_egp: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Compare-at Price (optional)</span>
                  <input
                    type="number"
                    value={productForm.compare_at_egp}
                    onChange={(e) => setProductForm({ ...productForm, compare_at_egp: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Stock Quantity *</span>
                  <input
                    type="number"
                    required
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Production Type</span>
                  <select
                    value={productForm.production_type}
                    onChange={(e) => setProductForm({ ...productForm, production_type: e.target.value })}
                  >
                    <option value="ready">Ready Stock (جاهز للشحن)</option>
                    <option value="made_to_order">Made to Order (تنفيذ يدوي)</option>
                    <option value="limited">Limited Edition (إصدار محدود)</option>
                  </select>
                </label>

                <label className="mero-field">
                  <span>Sizes (Comma separated)</span>
                  <input
                    value={productForm.sizes}
                    onChange={(e) => setProductForm({ ...productForm, sizes: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Colors (Comma separated)</span>
                  <input
                    value={productForm.colors}
                    onChange={(e) => setProductForm({ ...productForm, colors: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Primary Image URL</span>
                  <input
                    value={productForm.image_url}
                    onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                  />
                </label>
              </div>

              <div className="mero-form-grid">
                <label className="mero-field">
                  <span>Description (English)</span>
                  <textarea
                    value={productForm.description_en}
                    onChange={(e) => setProductForm({ ...productForm, description_en: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>الوصف بالعربية</span>
                  <textarea
                    value={productForm.description_ar}
                    onChange={(e) => setProductForm({ ...productForm, description_ar: e.target.value })}
                  />
                </label>
              </div>

              <div className="mero-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={productForm.is_published}
                    onChange={(e) => setProductForm({ ...productForm, is_published: e.target.checked })}
                  />
                  <span>{isAr ? 'نشر المنتج في المتجر العام' : 'Publish Product to Public Store'}</span>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={productForm.is_featured}
                    onChange={(e) => setProductForm({ ...productForm, is_featured: e.target.checked })}
                  />
                  <span>{isAr ? 'إبراز في الصفحة الرئيسية' : 'Feature on Homepage'}</span>
                </label>
              </div>

              <button type="submit" className="solid-button" disabled={loading}>
                <Save size={15} />
                {isAr ? 'حفظ بيانات المنتج' : 'Save Product Record'}
              </button>
            </form>

            <div className="mero-records">
              <h2>{isAr ? 'كتالوج المنتجات الحالي' : 'Current Database Products'}</h2>
              {products.length === 0 ? (
                <p className="mero-empty">{isAr ? 'لا توجد منتجات مسجلة.' : 'No products in database.'}</p>
              ) : (
                products.map((p) => (
                  <article key={p.id} className="mero-record">
                    <div>
                      <strong>
                        {p.name_en} / {p.name_ar}
                      </strong>
                      <small>
                        Slug: {p.slug} · {p.price_egp} EGP · {p.production_type} · Stock: {p.stock} ·{' '}
                        {p.is_published ? 'Published' : 'Draft'}
                      </small>
                    </div>
                    <div className="mero-row-actions">
                      <button
                        type="button"
                        className="mero-text-button"
                        onClick={() => {
                          setSelectedProductId(p.id);
                          setProductForm({
                            id: p.id,
                            slug: p.slug,
                            name_en: p.name_en,
                            name_ar: p.name_ar,
                            category: p.category,
                            category_ar: p.category_ar,
                            description_en: p.description_en || '',
                            description_ar: p.description_ar || '',
                            fabric_en: p.fabric_en || '',
                            fabric_ar: p.fabric_ar || '',
                            embroidery_en: p.embroidery_en || '',
                            embroidery_ar: p.embroidery_ar || '',
                            price_egp: String(p.price_egp),
                            compare_at_egp: p.compare_at_egp ? String(p.compare_at_egp) : '',
                            image_url: p.image_url || '',
                            image_alt: p.image_alt || '',
                            production_type: p.production_type,
                            sizes: (p.sizes || []).join(', '),
                            colors: (p.colors || []).join(', '),
                            stock: String(p.stock),
                            is_published: p.is_published,
                            is_featured: p.is_featured,
                          });
                        }}
                      >
                        {isAr ? 'تعديل' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="mero-text-button danger"
                        onClick={() => handleDeleteProduct(p.id, p.name_en)}
                      >
                        <Trash2 size={13} />
                        {isAr ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        )}

        {/* 2. GALLERY MANAGEMENT TAB */}
        {activeTab === 'gallery' && (
          <div className="mero-editor">
            <h2>{isAr ? 'إدارة معرض صور المنتجات (product_images)' : 'Product Gallery Images Management'}</h2>
            <div className="mb-4">
              <label className="mero-field max-w-sm">
                <span>{isAr ? 'اختاري المنتج' : 'Select Product for Gallery'}</span>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_en} ({p.slug})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {activeProduct && (
              <>
                <form onSubmit={handleAddGalleryImage} className="border p-4 bg-[#fffaf8] my-4">
                  <h3 className="font-semibold text-sm mb-3">
                    {isAr ? `إضافة صورة إلى: ${activeProduct.name_en}` : `Add Photo to: ${activeProduct.name_en}`}
                  </h3>
                  <div className="mero-form-grid">
                    <label className="mero-field">
                      <span>Image URL *</span>
                      <input
                        required
                        type="url"
                        placeholder="https://example.com/gallery1.jpg"
                        value={galleryForm.image_url}
                        onChange={(e) => setGalleryForm({ ...galleryForm, image_url: e.target.value })}
                      />
                    </label>

                    <label className="mero-field">
                      <span>Alt Text</span>
                      <input
                        placeholder="Detail of lotus embroidery"
                        value={galleryForm.alt_text}
                        onChange={(e) => setGalleryForm({ ...galleryForm, alt_text: e.target.value })}
                      />
                    </label>

                    <label className="mero-field">
                      <span>Sort Order</span>
                      <input
                        type="number"
                        value={galleryForm.sort_order}
                        onChange={(e) => setGalleryForm({ ...galleryForm, sort_order: e.target.value })}
                      />
                    </label>

                    <div className="flex items-center gap-2 pt-6">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={galleryForm.is_primary}
                          onChange={(e) => setGalleryForm({ ...galleryForm, is_primary: e.target.checked })}
                        />
                        <span>{isAr ? 'صورة رئيسية' : 'Is Primary Photo'}</span>
                      </label>
                    </div>
                  </div>
                  <button type="submit" className="solid-button mt-3" disabled={loading}>
                    <Plus size={14} />
                    {isAr ? 'إضافة الصورة' : 'Add to Gallery'}
                  </button>
                </form>

                <div className="mt-4">
                  <h3 className="font-semibold text-sm mb-2">{isAr ? 'الصور الحالية بالمعرض' : 'Current Gallery Photos'}</h3>
                  {activeProduct.product_images && activeProduct.product_images.length > 0 ? (
                    <div className="grid grid-cols-4 gap-3">
                      {activeProduct.product_images.map((img: any) => (
                        <div key={img.id} className="border p-2 bg-white flex flex-col gap-2">
                          <img
                            src={img.image_url}
                            alt={img.alt_text || 'Gallery photo'}
                            className="w-full h-32 object-cover"
                          />
                          <small className="truncate text-[10px] text-[#806f77]">{img.image_url}</small>
                          <div className="flex justify-between items-center text-xs">
                            <span>Order: {img.sort_order}</span>
                            <button
                              type="button"
                              className="text-[#a34d55]"
                              onClick={() => handleDeleteGalleryImage(img.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#806f77]">
                      {isAr ? 'لا توجد صور إضافية في المعرض لهذا المنتج.' : 'No additional gallery images for this product.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* 3. VARIANTS & STOCK MANAGEMENT TAB */}
        {activeTab === 'variants' && (
          <div className="mero-editor">
            <h2>{isAr ? 'إدارة المقاسات والمخزون (product_variants)' : 'Variant & Stock Management'}</h2>
            <div className="mb-4">
              <label className="mero-field max-w-sm">
                <span>{isAr ? 'اختاري المنتج' : 'Select Product for Variants'}</span>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_en} ({p.slug})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {activeProduct && (
              <>
                <form onSubmit={handleSaveVariant} className="border p-4 bg-[#fffaf8] my-4">
                  <h3 className="font-semibold text-sm mb-3">
                    {variantForm.id ? (isAr ? 'تعديل متغير' : 'Edit Variant') : isAr ? 'إضافة متغير جديد' : 'Add New Variant'}
                  </h3>
                  <div className="mero-form-grid">
                    <label className="mero-field">
                      <span>Size (المقاس) *</span>
                      <input
                        required
                        value={variantForm.size}
                        onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })}
                        placeholder="S, M, 54, Free Size"
                      />
                    </label>

                    <label className="mero-field">
                      <span>Color (اللون) *</span>
                      <input
                        required
                        value={variantForm.color}
                        onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })}
                        placeholder="Dusty Rose, Midnight Onyx"
                      />
                    </label>

                    <label className="mero-field">
                      <span>SKU Code</span>
                      <input
                        value={variantForm.sku}
                        onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                        placeholder="MB-LOTUS-S"
                      />
                    </label>

                    <label className="mero-field">
                      <span>Stock Quantity (الكمية في المخزون) *</span>
                      <input
                        type="number"
                        required
                        value={variantForm.stock}
                        onChange={(e) => setVariantForm({ ...variantForm, stock: e.target.value })}
                      />
                    </label>
                  </div>

                  <div className="mero-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={variantForm.is_active}
                        onChange={(e) => setVariantForm({ ...variantForm, is_active: e.target.checked })}
                      />
                      <span>{isAr ? 'متاح للطلب' : 'Active for orders'}</span>
                    </label>
                  </div>

                  <button type="submit" className="solid-button" disabled={loading}>
                    <Save size={14} />
                    {isAr ? 'حفظ المتغير' : 'Save Variant'}
                  </button>
                </form>

                <div className="mt-4">
                  <h3 className="font-semibold text-sm mb-2">{isAr ? 'المتغيرات المسجلة' : 'Registered Variants'}</h3>
                  {activeProduct.product_variants && activeProduct.product_variants.length > 0 ? (
                    <div className="space-y-2">
                      {activeProduct.product_variants.map((v: any) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between p-3 border bg-white"
                        >
                          <div>
                            <strong>
                              {v.size} · {v.color}
                            </strong>
                            <span className="text-xs text-[#806f77] ml-2">
                              SKU: {v.sku || '—'} · Stock: {v.stock} · {v.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="mero-text-button"
                              onClick={() => {
                                setVariantForm({
                                  id: v.id,
                                  size: v.size,
                                  color: v.color,
                                  sku: v.sku || '',
                                  stock: String(v.stock),
                                  is_active: v.is_active,
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="mero-text-button danger"
                              onClick={() => handleDeleteVariant(v.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#806f77]">
                      {isAr ? 'لا توجد متغيرات محددة لهذا المنتج.' : 'No variants created yet.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* 4. SHIPPING RATES TAB */}
        {activeTab === 'shipping' && (
          <div className="mero-editor">
            <h2>{isAr ? 'إدارة أسعار الشحن للمحافظات (shipping_rates)' : 'Egyptian Governorate Shipping Rates'}</h2>
            <form onSubmit={handleSaveShippingRate} className="border p-4 bg-[#fffaf8] my-4">
              <div className="mero-form-grid">
                <label className="mero-field">
                  <span>Governorate (المحافظة) *</span>
                  <input
                    required
                    value={shippingForm.governorate}
                    onChange={(e) => setShippingForm({ ...shippingForm, governorate: e.target.value })}
                    placeholder="Cairo, Alexandria, Aswan…"
                  />
                </label>

                <label className="mero-field">
                  <span>Shipping Fee (EGP) *</span>
                  <input
                    type="number"
                    required
                    value={shippingForm.fee_egp}
                    onChange={(e) => setShippingForm({ ...shippingForm, fee_egp: e.target.value })}
                  />
                </label>
              </div>

              <div className="mero-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={shippingForm.is_active}
                    onChange={(e) => setShippingForm({ ...shippingForm, is_active: e.target.checked })}
                  />
                  <span>{isAr ? 'مفعل للشحن' : 'Active Rate'}</span>
                </label>
              </div>

              <button type="submit" className="solid-button" disabled={loading}>
                <Save size={14} />
                {isAr ? 'حفظ سعر الشحن' : 'Save Rate'}
              </button>
            </form>

            <div className="space-y-2 mt-4">
              {shippingRates.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 border bg-white">
                  <div>
                    <strong>{r.governorate}</strong>
                    <span className="text-xs text-[#806f77] ml-2">
                      {r.fee_egp} EGP · {r.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="mero-text-button"
                      onClick={() => {
                        setShippingForm({
                          id: r.id,
                          governorate: r.governorate,
                          fee_egp: String(r.fee_egp),
                          is_active: r.is_active,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="mero-text-button danger"
                      onClick={() => handleDeleteShippingRate(r.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. COUPONS TAB */}
        {activeTab === 'coupons' && (
          <div className="mero-editor">
            <h2>{isAr ? 'إدارة كوبونات الخصم (coupons)' : 'Coupon Management'}</h2>
            <form onSubmit={handleSaveCoupon} className="border p-4 bg-[#fffaf8] my-4">
              <div className="mero-form-grid">
                <label className="mero-field">
                  <span>Coupon Code *</span>
                  <input
                    required
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    placeholder="MERO10, ATELIER250"
                  />
                </label>

                <label className="mero-field">
                  <span>Discount Type</span>
                  <select
                    value={couponForm.discount_type}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, discount_type: e.target.value as any })
                    }
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (EGP)</option>
                  </select>
                </label>

                <label className="mero-field">
                  <span>Discount Value *</span>
                  <input
                    type="number"
                    required
                    value={couponForm.discount_value}
                    onChange={(e) => setCouponForm({ ...couponForm, discount_value: e.target.value })}
                  />
                </label>

                <label className="mero-field">
                  <span>Minimum Order EGP</span>
                  <input
                    type="number"
                    value={couponForm.min_order_egp}
                    onChange={(e) => setCouponForm({ ...couponForm, min_order_egp: e.target.value })}
                  />
                </label>
              </div>

              <div className="mero-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={couponForm.is_active}
                    onChange={(e) => setCouponForm({ ...couponForm, is_active: e.target.checked })}
                  />
                  <span>{isAr ? 'كوبون مفعل' : 'Active Coupon'}</span>
                </label>
              </div>

              <button type="submit" className="solid-button" disabled={loading}>
                <Save size={14} />
                {isAr ? 'حفظ الكوبون' : 'Save Coupon'}
              </button>
            </form>

            <div className="space-y-2 mt-4">
              {coupons.map((c, i) => (
                <div key={c.id || i} className="flex items-center justify-between p-3 border bg-white">
                  <div>
                    <strong>{c.code}</strong>
                    <span className="text-xs text-[#806f77] ml-2">
                      {c.discount_type === 'percent'
                        ? `${c.discount_value}% off`
                        : `${c.discount_value} EGP off`}
                      {c.min_order_egp ? ` · Min: ${c.min_order_egp} EGP` : ''} ·{' '}
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {c.id && (
                    <button
                      type="button"
                      className="mero-text-button danger"
                      onClick={() => handleDeleteCoupon(c.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. ORDERS & PAYMENTS TAB */}
        {activeTab === 'orders' && (
          <div className="mero-records">
            <h2>{isAr ? 'الطلبات وسجل الحالات والمعاملات' : 'Orders & Payment Transactions'}</h2>
            {orders.length === 0 ? (
              <p className="mero-empty">{isAr ? 'لا توجد طلبات مسجلة.' : 'No customer orders in database yet.'}</p>
            ) : (
              orders.map((o) => (
                <article key={o.id} className="mero-record flex-col items-start gap-3">
                  <div className="w-full flex justify-between items-start">
                    <div>
                      <strong>
                        {o.order_number} · {o.customer_name} ({o.phone})
                      </strong>
                      <small>
                        {o.governorate}, {o.city_area} · {o.address} · Total: {formatEGP(o.total_egp ?? o.subtotal_egp, language)}
                      </small>
                      <small>Method: {o.payment_method} · Date: {new Date(o.created_at).toLocaleString()}</small>
                      {o.notes && <small className="text-[#947381]">Notes: {o.notes}</small>}
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={o.status}
                        onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                        className="text-xs p-1 border font-medium"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="in_production">In Production</option>
                        <option value="ready_to_ship">Ready to Ship</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>

                  {/* Line items if available */}
                  {o.items && o.items.length > 0 && (
                    <div className="w-full bg-[#fffaf8] p-2 border text-xs">
                      <span className="font-semibold block mb-1">Items ({o.items.length}):</span>
                      {o.items.map((it: any) => (
                        <div key={it.id} className="flex justify-between py-0.5">
                          <span>
                            • {it.product_name_en} ({it.size} / {it.color}) × {it.quantity}
                          </span>
                          <span>{formatEGP(it.unit_price_egp * it.quantity, language)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        )}

        {/* 7. BESPOKE CUSTOM REQUESTS TAB */}
        {activeTab === 'custom_requests' && (
          <div className="mero-records">
            <h2>{isAr ? 'طلبات التصميم الخاص (custom_design_requests)' : 'Bespoke Custom Design Inquiries'}</h2>
            {customRequests.length === 0 ? (
              <p className="mero-empty">{isAr ? 'لا توجد طلبات تصميم خاصة.' : 'No custom design inquiries yet.'}</p>
            ) : (
              customRequests.map((r) => (
                <article key={r.id} className="mero-record flex-col items-start gap-2">
                  <div className="w-full flex justify-between items-start">
                    <div>
                      <strong>
                        {r.request_number} · {r.customer_name} ({r.phone})
                      </strong>
                      <small>
                        Garment: {r.garment_type} · Fabric: {r.preferred_fabric || '—'} · Colors: {r.preferred_colors || '—'}
                      </small>
                      <small>
                        Budget: {r.target_budget_egp ? `${r.target_budget_egp} EGP` : 'Not specified'} · Deposit Rate: {r.deposit_rate}%
                      </small>
                      <small className="text-[#3e3037] mt-1">{r.description}</small>
                    </div>

                    <select
                      value={r.status}
                      onChange={(e) => adminUpdateCustomDesignStatus(r.id, e.target.value)}
                      className="text-xs p-1 border font-medium"
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="quoted">Quoted</option>
                      <option value="deposit_paid">Deposit Paid</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  {r.reference_image_urls && r.reference_image_urls.length > 0 && (
                    <div className="flex gap-2 mt-1">
                      {r.reference_image_urls.map((url: string, i: number) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#947381] underline"
                        >
                          Photo {i + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}
