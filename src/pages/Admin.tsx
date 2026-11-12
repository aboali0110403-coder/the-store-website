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
  Upload,
  X,
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
  adminGetCategories,
  adminUpsertCategory,
  adminDeleteCategory,
  uploadProductImage,
  getSignedDesignReferenceUrl,
} from '../lib/api';
import { formatEGP } from '../lib/commerceLogic';
import { CategoryItem } from '../lib/store';

type Tab =
  | 'products'
  | 'categories'
  | 'gallery'
  | 'variants'
  | 'shipping'
  | 'coupons'
  | 'orders'
  | 'custom_requests';

export default function Admin() {
  const { language, refreshCatalog, refreshCategories } = useBoutique();
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
  const [adminCategories, setAdminCategories] = useState<CategoryItem[]>([]);
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
  const [categoryUploading, setCategoryUploading] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [shippingRates, setShippingRates] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [customRequests, setCustomRequests] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [viewingRefImage, setViewingRefImage] = useState<string | null>(null);
  const [loadingRefImage, setLoadingRefImage] = useState(false);

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
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: '10',
    min_order_egp: '1500',
    is_active: true,
    expires_at: '',
  });

  const [orderStatusNotes, setOrderStatusNotes] = useState<Record<string, string>>({});
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  // Image Upload state
  const [primaryImageUploading, setPrimaryImageUploading] = useState(false);
  const [primaryImageError, setPrimaryImageError] = useState('');
  const [useManualImageUrl, setUseManualImageUrl] = useState(false);
  const [galleryImageUploading, setGalleryImageUploading] = useState(false);
  const [galleryImageError, setGalleryImageError] = useState('');

  const handlePrimaryImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPrimaryImageError('');
    setPrimaryImageUploading(true);

    try {
      const res = await uploadProductImage(file, productForm.id || productForm.slug);
      setProductForm((prev) => ({
        ...prev,
        image_url: res.url,
      }));
      setStatusMessage(isAr ? 'تم رفع صورة المنتج بنجاح إلى وحدة التخزين.' : 'Product image uploaded to storage.');
    } catch (err: any) {
      setPrimaryImageError(err?.message || (isAr ? 'فشل رفع الصورة.' : 'Image upload failed.'));
    } finally {
      setPrimaryImageUploading(false);
      e.target.value = '';
    }
  };

  const handleRemovePrimaryImage = () => {
    setProductForm((prev) => ({
      ...prev,
      image_url: '',
    }));
    setPrimaryImageError('');
  };

  const handleGalleryImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setGalleryImageError('');
    setGalleryImageUploading(true);

    try {
      const res = await uploadProductImage(file, selectedProductId);
      setGalleryForm((prev) => ({
        ...prev,
        image_url: res.url,
      }));
      setStatusMessage(isAr ? 'تم رفع صورة المعرض بنجاح إلى وحدة التخزين.' : 'Gallery photo uploaded to storage.');
    } catch (err: any) {
      setGalleryImageError(err?.message || (isAr ? 'فشل رفع الصورة.' : 'Image upload failed.'));
    } finally {
      setGalleryImageUploading(false);
      e.target.value = '';
    }
  };

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
      const [prods, rates, coups, ords, reqs, cats] = await Promise.allSettled([
        adminGetProducts(),
        adminGetShippingRates(),
        adminGetCoupons(),
        adminGetOrders(),
        adminGetCustomDesignRequests(),
        adminGetCategories(),
      ]);

      if (prods.status === 'fulfilled') {
        setProducts(prods.value);
        setSelectedProductId((prev) => prev || (prods.value[0] ? prods.value[0].id : null));
      }
      if (rates.status === 'fulfilled') setShippingRates(rates.value);
      if (coups.status === 'fulfilled') setCoupons(coups.value);
      if (ords.status === 'fulfilled') setOrders(ords.value);
      if (reqs.status === 'fulfilled') setCustomRequests(reqs.value);
      if (cats.status === 'fulfilled') setAdminCategories(cats.value || []);
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to refresh data.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized]);

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
      const requiresInventory =
        productForm.production_type === 'ready' || productForm.production_type === 'limited';
      const parsedStock = requiresInventory ? Math.max(0, parseInt(productForm.stock || '0', 10)) : 0;

      if (requiresInventory && (isNaN(parsedStock) || parsedStock < 0)) {
        throw new Error(
          isAr
            ? 'يرجى إدخال كمية مخزون صحيحة (صفر أو أكثر) للمنتجات الجاهزة أو الإصدار المحدود.'
            : 'Please enter a valid non-negative stock quantity for ready or limited edition products.'
        );
      }

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
        image_alt: productForm.image_alt || productForm.name_en,
        production_type: productForm.production_type,
        sizes: productForm.sizes.split(',').map((x) => x.trim()).filter(Boolean),
        colors: productForm.colors.split(',').map((x) => x.trim()).filter(Boolean),
        stock: parsedStock,
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
        discount_type: 'percentage',
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

  // Category Handlers
  const handleEditCategory = (cat: CategoryItem) => {
    setEditingCategory({ ...cat });
    setCategoryError('');
  };

  const handleSaveCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setLoading(true);
    setCategoryError('');
    try {
      await adminUpsertCategory(editingCategory);
      setStatusMessage(
        isAr
          ? 'تم حفظ التصنيف وتحديث الصفحة الرئيسية بنجاح.'
          : 'Category saved and homepage updated.'
      );
      setEditingCategory(null);
      await loadDashboardData();
      await refreshCategories();
    } catch (err: any) {
      setCategoryError(err?.message || 'Could not save category.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCategory) return;
    setCategoryUploading(true);
    setCategoryError('');
    try {
      const res = await uploadProductImage(file, `cat_${editingCategory.slug}`);
      setEditingCategory((prev) => (prev ? { ...prev, image: res.url } : null));
      setStatusMessage(
        isAr
          ? 'تم رفع صورة التصنيف بنجاح!'
          : 'Category image uploaded to storage.'
      );
    } catch (err: any) {
      setCategoryError(err?.message || (isAr ? 'فشل رفع صورة التصنيف.' : 'Category upload failed.'));
    } finally {
      setCategoryUploading(false);
      e.target.value = '';
    }
  };

  const handleToggleCategoryPublished = async (cat: CategoryItem) => {
    try {
      const updated = { ...cat, is_published: !cat.is_published };
      await adminUpsertCategory(updated);
      await loadDashboardData();
      await refreshCategories();
      setStatusMessage(
        isAr ? 'تم تحديث حالة ظهور التصنيف.' : 'Category publication status updated.'
      );
    } catch (err: any) {
      setErrorMessage(err?.message || 'Could not update category status.');
    }
  };

  const handleDeleteCategory = async (cat: CategoryItem) => {
    const confirmed = window.confirm(
      isAr
        ? `هل تريد بالتأكيد حذف تصنيف "${cat.nameAr || cat.name}"؟`
        : `Are you sure you want to delete category "${cat.name}"?`
    );
    if (!confirmed) return;

    setLoading(true);
    setCategoryError('');
    try {
      await adminDeleteCategory(cat.id || cat.slug, cat.filter);
      setStatusMessage(
        isAr ? 'تم حذف التصنيف بنجاح من قاعدة البيانات.' : 'Category deleted successfully from database.'
      );
      await loadDashboardData();
      await refreshCategories();
    } catch (err: any) {
      setCategoryError(err?.message || (isAr ? 'فشل حذف التصنيف.' : 'Failed to delete category.'));
    } finally {
      setLoading(false);
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
              <img src="/mero-logo-256.png" alt="Mero Boutique" className="admin-logo-img" />
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
            className={activeTab === 'categories' ? 'active' : ''}
            onClick={() => setActiveTab('categories')}
          >
            <Layers size={15} />
            {isAr ? 'تصنيفات الرئيسية' : 'Categories'} ({adminCategories.length})
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
                  <span>{isAr ? 'نوع الإنتاج والتنفيذ *' : 'Production Type *'}</span>
                  <select
                    value={productForm.production_type}
                    onChange={(e) => setProductForm({ ...productForm, production_type: e.target.value })}
                  >
                    <option value="ready">
                      {isAr ? 'جاهز للشحن الفوري (يتطلب مخزون)' : 'Ready Stock (Inventory tracked)'}
                    </option>
                    <option value="made_to_order">
                      {isAr ? 'يُنفّذ حسب الطلب (بدون جرد مخزون)' : 'Made to Order (No stock required)'}
                    </option>
                    <option value="limited">
                      {isAr ? 'إصدار محدود حصري (يتطلب مخزون)' : 'Limited Edition (Inventory tracked)'}
                    </option>
                  </select>
                </label>

                {/* Stock Quantity - shown only when product type requires inventory */}
                {productForm.production_type !== 'made_to_order' ? (
                  <label className="mero-field">
                    <span>
                      {isAr ? 'كمية المخزون المتاحة *' : 'Available Stock Quantity *'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={productForm.stock}
                      onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      placeholder="5"
                    />
                  </label>
                ) : (
                  <div className="mero-field bg-[#f5efec] p-3 border border-[rgba(73,52,63,0.15)] flex flex-col justify-center">
                    <span className="text-xs font-semibold text-[#49343f]">
                      {isAr ? 'معلومة المخزون' : 'Inventory Note'}
                    </span>
                    <p className="text-[11px] text-[#806f77] mt-0.5 leading-snug">
                      {isAr
                        ? 'القطع المصنوعة حسب الطلب لا تعتمد على رصيد مادي بالمخزن؛ ويمكن للعملاء طلبها في أي وقت.'
                        : 'Made-to-order garments are tailored upon request and do not depend on physical inventory.'}
                    </p>
                  </div>
                )}

                <label className="mero-field">
                  <span>Sizes (Comma separated)</span>
                  <input
                    value={productForm.sizes}
                    onChange={(e) => setProductForm({ ...productForm, sizes: e.target.value })}
                    placeholder="S, M, L, 54, 56"
                  />
                </label>

                <label className="mero-field">
                  <span>Colors (Comma separated)</span>
                  <input
                    value={productForm.colors}
                    onChange={(e) => setProductForm({ ...productForm, colors: e.target.value })}
                    placeholder="Dusty Rose, Antique Ivory"
                  />
                </label>
              </div>

              {/* Primary Image Upload & Preview Container */}
              <div className="border border-[rgba(73,52,63,0.2)] bg-[#fffaf8] p-4 my-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#49343f] uppercase tracking-wider">
                    {isAr ? 'صورة المنتج الرئيسية (Supabase Storage)' : 'Primary Product Image'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setUseManualImageUrl(!useManualImageUrl)}
                    className="text-[11px] text-[#49343f] underline"
                  >
                    {useManualImageUrl
                      ? isAr
                        ? 'التبديل إلى رفع ملف من الجهاز'
                        : 'Switch to device upload'
                      : isAr
                      ? 'إدخال رابط مباشر بدلاً من الرفع'
                      : 'Enter direct image URL instead'}
                  </button>
                </div>

                {primaryImageError && (
                  <div className="mero-error text-xs mb-2">{primaryImageError}</div>
                )}

                {/* Device Upload Mode */}
                {!useManualImageUrl ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <label className="outline-button text-xs cursor-pointer flex items-center gap-1.5 px-3 py-2">
                        <Upload size={14} />
                        <span>
                          {primaryImageUploading
                            ? isAr
                              ? 'جارٍ الرفع إلى التخزين…'
                              : 'Uploading to Storage…'
                            : productForm.image_url
                            ? isAr
                              ? 'استبدال الصورة من الجهاز'
                              : 'Replace image from device'
                            : isAr
                            ? 'رفع صورة من جهازكِ'
                            : 'Upload image from device'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={handlePrimaryImageFile}
                          disabled={primaryImageUploading}
                        />
                      </label>
                      <span className="text-[11px] text-[#806f77]">
                        {isAr ? 'الصيغ المدعومة: JPEG, PNG, WebP (بحد أقصى ٥ ميجابايت)' : 'JPEG, PNG, WebP (Max 5 MB)'}
                      </span>
                    </div>

                    {/* Image Preview & Details */}
                    {productForm.image_url && (
                      <div className="flex items-center gap-3 bg-white p-2.5 border border-[rgba(73,52,63,0.15)] mt-1">
                        <img
                          src={productForm.image_url}
                          alt="Product preview"
                          className="w-16 h-16 object-cover border border-[rgba(73,52,63,0.2)]"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-[#49343f] block truncate">
                            {productForm.image_url}
                          </span>
                          <span className="text-[10px] text-[#567c4b]">
                            {isAr ? '✓ الصورة جاهزة ومحفوظة بالمعاينة' : '✓ Image ready for product record'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemovePrimaryImage}
                          className="text-[#a34d55] text-xs flex items-center gap-1 hover:underline px-2 py-1"
                          title={isAr ? 'إزالة الصورة' : 'Remove image'}
                        >
                          <X size={13} />
                          <span>{isAr ? 'إزالة' : 'Remove'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="mero-field">
                    <span>{isAr ? 'رابط الصورة المباشر' : 'Direct Image URL'}</span>
                    <input
                      type="url"
                      placeholder="https://.../photo.webp"
                      value={productForm.image_url}
                      onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                    />
                  </label>
                )}
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

        {/* CATEGORIES MANAGEMENT TAB ("تسوقي حسب التصنيف") */}
        {activeTab === 'categories' && (
          <div className="mero-editor">
            <div className="mero-editor-head">
              <div>
                <h2>{isAr ? 'إدارة تصنيفات الصفحة الرئيسية ("تسوقي حسب التصنيف")' : 'Homepage "Explore By Category" Management'}</h2>
                <p className="text-xs text-[#705e66] mt-1">
                  {isAr
                    ? 'يمكنكِ هنا تعديل أسماء التصنيفات (عربي وإنجليزي)، تغيير ترتيب الظهور، أو استبدال الصور التوضيحية الدائرية بصور حقيقية مرفوعة من جهازك فوراً.'
                    : 'Manage the circular categories featured on the homepage: edit Arabic/English names, reorder them, or upload replacement images directly from your device.'}
                </p>
              </div>
              <button
                type="button"
                className="solid-button text-xs py-2 px-3 flex items-center gap-1.5"
                onClick={() => {
                  setEditingCategory({
                    slug: `category-${Date.now()}`,
                    name: '',
                    nameAr: '',
                    filter: '',
                    image: '/products/embroidered-dress.svg',
                    description: '',
                    descriptionAr: '',
                    sort_order: adminCategories.length + 1,
                    is_published: true,
                  });
                  setCategoryError('');
                }}
              >
                <Plus size={14} />
                {isAr ? 'إضافة تصنيف جديد' : 'Add New Category'}
              </button>
            </div>

            {/* Editing / Creating Form Card */}
            {editingCategory && (
              <form onSubmit={handleSaveCategory} className="border p-5 bg-[#fffaf8] my-4 shadow-sm">
                <div className="flex items-center justify-between border-b pb-3 mb-4">
                  <h3 className="font-serif text-lg text-[#3e3037] font-semibold">
                    {editingCategory.id || adminCategories.some((c) => c.slug === editingCategory.slug)
                      ? isAr
                        ? `تعديل التصنيف: ${isAr ? editingCategory.nameAr || editingCategory.name : editingCategory.name}`
                        : `Edit Category: ${editingCategory.name}`
                      : isAr
                      ? 'إضافة تصنيف جديد'
                      : 'New Category'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="text-[#806f77] hover:text-[#3e3037]"
                  >
                    <X size={18} />
                  </button>
                </div>

                {categoryError && <div className="mero-error mb-3">{categoryError}</div>}

                {/* Image Upload Area */}
                <div className="mb-4 p-4 border border-dashed border-[#c4a46d] bg-[#fdf8f5]">
                  <span className="block text-xs font-semibold text-[#49343f] uppercase tracking-wider mb-2">
                    {isAr ? 'صورة التصنيف الدائرية *' : 'Circular Category Image *'}
                  </span>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#c4a46d] bg-white flex-shrink-0 shadow-sm">
                      <img
                        src={editingCategory.image || '/products/embroidered-dress.svg'}
                        alt={editingCategory.name || 'Category'}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="solid-button text-xs py-2 px-3.5 cursor-pointer flex items-center gap-1.5">
                          <Upload size={14} />
                          <span>
                            {categoryUploading
                              ? isAr
                                ? 'جاري الرفع...'
                                : 'Uploading...'
                              : isAr
                              ? 'رفع صورة من الجهاز'
                              : 'Upload From Device'}
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleCategoryUploadFile}
                            disabled={categoryUploading}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <small className="text-[11px] text-[#7d6b73]">
                        {isAr
                          ? 'صيغ مدعومة: JPG, PNG, WebP (الحد الأقصى 5 ميجابايت). تظهر الصورة في إطار دائري أنيق على الصفحة الرئيسية.'
                          : 'Formats: JPG, PNG, WebP (max 5MB). Rendered as an elegant circular badge on the homepage.'}
                      </small>
                    </div>
                  </div>
                </div>

                <div className="mero-form-grid">
                  <label className="mero-field">
                    <span>{isAr ? 'الاسم بالإنجليزية *' : 'Name (English) *'}</span>
                    <input
                      required
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      placeholder="e.g. Embroidered Dresses"
                    />
                  </label>

                  <label className="mero-field">
                    <span>{isAr ? 'الاسم بالعربية *' : 'Name (Arabic) *'}</span>
                    <input
                      required
                      value={editingCategory.nameAr}
                      onChange={(e) => setEditingCategory({ ...editingCategory, nameAr: e.target.value })}
                      placeholder="مثال: فساتين مطرزة"
                      dir="rtl"
                    />
                  </label>

                  <label className="mero-field">
                    <span>{isAr ? 'فلتر تصنيف المنتجات *' : 'Product Category Filter *'}</span>
                    <input
                      required
                      value={editingCategory.filter}
                      onChange={(e) => setEditingCategory({ ...editingCategory, filter: e.target.value })}
                      placeholder="e.g. Dresses, Abayas, Kaftans..."
                    />
                    <small className="text-[11px] text-[#8a7a82]">
                      {isAr ? 'الاسم المطابق لتصنيف المنتجات في المتجر' : 'Matches product.category in catalog'}
                    </small>
                  </label>

                  <label className="mero-field">
                    <span>{isAr ? 'المعرّف البرمجي (Slug)' : 'Slug'}</span>
                    <input
                      value={editingCategory.slug}
                      onChange={(e) => setEditingCategory({ ...editingCategory, slug: e.target.value })}
                      placeholder="e.g. dresses"
                    />
                  </label>

                  <label className="mero-field">
                    <span>{isAr ? 'ترتيب الظهور' : 'Sort Order'}</span>
                    <input
                      type="number"
                      value={editingCategory.sort_order ?? 0}
                      onChange={(e) => setEditingCategory({ ...editingCategory, sort_order: Number(e.target.value) })}
                    />
                  </label>

                  <label className="mero-field">
                    <span>{isAr ? 'رابط الصورة المباشر (اختياري)' : 'Direct Image URL (Optional)'}</span>
                    <input
                      value={editingCategory.image}
                      onChange={(e) => setEditingCategory({ ...editingCategory, image: e.target.value })}
                      placeholder="https://... or /products/..."
                    />
                  </label>
                </div>

                <div className="mero-checks my-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#49343f]">
                    <input
                      type="checkbox"
                      checked={editingCategory.is_published !== false}
                      onChange={(e) => setEditingCategory({ ...editingCategory, is_published: e.target.checked })}
                    />
                    <span>{isAr ? 'منشور ومعروض على الصفحة الرئيسية' : 'Published on Homepage'}</span>
                  </label>
                </div>

                <div className="flex gap-2 mt-4 pt-3 border-t">
                  <button type="submit" disabled={loading || categoryUploading} className="solid-button text-xs py-2 px-4 flex items-center gap-1.5">
                    <Save size={14} />
                    <span>{isAr ? 'حفظ التعديلات' : 'Save Category'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="outline-button text-xs py-2 px-4"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </form>
            )}

            {/* Categories Table / Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {adminCategories.length === 0 ? (
                <div className="mero-empty col-span-full">
                  {isAr ? 'لا توجد تصنيفات مسجلة.' : 'No categories available.'}
                </div>
              ) : (
                adminCategories.map((cat, idx) => (
                  <article
                    key={cat.slug || cat.filter}
                    className="border bg-white p-4 flex flex-col justify-between shadow-xs transition-shadow hover:shadow-sm"
                  >
                    <div className="flex items-center gap-3.5 mb-3">
                      <div className="w-16 h-16 rounded-full overflow-hidden border border-[#c4a46d] bg-[#fbf1e8] flex-shrink-0">
                        <img
                          src={cat.image || '/products/embroidered-dress.svg'}
                          alt={cat.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-[#f5efec] text-[#49343f] px-1.5 py-0.5 font-semibold">
                            #{cat.sort_order ?? idx + 1}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 font-medium ${
                              cat.is_published !== false
                                ? 'bg-[#edf7ed] text-[#1e4620]'
                                : 'bg-[#f7eded] text-[#5e2020]'
                            }`}
                          >
                            {cat.is_published !== false
                              ? isAr
                                ? 'منشور'
                                : 'Published'
                              : isAr
                              ? 'مسودة'
                              : 'Draft'}
                          </span>
                        </div>
                        <h4 className="font-serif font-medium text-base text-[#49343f] mt-1 truncate">
                          {isAr ? cat.nameAr : cat.name}
                        </h4>
                        <p className="text-xs text-[#806f77] truncate">
                          {isAr ? cat.name : cat.nameAr}
                        </p>
                        <small className="text-[10px] text-[#9c8993] block mt-0.5">
                          Filter: <span className="font-mono">{cat.filter}</span>
                        </small>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t text-xs">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleCategoryPublished(cat)}
                          className="text-[#7d6b73] hover:text-[#49343f] underline text-[11px]"
                        >
                          {cat.is_published !== false
                            ? isAr
                              ? 'إخفاء'
                              : 'Hide'
                            : isAr
                            ? 'إظهار'
                            : 'Show'}
                        </button>
                        <span className="text-[#c4a46d]">·</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="text-[#b34040] hover:text-[#8a1c1c] text-[11px] flex items-center gap-0.5"
                          title={isAr ? 'حذف التصنيف' : 'Delete Category'}
                        >
                          <Trash2 size={12} />
                          <span>{isAr ? 'حذف' : 'Delete'}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEditCategory(cat)}
                        className="solid-button text-xs py-1.5 px-3 flex items-center gap-1"
                      >
                        <span>{isAr ? 'تعديل واستبدال الصورة' : 'Edit & Replace Image'}</span>
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

                  <div className="flex items-center gap-3 mb-3">
                    <label className="outline-button text-xs cursor-pointer flex items-center gap-1.5 px-3 py-2">
                      <Upload size={14} />
                      <span>
                        {galleryImageUploading
                          ? isAr
                            ? 'جارٍ الرفع إلى التخزين…'
                            : 'Uploading photo…'
                          : isAr
                          ? 'رفع صورة المعرض من جهازكِ'
                          : 'Upload gallery photo from device'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleGalleryImageFile}
                        disabled={galleryImageUploading}
                      />
                    </label>
                    <span className="text-[11px] text-[#806f77]">
                      {isAr
                        ? 'أو إدخال الرابط يدوياً أدناه (JPEG, PNG, WebP ≤ 5MB)'
                        : 'Or type image URL below (JPEG, PNG, WebP ≤ 5MB)'}
                    </span>
                  </div>

                  {galleryImageError && (
                    <div className="mero-error text-xs mb-3">{galleryImageError}</div>
                  )}

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
                    <option value="percentage">Percentage (%)</option>
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
                      {c.discount_type === 'percentage'
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2>{isAr ? 'الطلبات وسجل الحالات والمعاملات' : 'Orders & Payment Transactions'}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder={isAr ? 'بحث بالطلب، العميل، الهاتف...' : 'Search order #, customer, phone...'}
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="p-1.5 text-xs border border-stone-300 w-52 bg-white"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="p-1.5 text-xs border border-stone-300 bg-white"
                >
                  <option value="all">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
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
            {orders
              .filter((o) => {
                const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
                if (!matchesStatus) return false;
                if (!orderSearchQuery.trim()) return true;
                const q = orderSearchQuery.toLowerCase().trim();
                return (
                  (o.order_number && o.order_number.toLowerCase().includes(q)) ||
                  (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
                  (o.phone && o.phone.toLowerCase().includes(q)) ||
                  (o.governorate && o.governorate.toLowerCase().includes(q))
                );
              })
              .map((o) => (
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
                      <input
                        type="text"
                        placeholder={isAr ? 'ملاحظة التحديث (اختياري)...' : 'Update note (optional)...'}
                        value={orderStatusNotes[o.id] || ''}
                        onChange={(e) =>
                          setOrderStatusNotes({
                            ...orderStatusNotes,
                            [o.id]: e.target.value,
                          })
                        }
                        className="text-xs p-1 border w-44 bg-white"
                      />
                      <select
                        value={o.status}
                        onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                        className="text-xs p-1 border font-medium bg-white"
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

                  {/* Status History Audit Log */}
                  {o.status_history && o.status_history.length > 0 && (
                    <div className="w-full bg-white p-2 border text-xs">
                      <span className="font-semibold block text-[#49343f] mb-1">
                        {isAr ? 'سجل الحالات والملاحظات:' : 'Status History Log:'}
                      </span>
                      <div className="space-y-1">
                        {o.status_history.map((sh: any) => {
                          const time = sh.changed_at || sh.created_at;
                          const st = sh.new_status || sh.status;
                          const nt = sh.note || sh.notes;
                          return (
                            <div key={sh.id} className="flex items-center gap-2 text-[11px] text-[#604f57]">
                              <span className="text-[#806f77]">
                                {time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                              <span className="font-medium uppercase text-[#49343f]">[{st}]</span>
                              {nt && <span>— {nt}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </article>
              ))
            }
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
                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[rgba(73,52,63,0.1)]">
                      <span className="text-xs text-[#49343f] font-medium flex items-center gap-1">
                        <ImageIcon size={12} />
                        {isAr ? 'الصور المرجعية:' : 'Reference Photos:'}
                      </span>
                      {r.reference_image_urls.map((pathOrUrl: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          disabled={loadingRefImage}
                          onClick={async () => {
                            try {
                              setLoadingRefImage(true);
                              if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
                                setViewingRefImage(pathOrUrl);
                              } else {
                                const signedUrl = await getSignedDesignReferenceUrl(pathOrUrl, 3600);
                                setViewingRefImage(signedUrl);
                              }
                            } catch (err: any) {
                              setErrorMessage(
                                err?.message ||
                                  (isAr ? 'تعذر تحميل الصورة الخاصة' : 'Could not load private reference photo')
                              );
                            } finally {
                              setLoadingRefImage(false);
                            }
                          }}
                          className="px-2 py-0.5 bg-[#f5efec] text-[#49343f] text-xs hover:bg-[#ebdcd5] border border-[rgba(73,52,63,0.15)] flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isAr ? `صورة ${i + 1}` : `Photo ${i + 1}`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        )}
      </div>

      {/* Lightbox Modal for Private Bespoke Reference Photos */}
      {viewingRefImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setViewingRefImage(null)}
        >
          <div
            className="bg-white max-w-2xl w-full p-4 border border-[#c4a46d] shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-2 mb-3 border-b border-[rgba(73,52,63,0.1)]">
              <h4 className="font-serif font-medium text-sm text-[#49343f]">
                {isAr ? 'معاينة الصورة المرجعية الخاصة للطلب' : 'Client Private Reference Photo'}
              </h4>
              <button
                type="button"
                onClick={() => setViewingRefImage(null)}
                className="p-1 hover:bg-[#f5efec] text-[#49343f] cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-[#faf6f3]">
              <img
                src={viewingRefImage}
                alt="Bespoke Reference"
                className="max-h-[65vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
