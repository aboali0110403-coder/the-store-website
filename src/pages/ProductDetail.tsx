import React, { useEffect, useMemo, useState } from 'react';
import { useRoute, Link } from 'wouter';
import {
  ArrowLeft,
  Heart,
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  Truck,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { Product, ProductGalleryImage } from '../lib/store';
import { fetchProductBySlug } from '../lib/api';
import { getProductSpecificationRows } from '../lib/productPresentation';
import { formatEGP } from '../lib/commerceLogic';

export default function ProductDetail() {
  const [, params] = useRoute('/shop/:slug');
  const slug = params?.slug;
  const { language, products, addToBag, toggleWishlist, isWishlisted } = useBoutique();
  const isAr = language === 'ar';

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [addedNotice, setAddedNotice] = useState(false);

  useEffect(() => {
    if (!slug) {
      setProduct(null);
      setLoading(false);
      return;
    }
    let isMounted = true;
    const applyProduct = (next: Product | null) => {
      setProduct(next);
      if (next) {
        setActiveImage(next.image);
        setSelectedSize(next.sizes[0] || '');
        setSelectedColor(next.colors[0] || '');
      }
    };

    // Resolve details from the authoritative slug lookup only. The catalog
    // can change while it loads and must not trigger a duplicate detail query.
    setProduct(null);
    setLoading(true);
    const lookupTimeout = window.setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 8000);

    fetchProductBySlug(slug)
      .then((res) => {
        if (!isMounted) return;
        window.clearTimeout(lookupTimeout);
        applyProduct(res);
        setLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        window.clearTimeout(lookupTimeout);
        applyProduct(null);
        setLoading(false);
      });

    return () => {
      isMounted = false;
      window.clearTimeout(lookupTimeout);
    };
  }, [slug]);

  // Gallery images combined: main product image + product_images table gallery
  const allImages = useMemo(() => {
    if (!product) return [];
    const list: string[] = [product.image];
    if (product.images && product.images.length > 0) {
      product.images.forEach((img) => {
        if (img.image_url && !list.includes(img.image_url)) {
          list.push(img.image_url);
        }
      });
    }
    return list;
  }, [product]);

  // Active variant resolution from product_variants table
  const currentVariant = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return null;
    return product.variants.find(
      (v) =>
        v.is_active &&
        (!selectedSize || v.size.toLowerCase() === selectedSize.toLowerCase()) &&
        (!selectedColor || v.color.toLowerCase() === selectedColor.toLowerCase())
    );
  }, [product, selectedSize, selectedColor]);

  const hasConfiguredVariants = useMemo(() => {
    return Boolean(product?.variants && product.variants.some((v) => v.is_active));
  }, [product?.variants]);

  // Real-time stock determination: strict variant stock if variants exist; never falls back to base stock
  const availableStock = useMemo(() => {
    if (!product) return 0;
    if (hasConfiguredVariants) {
      return currentVariant ? currentVariant.stock : 0;
    }
    return product.stock;
  }, [product, hasConfiguredVariants, currentVariant]);

  const specificationRows = useMemo(
    () => getProductSpecificationRows(product, language),
    [product, language]
  );

  const isInventoryControlled =
    product?.production === 'ready' || product?.production === 'limited';

  // Out of stock if:
  // 1. Inventory controlled AND availableStock <= 0
  // 2. Or product has variants configured, but selected size/color does not match any active variant
  const isOutOfStock = Boolean(
    isInventoryControlled && (availableStock <= 0 || (hasConfiguredVariants && !currentVariant))
  );
  const maxAllowedQuantity = isInventoryControlled ? Math.max(1, availableStock) : 20;

  const handleAddToBag = () => {
    if (!product || isOutOfStock) return;
    addToBag(product.id, selectedSize || 'Standard', selectedColor || 'Signature', quantity);
    setAddedNotice(true);
    setTimeout(() => setAddedNotice(false), 2500);
  };

  if (loading) {
    return (
      <main className="container" style={{ minHeight: '60vh', padding: '80px 0', textAlign: 'center' }}>
        <p className="text-[#806f77]">{isAr ? 'جارٍ تحميل تفاصيل القطعة…' : 'Loading atelier piece…'}</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="container" style={{ minHeight: '60vh', padding: '80px 0', textAlign: 'center' }}>
        <h1 className="text-3xl text-[#49343f]">{isAr ? 'القطعة غير متوفرة' : 'Piece not found'}</h1>
        <p className="text-[#806f77] my-4">
          {isAr
            ? 'قد تكون هذه القطعة بيعت بالكامل أو تم نقلها إلى الأرشيف.'
            : 'This piece may have sold out or been moved to the atelier archive.'}
        </p>
        <Link href="/shop" className="solid-button">
          {isAr ? 'العودة للمتجر' : 'Return to Shop'}
        </Link>
      </main>
    );
  }

  const wish = isWishlisted(product.id);
  const related = products.filter((p) => p.id !== product.id && p.category === product.category).slice(0, 3);

  return (
    <main className="product-detail-page">
      <div className="container">
        {/* Breadcrumb navigation */}
        <div className="breadcrumbs">
          <Link href="/">{isAr ? 'الرئيسية' : 'Home'}</Link>
          <span>/</span>
          <Link href="/shop">{isAr ? 'المتجر' : 'Shop'}</Link>
          <span>/</span>
          <Link href={`/shop?category=${encodeURIComponent(product.category)}`}>
            {isAr ? product.categoryAr : product.category}
          </Link>
          <span>/</span>
          <span style={{ color: '#49343f', fontWeight: 500 }}>
            {isAr ? product.nameAr : product.name}
          </span>
        </div>

        <div className="product-detail-layout">
          {/* Gallery View */}
          <div className="product-gallery">
            <div className="gallery-main">
              {product.badge && <span className="product-badge">{product.badge}</span>}
              <img src={activeImage || product.image} alt={product.alt} />
            </div>

            {allImages.length > 1 && (
              <div className="gallery-thumbs">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    className={activeImage === img ? 'active' : ''}
                    onClick={() => setActiveImage(img)}
                    aria-label={`View photo ${i + 1}`}
                  >
                    <img src={img} alt={`${product.name} thumbnail ${i + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Specifications & Order Actions */}
          <div className="product-detail-copy">
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {isAr ? product.categoryAr : product.category} · MERO ATELIER
            </span>

            <div className="detail-title-row">
              <h1>{isAr ? product.nameAr : product.name}</h1>
              <button
                type="button"
                className={`detail-wishlist ${wish ? 'is-saved' : ''}`}
                onClick={() => toggleWishlist(product.id)}
                aria-label="Wishlist"
              >
                <Heart size={18} fill={wish ? 'currentColor' : 'none'} />
              </button>
            </div>

            <div className="detail-price-row">
              <strong>{formatEGP(product.price, language)}</strong>
              {product.compareAt && (
                <span className="line-through text-[#806f77] text-sm">
                  {formatEGP(product.compareAt, language)}
                </span>
              )}
              {product.compareAt && (
                <span className="text-[11px] text-[#567c4b] font-semibold uppercase tracking-wider">
                  {isAr ? 'سعر خاص' : 'Privilege Price'}
                </span>
              )}
            </div>

            <p className="detail-description">{isAr ? product.descriptionAr : product.description}</p>

            <div className="detail-rule" />

            {/* Sizes Selection */}
            {product.sizes.length > 0 && (
              <div className="detail-option">
                <div className="option-heading">
                  <span>{isAr ? 'المقاس' : 'Size'}</span>
                  <strong>{selectedSize}</strong>
                </div>
                <div className="size-options">
                  {product.sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={selectedSize === s ? 'selected' : ''}
                      onClick={() => setSelectedSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Colors Selection */}
            {product.colors.length > 0 && (
              <div className="detail-option">
                <div className="option-heading">
                  <span>{isAr ? 'اللون' : 'Color'}</span>
                  <strong>{selectedColor}</strong>
                </div>
                <div className="color-options">
                  {product.colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={selectedColor === c ? 'selected' : ''}
                      onClick={() => setSelectedColor(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Real-time Stock & Production Badge */}
            <div className="production-note">
              <span
                className="production-dot"
                style={{
                  background: isOutOfStock
                    ? '#a34d55'
                    : product.production === 'ready'
                    ? '#567c4b'
                    : product.production === 'limited'
                    ? '#806f77'
                    : '#c4a46d',
                }}
              />
              <div>
                <strong>
                  {isOutOfStock
                    ? isAr
                      ? 'نفدت الكمية المتاحة للشحن الفوري'
                      : 'Out of Stock'
                    : product.production === 'ready'
                    ? isAr
                      ? `جاهز للشحن الفوري (${availableStock} متوفر في المخزون)`
                      : `Ready to Ship (${availableStock} in stock)`
                    : product.production === 'limited'
                    ? isAr
                      ? `إصدار محدود حصري (${availableStock} متبقي)`
                      : `Limited Atelier Edition (${availableStock} remaining)`
                    : isAr
                    ? 'يُنفّذ حسب الطلب (تفصيل وتطريز يدوي خاص للأتيليه)'
                    : 'Made to Order (Bespoke Hand Embroidery)'}
                </strong>
                <p>
                  {product.production === 'made-to-order'
                    ? isAr
                      ? 'يتم تنفيذ هذه القطعة خصيصاً بمقاساتك بعد مراجعة الطلب مع الأتيليه، ولا تخضع لقيود نفاذ المخزون الجاهز.'
                      : 'Crafted individually to order by our Cairo artisans upon consultation; not limited by ready-made stock.'
                    : isAr
                    ? product.deliveryAr
                    : product.delivery}
                </p>
              </div>
            </div>

            {/* Quantity and Add to Bag */}
            <div className="flex items-center gap-3 mt-6">
              <div className="quantity-control h-12 px-2 border border-[rgba(73,52,63,0.22)]">
                <button
                  type="button"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Decrease quantity"
                  disabled={isOutOfStock}
                >
                  −
                </button>
                <span className="w-8 text-center font-medium">{quantity}</span>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity(Math.min(20, Math.min(maxAllowedQuantity, quantity + 1)))
                  }
                  aria-label="Increase quantity"
                  disabled={isOutOfStock || quantity >= maxAllowedQuantity}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                className="solid-button flex-1 detail-add"
                onClick={handleAddToBag}
                disabled={isOutOfStock}
              >
                {addedNotice ? (
                  <>
                    <Check size={16} />
                    {isAr ? 'تمت الإضافة للحقيبة' : 'Added to Bag'}
                  </>
                ) : isOutOfStock ? (
                  isAr ? 'نفدت الكمية' : 'Out of Stock'
                ) : (
                  <>
                    <ShoppingBag size={16} />
                    {isAr ? 'إضافة إلى حقيبة التسوق' : 'Add to Shopping Bag'}
                  </>
                )}
              </button>
            </div>

            {/* Boutique Guarantees */}
            <div className="detail-assurances">
              <div>
                <ShieldCheck size={16} />
                <span>
                  {isAr
                    ? 'ضمان جودة الخامات الطبيعية والتطريز اليدوي المصري'
                    : 'Authentic Egyptian craftsmanship guarantee'}
                </span>
              </div>
              <div>
                <Truck size={16} />
                <span>
                  {isAr
                    ? 'توصيل متاح لجميع محافظات جمهورية مصر العربية'
                    : 'Express courier across all 27 governorates'}
                </span>
              </div>
            </div>

            {/* Accordion Details */}
            <div className="detail-accordions">
              {specificationRows.length > 0 && (
                <details open>
                  <summary>{isAr ? 'الخامة وتقنية التطريز' : 'Fabric & Embroidery Technique'}</summary>
                  <p>
                    {specificationRows.map((row) => (
                      <span key={row.key} className="block">
                        <strong>{row.label}: </strong>
                        {row.value}
                      </span>
                    ))}
                  </p>
                </details>
              )}

              <details>
                <summary>{isAr ? 'إرشادات العناية والحفظ' : 'Care & Maintenance'}</summary>
                <p>
                  {isAr
                    ? product.careAr || 'يُنصح بالتنظيف الجاف المتخصص للحفاظ على رونق الخيوط المذهبة والتطريز اليدوي.'
                    : product.care || 'Specialist dry clean only to preserve bullion and hand-needlework integrity.'}
                </p>
              </details>

              <details>
                <summary>{isAr ? 'سياسة الشحن والاستبدال' : 'Shipping & Returns Policy'}</summary>
                <p>
                  {isAr
                    ? 'تخضع جميع الطلبات لقانون حماية المستهلك المصري، مع إمكانية الفحص عند الاستلام.'
                    : 'Subject to Egyptian consumer protection law with inspection permitted on delivery.'}{' '}
                  <Link href="/policies/shipping">
                    {isAr ? 'اقرئي المزيد عن الشحن' : 'Read shipping policies'}
                  </Link>
                  .
                </p>
              </details>
            </div>
          </div>
        </div>

        {/* Related Pieces */}
        {related.length > 0 && (
          <div className="related-section section">
            <div className="section-heading-row">
              <h2>{isAr ? 'قطع قد تنال إعجابك' : 'Complementary Pieces'}</h2>
              <Link href="/shop" className="text-link">
                {isAr ? 'تصفحي المزيد' : 'View more'}
              </Link>
            </div>
            <div className="product-grid">
              {related.map((rel) => (
                <article key={rel.id} className="product-card">
                  <div className="product-image-wrap">
                    <Link href={`/shop/${rel.slug}`} className="product-image-link">
                      <img src={rel.image} alt={rel.alt} />
                    </Link>
                  </div>
                  <div className="product-card-copy">
                    <h3>
                      <Link href={`/shop/${rel.slug}`}>{isAr ? rel.nameAr : rel.name}</Link>
                    </h3>
                    <p>{isAr ? rel.categoryAr : rel.category}</p>
                    <div className="product-meta">
                      <strong>{formatEGP(rel.price, language)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
