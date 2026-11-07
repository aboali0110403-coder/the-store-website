import React, { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowLeft,
  ShoppingBag,
  MessageCircle,
  ShieldCheck,
  CheckCircle2,
  Tag,
  Truck,
  RotateCcw,
} from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { submitStoreOrder, validateCoupon, saveCustomerOrder } from '../lib/api';
import {
  formatEGP,
  resolveShippingRate,
  computeOrderTotals,
  validateOrderInput,
} from '../lib/commerceLogic';
import { CaptchaChallenge } from '../components/CaptchaChallenge';
import { Coupon } from '../lib/store';

const egyptianGovernorates = [
  'Cairo', 'Giza', 'Alexandria', 'Qalyubia', 'Dakahlia', 'Sharqia', 'Gharbia',
  'Monufia', 'Beheira', 'Kafr El Sheikh', 'Damietta', 'Port Said', 'Ismailia',
  'Suez', 'North Sinai', 'South Sinai', 'Fayoum', 'Beni Suef', 'Minya',
  'Assiut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea', 'New Valley', 'Matrouh',
];

export default function Checkout() {
  const { cart, cartTotal, language, clearBag, products, shippingRates } = useBoutique();
  const isAr = language === 'ar';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    governorate: '',
    area: '',
    address: '',
    notes: '',
  });

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  const [saving, setSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [completedOrder, setCompletedOrder] = useState<{
    order_id: string;
    order_number: string;
    customer_name: string;
    total: number;
    governorate: string;
  } | null>(null);

  // Line items joined with verified product data
  const lineItems = useMemo(
    () =>
      cart
        .map((item) => ({
          item,
          product: products.find((p) => p.id === item.productId),
        }))
        .filter(
          (entry): entry is { item: typeof cart[number]; product: typeof products[number] } =>
            Boolean(entry.product)
        ),
    [cart, products]
  );

  // Accurate shipping rate from Supabase database
  const shippingInfo = useMemo(() => {
    return resolveShippingRate(form.governorate, shippingRates);
  }, [form.governorate, shippingRates]);

  // Overall totals
  const totals = useMemo(() => {
    return computeOrderTotals({
      subtotal: cartTotal,
      shipping: shippingInfo.fee,
      discount: couponDiscount,
    });
  }, [cartTotal, shippingInfo.fee, couponDiscount]);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    setCouponSuccess('');

    if (!couponCode.trim()) return;

    try {
      const result = await validateCoupon(couponCode, cartTotal);
      if (result.valid) {
        setCouponDiscount(result.discount);
        setAppliedCoupon(result.coupon || null);
        setCouponSuccess(
          isAr
            ? `تم تطبيق الكوبون بنجاح! خصم ${formatEGP(result.discount, language)}`
            : `Coupon applied! ${formatEGP(result.discount, language)} discount`
        );
      } else {
        setCouponDiscount(0);
        setAppliedCoupon(null);
        setCouponError(
          result.error || (isAr ? 'كود الخصم غير صالح أو غير مستوفٍ للشروط' : 'Invalid coupon code')
        );
      }
    } catch {
      setCouponError(isAr ? 'تعذر التحقق من الكوبون حالياً' : 'Could not verify coupon');
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponError('');
    setCouponSuccess('');
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError('');
    setFieldErrors({});

    // Validate form inputs with pure logic
    const inputValidation = validateOrderInput({
      name: form.name,
      phone: form.phone,
      governorate: form.governorate,
      city_area: form.area,
      address: form.address,
    });

    if (!inputValidation.valid) {
      setFieldErrors(inputValidation.errors);
      setSubmissionError(
        isAr ? 'يرجى استكمال جميع بيانات التوصيل المطلوبة بشكل صحيح.' : 'Please correct the highlighted delivery fields.'
      );
      return;
    }

    if (!acceptedPolicies) {
      setSubmissionError(
        isAr ? 'يرجى الموافقة على شروط وسياسات المتجر للمتابعة.' : 'Please accept store terms and policies to proceed.'
      );
      return;
    }

    if (!isCaptchaValid) {
      setSubmissionError(
        isAr ? 'يرجى حل مسألة التحقق الأمني لتأكيد طلبك.' : 'Please solve the security verification challenge.'
      );
      return;
    }

    if (lineItems.length === 0) {
      setSubmissionError(isAr ? 'حقيبة التسوق فارغة.' : 'Your shopping bag is empty.');
      return;
    }

    setSaving(true);

    try {
      // Calls the official submit_store_order RPC
      // Prices are computed on PostgreSQL server side and NEVER trusted from frontend!
      const result = await submitStoreOrder({
        customer_name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        governorate: form.governorate,
        city_area: form.area,
        address: form.address,
        notes: form.notes
          ? `${form.notes}${appliedCoupon ? ` [Applied Coupon: ${appliedCoupon.code}]` : ''}`
          : appliedCoupon
          ? `[Applied Coupon: ${appliedCoupon.code}]`
          : undefined,
        payment_method: 'cash_on_delivery',
        items: lineItems.map(({ item }) => ({
          product_id: item.productId,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
        })),
      });

      setCompletedOrder({
        order_id: result.order_id,
        order_number: result.order_number,
        customer_name: form.name,
        total: totals.total,
        governorate: form.governorate,
      });

      // Save to device customer orders for instant lookup on /track-order
      saveCustomerOrder({
        id: result.order_id,
        order_number: result.order_number,
        customer_name: form.name,
        phone: form.phone,
        email: form.email || null,
        governorate: form.governorate,
        city_area: form.area,
        address: form.address,
        payment_method: 'cash_on_delivery',
        status: 'pending',
        subtotal_egp: totals.subtotal,
        shipping_egp: totals.shipping,
        total_egp: totals.total,
        admin_notes: appliedCoupon ? `Applied Coupon: ${appliedCoupon.code}` : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: lineItems.map(({ item, product }) => ({
          id: `item-${Date.now()}-${item.productId}`,
          order_id: result.order_id,
          product_id: item.productId,
          product_name_en: product?.name || 'Artisanal Garment',
          product_name_ar: product?.nameAr || 'قطعة أزياء تراثية',
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          unit_price_egp: product?.price || 0,
        })),
        status_history: [
          {
            id: `hist-${Date.now()}`,
            order_id: result.order_id,
            status: 'pending',
            notes: 'Order received via online checkout',
            created_at: new Date().toISOString(),
          },
        ],
      });

      clearBag();
    } catch (err) {
      setSubmissionError(
        err instanceof Error ? err.message : isAr ? 'تعذر إرسال الطلب. يرجى المحاولة ثانية.' : 'Could not submit order.'
      );
    } finally {
      setSaving(false);
    }
  };

  // Order Confirmation State
  if (completedOrder) {
    return (
      <main className="confirmation-page">
        <div className="confirmation-card">
          <div className="confirmation-mark">
            <CheckCircle2 size={32} />
          </div>
          <span className="eyebrow">MERO BOUTIQUE · ATELIER</span>
          <h1>{isAr ? 'تم استلام طلبك بنجاح' : 'Order Received'}</h1>
          <p>
            {isAr
              ? `شكراً لكِ يا ${completedOrder.customer_name}، تم تسجيل طلبك في نظام الدار وسيقوم فريق خدمة العملاء بالتواصل معك لتأكيد موعد التوصيل.`
              : `Thank you ${completedOrder.customer_name}. Your order has been recorded in our boutique system. Our concierge will contact you to confirm delivery details.`}
          </p>

          <div className="order-reference">
            <span>{isAr ? 'رقم الطلب المرجعي:' : 'Order Reference:'}</span>
            <strong>{completedOrder.order_number}</strong>
          </div>

          <div className="text-xs text-[#806f77] space-y-1 my-2">
            <div>
              {isAr ? 'الإجمالي النهائي:' : 'Final Total:'} <strong>{formatEGP(completedOrder.total, language)}</strong>
            </div>
            <div>
              {isAr ? 'وجهة الشحن:' : 'Delivery Destination:'} {completedOrder.governorate}
            </div>
            <div>
              {isAr ? 'طريقة الدفع:' : 'Payment:'} {isAr ? 'الدفع نقدياً عند الاستلام بعد المعاينة' : 'Cash on Delivery upon inspection'}
            </div>
          </div>

          <div className="confirmation-actions">
            <Link
              href={`/track-order?order=${completedOrder.order_number}`}
              className="solid-button"
            >
              <Truck size={16} />
              {isAr ? 'تتبع مسار طلبك مباشرة' : 'Track Order Progress'}
            </Link>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Hello Mero Boutique, I have submitted order #${completedOrder.order_number} for delivery to ${completedOrder.governorate}.`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="outline-button"
            >
              <MessageCircle size={16} />
              {isAr ? 'محادثة الأتيليه واتساب' : 'Chat with Concierge'}
            </a>
            <Link href="/shop" className="text-link">
              {isAr ? 'العودة للمتجر' : 'Return to Shop'}
            </Link>
          </div>

          <p className="confirmation-note">
            <ShieldCheck size={14} />
            {isAr
              ? 'حق الفحص والمعاينة مكفول لجميع عميلاتنا قبل سداد المبلغ للمندوب.'
              : 'Full right to inspect the garment before payment to courier.'}
          </p>
        </div>
      </main>
    );
  }

  // Empty Bag
  if (cart.length === 0) {
    return (
      <main className="empty-checkout">
        <ShoppingBag size={34} strokeWidth={1.2} />
        <span className="eyebrow">MERO BOUTIQUE</span>
        <h1>{isAr ? 'حقيبة التسوق فارغة' : 'Your bag is empty'}</h1>
        <p>{isAr ? 'أضيفي بعض الإبداعات الحصرية إلى حقيبتك قبل بدء الطلب.' : 'Select a handcrafted piece before starting checkout.'}</p>
        <Link href="/shop" className="solid-button">
          {isAr ? 'تصفحي المتجر' : 'Explore Collections'}
        </Link>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <div className="container checkout-header">
        <Link href="/shop" className="text-link">
          <ArrowLeft size={14} />
          {isAr ? 'العودة للمتجر' : 'Back to shop'}
        </Link>
        <Link href="/" className="checkout-logo-brand">
          <img src="/mero-logo.png" alt="Mero Boutique" className="checkout-logo-img" />
          <span>MERO / GUEST CHECKOUT</span>
        </Link>
        <div className="secure-label">
          <ShieldCheck size={14} />
          {isAr ? 'طلب ضيف آمن' : 'Encrypted Guest Checkout'}
        </div>
      </div>

      <div className="container checkout-layout">
        {/* Checkout Form */}
        <form className="checkout-form" onSubmit={handleSubmitOrder}>
          {/* Section 1: Delivery Details */}
          <div className="checkout-section-title">
            <span className="eyebrow">01</span>
            <div>
              <h1>{isAr ? 'بيانات التوصيل' : 'Delivery Details'}</h1>
              <p>
                {isAr
                  ? 'يتم الشحن كطلب ضيف دون الحاجة لتسجيل حساب مسبق.'
                  : 'Fast guest checkout. No password or prior account needed.'}
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <span>
                {isAr ? 'الاسم بالكامل' : 'Full Name'} <em>*</em>
              </span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={isAr ? 'مثال: نورهان أحمد' : 'e.g. Layla Hassan'}
              />
              {fieldErrors.name && <span className="text-[11px] text-[#a34d55]">{fieldErrors.name}</span>}
            </div>

            <div className="form-field">
              <span>
                {isAr ? 'رقم الهاتف (للتوصيل)' : 'Phone Number'} <em>*</em>
              </span>
              <input
                type="tel"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="01012345678"
              />
              {fieldErrors.phone && <span className="text-[11px] text-[#a34d55]">{fieldErrors.phone}</span>}
            </div>

            <div className="form-field">
              <span>{isAr ? 'البريد الإلكتروني (اختياري)' : 'Email Address (Optional)'}</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </div>

            <div className="form-field">
              <span>
                {isAr ? 'المحافظة' : 'Governorate'} <em>*</em>
              </span>
              <select
                required
                value={form.governorate}
                onChange={(e) => setForm({ ...form, governorate: e.target.value })}
              >
                <option value="">{isAr ? 'اختاري المحافظة…' : 'Select Governorate…'}</option>
                {egyptianGovernorates.map((gov) => (
                  <option key={gov} value={gov}>
                    {gov}
                  </option>
                ))}
              </select>
              {fieldErrors.governorate && (
                <span className="text-[11px] text-[#a34d55]">{fieldErrors.governorate}</span>
              )}
            </div>

            <div className="form-field">
              <span>
                {isAr ? 'المدينة أو المنطقة' : 'City / Area'} <em>*</em>
              </span>
              <input
                type="text"
                required
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder={isAr ? 'المعادي / التجمع / سموحة…' : 'e.g. New Cairo / Zamalek'}
              />
              {fieldErrors.city_area && (
                <span className="text-[11px] text-[#a34d55]">{fieldErrors.city_area}</span>
              )}
            </div>

            <div className="form-field form-field-wide">
              <span>
                {isAr ? 'العنوان بالتفصيل' : 'Street & Building Address'} <em>*</em>
              </span>
              <textarea
                required
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder={
                  isAr
                    ? 'اسم الشارع، رقم العمارة، الدور، رقم الشقة أو علامة مميزة'
                    : 'Street name, building number, floor, apartment or landmark'
                }
              />
              {fieldErrors.address && (
                <span className="text-[11px] text-[#a34d55]">{fieldErrors.address}</span>
              )}
            </div>

            <div className="form-field form-field-wide">
              <span>{isAr ? 'ملاحظات إضافية للتوصيل' : 'Delivery Notes'}</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={isAr ? 'أي مواعيد مفضلة أو إرشادات للمندوب' : 'Any preferred delivery timing'}
              />
            </div>
          </div>

          {/* Section 2: Payment Method */}
          <div className="checkout-section-title payment-title">
            <span className="eyebrow">02</span>
            <div>
              <h2>{isAr ? 'طريقة السداد' : 'Payment Method'}</h2>
              <p>
                {isAr
                  ? 'الدفع عند الاستلام بعد معاينة وفحص القطعة.'
                  : 'Cash on Delivery upon physical inspection of garment.'}
              </p>
            </div>
          </div>

          <div className="payment-options">
            <label className="payment-option selected">
              <input type="radio" name="payment_method" defaultChecked readOnly />
              <div>
                <strong>{isAr ? 'الدفع نقداً عند الاستلام (COD)' : 'Cash on Delivery (COD)'}</strong>
                <span>
                  {isAr
                    ? 'يحق لكِ فحص وتجربة القطعة والتأكد من المقاس والتطريز قبل دفع المبلغ للمندوب.'
                    : 'You have full right to open and inspect the piece before handing payment to the courier.'}
                </span>
              </div>
              <ShieldCheck size={20} className="text-[#c4a46d]" />
            </label>
          </div>

          {/* Section 3: Anti-Bot Security Verification */}
          <CaptchaChallenge
            language={language}
            onVerify={(valid) => setIsCaptchaValid(valid)}
          />

          {/* Policy consent */}
          <label className="policy-consent">
            <input
              type="checkbox"
              checked={acceptedPolicies}
              onChange={(e) => setAcceptedPolicies(e.target.checked)}
            />
            <span>
              {isAr ? (
                <>
                  أوافق على <Link href="/policies/terms">الشروط والأحكام</Link> و
                  <Link href="/policies/shipping">سياسة الشحن ومحافظات مصر</Link> و
                  <Link href="/policies/returns">حقوق الاستبدال والاسترجاع</Link>.
                </>
              ) : (
                <>
                  I agree to the <Link href="/policies/terms">Terms</Link>,{' '}
                  <Link href="/policies/shipping">Shipping Policy</Link>, and{' '}
                  <Link href="/policies/returns">Returns & Exchange Rights</Link>.
                </>
              )}
            </span>
          </label>

          {submissionError && (
            <p className="form-error" role="alert">
              {submissionError}
            </p>
          )}

          <button
            type="submit"
            className="solid-button full-width checkout-submit"
            disabled={saving}
          >
            {saving
              ? isAr
                ? 'جارٍ تسجيل الطلب في النظام…'
                : 'Recording order…'
              : isAr
              ? `تأكيد الطلب بمبلغ ${formatEGP(totals.total, language)}`
              : `Submit Order · ${formatEGP(totals.total, language)}`}
          </button>

          <p className="checkout-disclaimer">
            {isAr
              ? 'يُسجل الطلب مباشرة عبر النظام المشفر، ويتواصل معكِ الأتيليه لتأكيد التفاصيل.'
              : 'Directly verified through Supabase store RPC with zero frontend price tampering.'}
          </p>
        </form>

        {/* Order Summary & Coupon Workflow */}
        <aside className="order-summary">
          <div className="summary-heading">
            <span className="eyebrow">MERO / ORDER</span>
            <h2>{isAr ? 'ملخص الطلب' : 'Summary'}</h2>
          </div>

          <div className="summary-items">
            {lineItems.map(({ item, product }) => (
              <div
                key={`${item.productId}-${item.size}-${item.color}`}
                className="summary-item"
              >
                <img src={product.image} alt={product.alt} />
                <div>
                  <h3>{isAr ? product.nameAr : product.name}</h3>
                  <p>
                    {item.size} · {item.color} · {item.quantity} × {formatEGP(product.price, language)}
                  </p>
                  <div className="summary-item-bottom">
                    <span>{formatEGP(product.price * item.quantity, language)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Coupon Input Workflow */}
          <div className="border-t border-[rgba(73,52,63,0.16)] pt-4 mt-4">
            <span className="text-[11px] font-semibold text-[#49343f] uppercase tracking-wider block mb-2">
              {isAr ? 'كوبون الخصم' : 'Promotion or Gift Code'}
            </span>
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-[#fffaf8] border border-[#c4a46d] p-2.5">
                <div className="flex items-center gap-2 text-xs text-[#567c4b] font-medium">
                  <Tag size={14} />
                  <span>
                    {appliedCoupon.code} ({formatEGP(couponDiscount, language)} off)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="text-[10px] text-[#a34d55] underline uppercase"
                >
                  {isAr ? 'إلغاء' : 'Remove'}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: MERO10' : 'Code (e.g. MERO10)'}
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  className="flex-1 h-9 px-3 border border-[rgba(73,52,63,0.2)] bg-white text-xs uppercase"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="outline-button min-h-[36px] px-3 text-xs"
                >
                  {isAr ? 'تطبيق' : 'Apply'}
                </button>
              </div>
            )}
            {couponError && <p className="text-[11px] text-[#a34d55] mt-1 m-0">{couponError}</p>}
            {couponSuccess && <p className="text-[11px] text-[#567c4b] mt-1 m-0">{couponSuccess}</p>}
          </div>

          {/* Subtotal, Shipping, Discount, Total */}
          <div className="summary-totals">
            <div>
              <span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <strong>{formatEGP(totals.subtotal, language)}</strong>
            </div>

            <div>
              <span>
                {isAr ? 'رسوم الشحن' : 'Shipping'}
                {form.governorate ? ` (${form.governorate})` : ''}
              </span>
              <strong>
                {form.governorate ? (
                  shippingInfo.isConfigured ? (
                    formatEGP(shippingInfo.fee, language)
                  ) : (
                    isAr ? 'يُحدد بعد مراجعة العنوان' : 'Calculated after review'
                  )
                ) : (
                  <span className="text-[#806f77] text-[11px]">
                    {isAr ? 'حددي المحافظة' : 'Select governorate'}
                  </span>
                )}
              </strong>
            </div>

            {totals.discount > 0 && (
              <div style={{ color: '#567c4b' }}>
                <span>{isAr ? 'الخصم المطبق' : 'Coupon Discount'}</span>
                <strong>−{formatEGP(totals.discount, language)}</strong>
              </div>
            )}

            <div className="summary-total">
              <span>{isAr ? 'الإجمالي النهائي' : 'Final Total'}</span>
              <strong>{formatEGP(totals.total, language)}</strong>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
