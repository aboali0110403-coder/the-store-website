import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Search,
  Truck,
  CheckCircle2,
  Clock,
  Sparkles,
  Package,
  MapPin,
  Calendar,
  AlertCircle,
  MessageCircle,
  Printer,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { lookupPublicOrder, getCustomerOrders } from '../lib/api';
import {
  formatEGP,
  computeOrderMilestones,
  normalizeOrderNumber,
  validateOrderNumberInput,
  OrderMilestone,
} from '../lib/commerceLogic';
import { Order } from '../lib/store';

export default function TrackOrder() {
  const { language } = useBoutique();
  const isAr = language === 'ar';
  const [, setLocation] = useLocation();

  const [orderQuery, setOrderQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [searchedNumber, setSearchedNumber] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);

  // Load any previously placed orders from local storage
  useEffect(() => {
    setCustomerOrders(getCustomerOrders());
  }, []);

  // Check URL query parameters for ?order=MERO-...
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlOrder = params.get('order');
      if (urlOrder) {
        setOrderQuery(urlOrder);
        performLookup(urlOrder);
      }
    }
  }, []);

  const performLookup = async (queryToSearch: string) => {
    const validation = validateOrderNumberInput(queryToSearch);
    if (!validation.valid) {
      setErrorMessage(
        isAr
          ? 'يرجى إدخال رقم طلب صحيح (مثال: MERO-1001)'
          : 'Please enter a valid order reference (e.g. MERO-1001)'
      );
      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSearchedNumber(validation.normalized);

    try {
      const result = await lookupPublicOrder(validation.normalized);
      if (!result) {
        setOrder(null);
        setErrorMessage(
          isAr
            ? `لم نعثر على طلب بالرقم "${validation.normalized}". يرجى التأكد من الرقم أو التواصل مع خدمة عملاء الأتيليه عبر واتساب.`
            : `No order found with reference "${validation.normalized}". Please verify the number or contact our Atelier Concierge.`
        );
      } else {
        setOrder(result);
        // Sync URL query without full reload
        const newUrl = `${window.location.pathname}?order=${encodeURIComponent(validation.normalized)}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
      }
    } catch (err) {
      setOrder(null);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : isAr
          ? 'حدث خطأ أثناء البحث عن الطلب. يرجى المحاولة لاحقاً.'
          : 'Error looking up order. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(orderQuery);
  };

  const handleSelectSample = (sampleNumber: string) => {
    setOrderQuery(sampleNumber);
    performLookup(sampleNumber);
  };

  const milestones: OrderMilestone[] = order ? computeOrderMilestones(order.status) : [];

  // Helper for human-readable localized status label
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return isAr ? 'قيد المراجعة' : 'Order Received';
      case 'confirmed':
        return isAr ? 'تم تأكيد الطلب' : 'Atelier Confirmed';
      case 'in_production':
        return isAr ? 'جاري التطريز والتحضير' : 'In Handcrafting & Inspection';
      case 'ready_to_ship':
        return isAr ? 'جاهز للشحن' : 'Ready for Dispatch';
      case 'shipped':
        return isAr ? 'جاري التوصيل مع المندوب' : 'Out for Delivery';
      case 'delivered':
        return isAr ? 'تم الاستلام بنجاح' : 'Delivered';
      case 'cancelled':
        return isAr ? 'تم الإلغاء' : 'Cancelled';
      default:
        return status;
    }
  };

  // Estimate delivery arrival based on creation date and governorate
  const getEstimatedDelivery = (orderDateStr: string, governorate: string) => {
    const created = new Date(orderDateStr);
    const minDays = governorate === 'Cairo' || governorate === 'Giza' ? 2 : 4;
    const maxDays = governorate === 'Cairo' || governorate === 'Giza' ? 3 : 6;

    const minDate = new Date(created.getTime() + minDays * 24 * 60 * 60 * 1000);
    const maxDate = new Date(created.getTime() + maxDays * 24 * 60 * 60 * 1000);

    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
    };

    const locale = isAr ? 'ar-EG' : 'en-US';
    return `${minDate.toLocaleDateString(locale, options)} – ${maxDate.toLocaleDateString(locale, options)}`;
  };

  return (
    <div className="order-tracking-page">
      {/* Editorial Header */}
      <section className="tracking-hero">
        <div className="container">
          <div className="tracking-hero-content">
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {isAr ? 'خدمة عملاء أتيليه ميرو' : 'MERO ATELIER CONCIERGE'}
              <span className="eyebrow-line" />
            </span>
            <h1>{isAr ? 'تتبع مسار طلبك التراثي' : 'Track Your Handcrafted Order'}</h1>
            <p>
              {isAr
                ? 'تابعي مراحل تنفيذ طلبك من خيوط التطريز الأولى في ورشتنا بالقاهرة وحتى التسليم عند باب منزلك مع كامل حق الفحص والمعاينة.'
                : 'Follow every stage of your order, from the initial hand-guided needlework at our Cairo atelier to doorstep delivery with full inspection privileges.'}
            </p>

            {/* Order Lookup Search Form */}
            <form onSubmit={handleSearchSubmit} className="tracking-search-form" role="search">
              <div className="search-input-wrap">
                <Search size={18} className="search-icon" aria-hidden="true" />
                <input
                  type="text"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder={isAr ? 'أدخلي رقم الطلب (مثال: MERO-1001)' : 'Enter Order Number (e.g. MERO-1001)'}
                  className="search-input"
                  aria-label={isAr ? 'رقم الطلب' : 'Order Reference Number'}
                  autoComplete="off"
                  spellCheck="false"
                />
                {orderQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderQuery('');
                      setOrder(null);
                      setErrorMessage('');
                    }}
                    className="clear-search-btn"
                    aria-label={isAr ? 'مسح' : 'Clear'}
                  >
                    ×
                  </button>
                )}
              </div>
              <button type="submit" disabled={loading} className="solid-button tracking-submit-btn">
                {loading ? (
                  <span>{isAr ? 'جاري البحث...' : 'Searching...'}</span>
                ) : (
                  <>
                    <span>{isAr ? 'تتبع الطلب' : 'Track Order'}</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </form>

            {/* Quick Sample Selector for immediate test & customer convenience */}
            <div className="tracking-samples">
              <span className="samples-label">{isAr ? 'أرقام طلبات تجريبية:' : 'Try sample orders:'}</span>
              <div className="samples-tags">
                <button
                  type="button"
                  onClick={() => handleSelectSample('MERO-1001')}
                  className="sample-tag-btn"
                >
                  MERO-1001 ({isAr ? 'جاري التطريز' : 'In Crafting'})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSample('MERO-1002')}
                  className="sample-tag-btn"
                >
                  MERO-1002 ({isAr ? 'مع المندوب' : 'Out for Delivery'})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSample('MERO-1003')}
                  className="sample-tag-btn"
                >
                  MERO-1003 ({isAr ? 'تم التسليم' : 'Delivered'})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSample('MERO-1004')}
                  className="sample-tag-btn"
                >
                  MERO-1004 ({isAr ? 'تم التأكيد' : 'Confirmed'})
                </button>
              </div>
            </div>

            {/* Customer's placed orders on this browser */}
            {customerOrders.length > 0 && (
              <div className="customer-recent-orders">
                <span className="recent-orders-title">
                  <Clock size={13} />
                  {isAr ? 'طلباتكِ المسجلة على هذا الجهاز:' : 'Orders placed on this device:'}
                </span>
                <div className="recent-orders-list">
                  {customerOrders.map((co) => (
                    <button
                      key={co.order_number}
                      type="button"
                      onClick={() => handleSelectSample(co.order_number)}
                      className={`recent-order-chip ${order?.order_number === co.order_number ? 'active' : ''}`}
                    >
                      <strong>{co.order_number}</strong>
                      <span>·</span>
                      <span>{getStatusLabel(co.status)}</span>
                      <span>·</span>
                      <span>{formatEGP(co.total_egp || 0, language)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <section className="tracking-main-section">
        <div className="container">
          {/* Error Message Notice */}
          {errorMessage && (
            <div className="tracking-error-notice" role="alert">
              <AlertCircle size={20} className="error-icon" />
              <div>
                <p>{errorMessage}</p>
                <div className="error-actions">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Hello Mero Boutique Concierge, I need assistance locating my order #${searchedNumber || orderQuery}.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="whatsapp-help-link"
                  >
                    <MessageCircle size={14} />
                    {isAr ? 'مساعدة عبر واتساب الأتيليه' : 'Contact Atelier WhatsApp Concierge'}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Active Order Results Card */}
          {order && (
            <div className="order-details-card" id="printable-order-slip">
              {/* Header Ribbon */}
              <div className="order-header-row">
                <div>
                  <div className="order-number-title">
                    <img src="/mero-logo.png" alt="Mero Boutique" className="track-order-logo-img" />
                    <h2>#{order.order_number}</h2>
                  </div>
                  {/* Zero-pill metadata row */}
                  <div className="order-meta-text">
                    <span>
                      {isAr ? 'تاريخ الطلب:' : 'Ordered:'}{' '}
                      {new Date(order.created_at).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{order.governorate}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {order.payment_method === 'cash_on_delivery'
                        ? isAr
                          ? 'الدفع عند الاستلام'
                          : 'Cash on Delivery (COD)'
                        : order.payment_method}
                    </span>
                  </div>
                </div>

                <div className="order-status-current">
                  <div className="status-indicator">
                    <span className={`status-dot ${order.status}`} />
                    <strong>{getStatusLabel(order.status)}</strong>
                  </div>
                  {order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <div className="delivery-estimate">
                      <Calendar size={13} />
                      <span>
                        {isAr ? 'الموعد المتوقع للوصول:' : 'Estimated Delivery:'}{' '}
                        <strong>{getEstimatedDelivery(order.created_at, order.governorate)}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Visual 5-Milestone Progression Timeline */}
              <div className="timeline-container">
                <h3 className="timeline-section-title">
                  {isAr ? 'مراحل تنفيذ وتوصيل الطلب' : 'Artisanal Order Journey'}
                </h3>
                <div className="timeline-steps">
                  {milestones.map((m) => {
                    const isDone = m.progress === 'completed';
                    const isCurrent = m.progress === 'current';

                    return (
                      <div
                        key={m.key}
                        className={`timeline-step ${m.progress}`}
                      >
                        <div className="timeline-marker">
                          {isDone ? (
                            <CheckCircle2 size={18} className="marker-icon done" />
                          ) : isCurrent ? (
                            <span className="marker-current-ring">
                              <span className="marker-inner-dot" />
                            </span>
                          ) : (
                            <span className="marker-number">{m.step}</span>
                          )}
                          <div className="timeline-connector-bar" />
                        </div>
                        <div className="timeline-info">
                          <h4>{isAr ? m.titleAr : m.titleEn}</h4>
                          <p>{isAr ? m.descAr : m.descEn}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order Content Grid (Garments + Destination) */}
              <div className="order-content-grid">
                {/* Garments List */}
                <div className="order-items-column">
                  <h3>{isAr ? 'القطع المطلوبة' : 'Order Garments'}</h3>
                  <div className="items-table">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item) => (
                        <div key={item.id} className="order-item-row">
                          <div className="item-details">
                            <h4>{isAr ? item.product_name_ar : item.product_name_en}</h4>
                            <div className="item-specs">
                              <span>
                                {isAr ? 'المقاس:' : 'Size:'} <strong>{item.size}</strong>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {isAr ? 'اللون:' : 'Color:'} <strong>{item.color}</strong>
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {isAr ? 'الكمية:' : 'Qty:'} <strong>{item.quantity}</strong>
                              </span>
                            </div>
                          </div>
                          <div className="item-price">
                            <strong>{formatEGP(item.unit_price_egp * item.quantity, language)}</strong>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="no-items-text">
                        {isAr ? 'تفاصيل القطع مسجلة لدى الأتيليه.' : 'Garment details logged with atelier concierge.'}
                      </p>
                    )}
                  </div>

                  {/* Pricing Breakdown */}
                  <div className="pricing-breakdown">
                    <div className="price-row">
                      <span>{isAr ? 'قيمة القطع:' : 'Subtotal:'}</span>
                      <span>{formatEGP(order.subtotal_egp, language)}</span>
                    </div>
                    <div className="price-row">
                      <span>
                        {isAr ? `شحن محافظة (${order.governorate}):` : `Shipping (${order.governorate}):`}
                      </span>
                      <span>
                        {order.shipping_egp && order.shipping_egp > 0
                          ? formatEGP(order.shipping_egp, language)
                          : isAr
                          ? 'شحن مجاني'
                          : 'Free'}
                      </span>
                    </div>
                    <div className="price-row total-row">
                      <span>{isAr ? 'الإجمالي المستحق للمندوب:' : 'Total Payable on Delivery:'}</span>
                      <strong>{formatEGP(order.total_egp || order.subtotal_egp, language)}</strong>
                    </div>
                  </div>
                </div>

                {/* Delivery & Concierge Notes */}
                <div className="order-delivery-column">
                  <h3>{isAr ? 'بيانات التوصيل والمعاينة' : 'Delivery & Inspection'}</h3>

                  <div className="delivery-card-inner">
                    <div className="destination-block">
                      <div className="destination-icon">
                        <MapPin size={18} />
                      </div>
                      <div>
                        <strong>{order.customer_name}</strong>
                        <p>{order.governorate} · {order.city_area}</p>
                        <p className="address-sub">{order.address}</p>
                      </div>
                    </div>

                    <div className="delivery-perk-box">
                      <ShieldCheck size={18} className="perk-icon" />
                      <div>
                        <strong>{isAr ? 'حق المعاينة والفحص أولاً' : 'Doorstep Inspection Right'}</strong>
                        <p>
                          {isAr
                            ? 'يحق لكِ فحص التطريز والخامات والقياس بحضور مندوب التوصيل قبل دفع المبلغ.'
                            : 'You have full right to inspect fabric, stitching, and finishing prior to payment.'}
                        </p>
                      </div>
                    </div>

                    {order.admin_notes && (
                      <div className="atelier-notes-box">
                        <Sparkles size={16} className="notes-icon" />
                        <div>
                          <strong>{isAr ? 'ملاحظات الأتيليه:' : 'Atelier Notes:'}</strong>
                          <p>{order.admin_notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Concierge Actions */}
                    <div className="concierge-actions-group">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `Hello Mero Boutique! I am following up on order #${order.order_number} for delivery to ${order.governorate}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="solid-button full-width"
                      >
                        <MessageCircle size={16} />
                        {isAr ? 'محادثة الأتيليه عبر واتساب' : 'Inquire via WhatsApp'}
                      </a>

                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="outline-button full-width print-btn"
                      >
                        <Printer size={16} />
                        {isAr ? 'طباعة بيان الطلب' : 'Print Order Slip'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status History Audit Log */}
              {order.status_history && order.status_history.length > 0 && (
                <div className="status-history-section">
                  <h3>{isAr ? 'سجل تحديثات الطلب' : 'Status History Log'}</h3>
                  <div className="history-timeline">
                    {order.status_history.map((hist) => (
                      <div key={hist.id} className="history-entry">
                        <span className="history-time">
                          {new Date(hist.created_at).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="history-dot" />
                        <div className="history-text">
                          <strong>{getStatusLabel(hist.status)}</strong>
                          {hist.notes && <p>{hist.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty State / How it works */}
          {!order && !loading && !errorMessage && (
            <div className="tracking-guide-card">
              <div className="guide-header">
                <h2>{isAr ? 'كيف تتابعين مسار قطعتكِ؟' : 'How Order Tracking Works'}</h2>
                <p>
                  {isAr
                    ? 'في ميرو بوتيك، نولي كل قطعة رعاية استثنائية من غرزة الإبرة إلى التسليم.'
                    : 'Every silhouette receives bespoke artisan dedication, from the first thread to doorstep presentation.'}
                </p>
              </div>

              <div className="guide-grid">
                <div className="guide-item">
                  <div className="guide-icon">
                    <Package size={22} />
                  </div>
                  <h4>{isAr ? '١. رقم الطلب المرجعي' : '1. Order Reference'}</h4>
                  <p>
                    {isAr
                      ? 'يظهر رقم الطلب فور إتمام الشراء، ويبدأ عادةً بـ MERO- (مثل MERO-1001).'
                      : 'Generated upon checkout confirmation, starting with MERO- (e.g. MERO-1001).'}
                  </p>
                </div>

                <div className="guide-item">
                  <div className="guide-icon">
                    <Sparkles size={22} />
                  </div>
                  <h4>{isAr ? '٢. متابعة التطريز' : '2. Needlework Progress'}</h4>
                  <p>
                    {isAr
                      ? 'يتم تحديث حالة القطعة لحظة بلحظة أثناء التفصيل وفحص الجودة في القاهرة.'
                      : 'Status is updated live as our Cairo artisans guide silk threads and perform quality checks.'}
                  </p>
                </div>

                <div className="guide-item">
                  <div className="guide-icon">
                    <Truck size={22} />
                  </div>
                  <h4>{isAr ? '٣. شحن لجميع المحافظات' : '3. Doorstep Delivery'}</h4>
                  <p>
                    {isAr
                      ? 'شحن سريع لـ ٢٧ محافظة مصرية مع حق المعاينة الكامل قبل سداد الدفع عند الاستلام.'
                      : 'White-glove delivery across 27 Egyptian governorates with full preview inspection.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
