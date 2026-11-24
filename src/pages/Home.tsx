import React from 'react';
import { Link } from 'wouter';
import { ArrowRight, Heart, Plus } from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { formatEGP } from '../lib/commerceLogic';

export default function Home() {
  const { language, products, categories, toggleWishlist, isWishlisted, addToBag, loadingCatalog, catalogReadStatus } = useBoutique();
  const isAr = language === 'ar';
  const pieces = products.filter((product) => product.isPublished !== false);
  const featured = pieces.find((product) => product.isFeatured) || pieces[0];
  const liveCategories = categories.filter((category) => category.is_published !== false).length > 0
    ? categories.filter((category) => category.is_published !== false)
    : Array.from(new Map(pieces.map((product) => [product.category, {
        filter: product.category,
        name: product.category,
        nameAr: product.categoryAr,
        id: `live-${product.category}`,
        is_published: true,
        image: '',
      }])).values());

  return (
    <main className="atelier-home">
      <section className="atelier-opening">
        {featured && featured.image && (
          <img
            className="atelier-opening-image"
            src={featured.image}
            alt={featured.alt || (isAr ? featured.nameAr : featured.name)}
          />
        )}
        <div className="atelier-opening-scrim" aria-hidden="true" />
        <div className="atelier-opening-copy">
          <h1>{isAr ? 'قطعة تُصنع بيد واحدة، غرزةً بعد غرزة.' : 'One maker. Each piece, stitch by stitch.'}</h1>
          <p className="atelier-origin atelier-location">{isAr ? 'ميرو بوتيك · المنصورة، مصر' : 'Mero Boutique · Mansoura, Egypt'}</p>
          <p className="atelier-intro">
            {isAr
              ? 'مشغل مستقل تديره مؤسسته؛ تصمم وتخيط وتطرز بنفسها. نحو خمس سنوات من العمل والتواصل المباشر مع عميلاتها.'
              : 'An independent atelier run by its founder, who designs, sews and hand-embroiders each piece. About five years of craft and direct customer relationships.'}
          </p>
          <div className="atelier-actions">
            <Link href="/shop" className="solid-button">
              {isAr ? 'تصفحي الكتالوج' : 'Browse the live catalog'} <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/custom-design" className="outline-button atelier-ghost-on-image">
              {isAr ? 'ابدئي طلب تصميم خاص' : 'Start a custom request'}
            </Link>
          </div>
          <p className="atelier-owner-note">
            {isAr ? 'مُصمّمة، خيّاطة، ومطرّزة — كل ذلك بيد المؤسسة.' : 'Designed, sewn and embroidered by the founder.'}
          </p>
        </div>

        <div className="atelier-feature" aria-live="polite">
          {featured ? (
            <div className="atelier-feature-chip">
              <Link href={`/shop/${featured.slug}`} className="atelier-feature-chip-text" aria-label={`${isAr ? featured.nameAr : featured.name} — ${isAr ? 'عرض التفاصيل' : 'view piece'}`}>
                <span>{isAr ? 'من الكتالوج المنشور' : 'From the published catalog'}</span>
                <strong>{isAr ? featured.nameAr : featured.name}</strong>
                <em>{formatEGP(featured.price, language)} <span aria-hidden="true">·</span> {isAr ? featured.categoryAr : featured.category}</em>
              </Link>
              <button
                type="button"
                className={`atelier-save ${isWishlisted(featured.id) ? 'is-saved' : ''}`}
                onClick={() => toggleWishlist(featured.id)}
                aria-label={isWishlisted(featured.id) ? (isAr ? 'إزالة من المفضلة' : 'Remove from wishlist') : (isAr ? 'إضافة إلى المفضلة' : 'Add to wishlist')}
              >
                <Heart size={18} fill={isWishlisted(featured.id) ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="atelier-feature-empty">
              <span>{loadingCatalog ? (isAr ? 'جارٍ تحديث الكتالوج' : 'Refreshing the catalog') : (isAr ? 'الكتالوج المنشور' : 'Published catalog')}</span>
              <p>{loadingCatalog
                ? (isAr ? 'جارٍ تحميل القطع المنشورة…' : 'Loading published pieces…')
                : catalogReadStatus === 'unavailable'
                  ? (isAr ? 'تعذر تحميل القطع الآن. يمكنك إرسال طلب تصميم خاص.' : 'Pieces could not be loaded right now. You can still send a custom request.')
                  : (isAr ? 'لا توجد قطع منشورة للعرض حاليًا. يمكنك طلب تصميم خاص.' : 'There are no published pieces to show right now. You can request a custom design.')}</p>
            </div>
          )}
        </div>
      </section>

      {liveCategories.length > 0 && (
        <section className="atelier-categories" aria-labelledby="atelier-categories-title">
          <div className="atelier-section-heading">
            <div>
              <h2 id="atelier-categories-title">{isAr ? 'تصفحي حسب التصنيف' : 'Browse by category'}</h2>
            </div>
            <Link className="text-link" href="/shop">{isAr ? 'كل القطع' : 'All pieces'} <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <nav className="atelier-category-cards" aria-label={isAr ? 'تصنيفات الكتالوج' : 'Catalog categories'}>
            {liveCategories.map((category) => (
              <Link key={category.id || category.filter} href={`/shop?category=${encodeURIComponent(category.filter)}`} className="atelier-category-card">
                {category.image ? (
                  <img src={category.image} alt="" loading="lazy" />
                ) : null}
                <span className="atelier-category-card-scrim" aria-hidden="true" />
                <span className="atelier-category-card-label">
                  <span>{isAr ? category.nameAr : category.name}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </nav>
        </section>
      )}

      <section className="atelier-catalog" aria-labelledby="atelier-catalog-title">
        <div className="atelier-section-heading atelier-section-heading-center">
          <div>
            <h2 id="atelier-catalog-title">{isAr ? 'من مشغل ميرو' : 'From the Mero atelier'}</h2>
          </div>
          <Link className="text-link" href="/shop">{isAr ? 'افتحي المتجر' : 'Open the shop'} <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        {pieces.length > 0 ? (
          <div className="atelier-piece-list">
            {pieces.slice(0, 3).map((product) => (
              <article className="atelier-piece" key={product.id}>
                <Link href={`/shop/${product.slug}`} className="atelier-piece-image">
                  {product.image ? <img src={product.image} alt={product.alt || (isAr ? product.nameAr : product.name)} loading="lazy" /> : <span>{isAr ? 'الصورة غير متاحة' : 'Image not available'}</span>}
                </Link>
                <button
                  type="button"
                  className={`atelier-piece-save ${isWishlisted(product.id) ? 'is-saved' : ''}`}
                  onClick={() => toggleWishlist(product.id)}
                  aria-label={isWishlisted(product.id) ? (isAr ? 'إزالة من المفضلة' : 'Remove from wishlist') : (isAr ? 'إضافة إلى المفضلة' : 'Add to wishlist')}
                >
                  <Heart size={16} fill={isWishlisted(product.id) ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
                <div className="atelier-piece-copy">
                  <span>{isAr ? product.categoryAr : product.category}</span>
                  <h3><Link href={`/shop/${product.slug}`}>{isAr ? product.nameAr : product.name}</Link></h3>
                  <strong>{formatEGP(product.price, language)}</strong>
                </div>
                <button
                  type="button"
                  className="atelier-add"
                  disabled={(product.production === 'ready' || product.production === 'limited') && product.stock <= 0}
                  onClick={() => addToBag(product.id, product.sizes[0] || 'Standard', product.colors[0] || 'Signature', 1)}
                  aria-label={`${isAr ? 'إضافة' : 'Add'} ${isAr ? product.nameAr : product.name} ${isAr ? 'إلى الحقيبة' : 'to bag'}`}
                >
                  <Plus size={17} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="atelier-empty" role="status" aria-live="polite">{loadingCatalog
            ? isAr ? 'جارٍ تحميل الكتالوج…' : 'Loading the catalog…'
            : catalogReadStatus === 'unavailable'
              ? isAr ? 'تعذر تحميل القطع المنشورة الآن.' : 'Published pieces could not be loaded right now.'
              : isAr ? 'لا توجد قطع منشورة للعرض في الوقت الحالي.' : 'No published pieces are available to display at the moment.'}</p>
        )}
      </section>

      <section className="atelier-custom-callout">
        <div className="atelier-custom-inner">
          <h2>{isAr ? 'لديكِ فكرة لتصميم خاص؟' : 'Have an idea for a piece of your own?'}</h2>
          <Link href="/custom-design" className="outline-button atelier-ghost-on-olive">{isAr ? 'أرسلي طلبك' : 'Send a custom request'} <ArrowRight size={16} aria-hidden="true" /></Link>
          <p>{isAr ? 'طلبات التصميم الخاص تُراجع بشكل منفصل عن طلبات القطع الجاهزة.' : 'Custom design requests are reviewed separately from ready-made orders.'}</p>
        </div>
      </section>
    </main>
  );
}
