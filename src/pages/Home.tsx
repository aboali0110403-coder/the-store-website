import React from 'react';
import { Link } from 'wouter';
import { ArrowRight, Sparkles, Heart, Plus } from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { categories, collections, copy } from '../lib/store';
import { formatEGP } from '../lib/commerceLogic';

export default function Home() {
  const { language, products, toggleWishlist, isWishlisted, addToBag } = useBoutique();
  const isAr = language === 'ar';
  const t = copy[language];

  const featuredProducts = products.filter((p) => p.isFeatured).slice(0, 3);
  const displayProducts = featuredProducts.length > 0 ? featuredProducts : products.slice(0, 3);

  return (
    <main>
      {/* Editorial Split Hero Section */}
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            <span>MERO BOUTIQUE · CAIRO</span>
          </div>
          <h1>{t.wearArt}</h1>
          <p>{t.heroText}</p>
          <div className="hero-actions">
            <Link href="/shop" className="solid-button">
              {t.explore}
              <ArrowRight size={15} />
            </Link>
            <Link href="/custom-design" className="outline-button">
              {t.customDesign}
            </Link>
          </div>
          <div className="hero-note">
            <span className="hero-note-mark" aria-hidden="true">
              <img src="/mero-logo.png" alt="Mero Monogram" className="hero-note-logo" />
            </span>
            <span>
              {isAr
                ? 'كل قطعة هي تحفة فنية صنعت بكل شغف و إتقان في ورشتي الصغيرة'
                : 'Every piece is an artistic masterpiece crafted with passion and perfection in my small atelier.'}
            </span>
          </div>
        </div>
        <div className="hero-image-wrap">
          <img
            src="/products/embroidered-dress.svg"
            alt="Mero Boutique Signature Hand-Embroidered Gown"
          />
          <div className="hero-image-caption">
            <span>{isAr ? 'قطعة الموسم الحصرية' : 'Signature Edition'}</span>
            <span>{isAr ? 'كتان وحرير مصري نقي' : 'Pure Egyptian Silk-Linen'}</span>
          </div>
        </div>
      </section>

      {/* Intro Motto Strip */}
      <div className="intro-strip">
        <div className="container intro-strip-inner">
          <p>
            {isAr
              ? '«نحن لا نصنع مجرد أزياء، بل نحيي تراث التطريز اليدوي لترتديه المرأة الواثقة كلوحة فنية تنبض بالحياة»'
              : '“We curate garments not as fleeting trends, but as enduring heirlooms that celebrate the poise of the modern woman.”'}
          </p>
          <Link href="/our-story" className="circle-arrow" aria-label="Our Story">
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      {/* Circular Categories Grid */}
      <section className="section">
        <div className="container">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-line" />
                {isAr ? 'التصنيفات' : 'Categories'}
              </span>
              <h2>{isAr ? 'تسوقي حسب التصنيف' : 'Explore By Category'}</h2>
            </div>
            <Link href="/shop" className="text-link">
              {t.shopAll} <ArrowRight size={14} />
            </Link>
          </div>

          <div className="category-grid">
            {categories.map((cat, index) => (
              <Link
                key={cat.filter}
                href={`/shop?category=${encodeURIComponent(cat.filter)}`}
                className="category-card"
              >
                <div className="category-image">
                  <span className="category-index">0{index + 1}</span>
                  <img src={cat.image} alt={cat.name} />
                </div>
                <div className="category-label">
                  <span>{isAr ? cat.nameAr : cat.name}</span>
                  <Sparkles size={13} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Pieces */}
      <section className="section products-section" style={{ background: '#fffaf8' }}>
        <div className="container">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-line" />
                {isAr ? 'مختارات الموسم' : 'Curated Selection'}
              </span>
              <h2>{isAr ? 'أحدث الإبداعات الحصرية' : 'Exclusive Arrivals'}</h2>
            </div>
            <Link href="/shop" className="text-link">
              {isAr ? 'عرض الكتالوج الكامل' : 'View Full Catalog'} <ArrowRight size={14} />
            </Link>
          </div>

          <div className="product-grid">
            {displayProducts.map((product) => {
              const wish = isWishlisted(product.id);
              return (
                <article key={product.id} className="product-card">
                  <div className="product-image-wrap">
                    {product.badge && <span className="product-badge">{product.badge}</span>}
                    <button
                      type="button"
                      className={`wishlist-button ${wish ? 'is-saved' : ''}`}
                      onClick={() => toggleWishlist(product.id)}
                      aria-label="Save to wishlist"
                    >
                      <Heart size={16} fill={wish ? 'currentColor' : 'none'} />
                    </button>
                    <Link href={`/shop/${product.slug}`} className="product-image-link">
                      <img src={product.image} alt={product.alt} />
                    </Link>
                    <Link href={`/shop/${product.slug}`} className="quick-view">
                      {isAr ? 'عرض التفاصيل' : 'View Piece'}
                    </Link>
                  </div>
                  <div className="product-card-copy">
                    <div className="product-card-heading">
                      <h3>
                        <Link href={`/shop/${product.slug}`}>
                          {isAr ? product.nameAr : product.name}
                        </Link>
                      </h3>
                      <button
                        type="button"
                        className="add-mini"
                        onClick={() =>
                          addToBag(
                            product.id,
                            product.sizes[0] || 'Standard',
                            product.colors[0] || 'Signature',
                            1
                          )
                        }
                        title="Add to bag"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                    <p>{isAr ? product.categoryAr : product.category}</p>
                    <div className="product-meta">
                      <strong>{formatEGP(product.price, language)}</strong>
                      <span className="text-[11px] text-[#806f77]">
                        {product.production === 'ready'
                          ? isAr
                            ? 'جاهز للشحن'
                            : 'Ready to ship'
                          : isAr
                          ? 'تنفيذ يدوي'
                          : 'Made to order'}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* The Craft Section */}
      <section className="craft-section">
        <div className="container craft-layout">
          <div className="craft-main">
            <span className="eyebrow" style={{ color: '#49343f' }}>
              <span className="eyebrow-line" style={{ background: '#49343f' }} />
              {isAr ? 'أصالة الحرفة المصرية' : 'Atelier Philosophy'}
            </span>
            <h2>{isAr ? 'الفن في أدق تفاصيل الغرزة' : 'Art in Every Single Stitch'}</h2>
            <p>
              {isAr
                ? 'ننتقي أجود أنواع الكتان المصري الطبيعي والحرير الفاخر، وتمر كل قطعة بأيدي أمهر الحرفيات في القاهرة لصياغة تطريز يدوي متقن يستغرق عشرات الساعات من التفاني.'
                : 'Each silhouette begins with pure unadulterated fabrics: Egyptian Giza cotton voile, artisanal washed linen, and mulberry silk. Our artisans spend dozens of hours hand-guiding silk threads.'}
            </p>
            <Link href="/our-story" className="solid-button">
              {t.craftCta}
            </Link>
          </div>

          <div className="craft-collage">
            <div className="craft-card craft-card-large">
              <img src="/products/golden-kaftan.svg" alt="Gold thread artisan work" />
              <div>
                <span>{isAr ? 'خيوط مذهبة' : 'Gilded Needlework'}</span>
                <strong>{isAr ? 'تطريز سيوة التراثي' : 'Siwan Sunburst Geometry'}</strong>
                <small>{isAr ? 'أكثر من ٤٠ ساعة عمل يدوي' : '40+ hours of hand embroidery'}</small>
              </div>
            </div>
            <div className="craft-card craft-card-small">
              <img src="/products/ivory-set.svg" alt="Pure linen tailoring" />
              <div>
                <span>{isAr ? 'خامات طبيعية' : 'Pure Fibers'}</span>
                <strong>{isAr ? 'كتان مغسول فاخر' : 'Egyptian Washed Linen'}</strong>
              </div>
            </div>
            <div className="craft-card-note bg-[#fffaf8]">
              <Sparkles size={20} />
              <p>
                {isAr
                  ? '«كل تصميم قطعة فريدة لا تتكرر، صُنعت لتبقى جيلاً بعد جيل»'
                  : '“Crafted to transcend fleeting fashion seasons.”'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Curated Collections Rail */}
      <section className="section">
        <div className="container">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">
                <span className="eyebrow-line" />
                {isAr ? 'المجموعات الحصرية' : 'The Atelier Series'}
              </span>
              <h2>{isAr ? 'عوالم ميرو الإبداعية' : 'Curated Collections'}</h2>
            </div>
          </div>

          <div className="collection-rail">
            {collections.map((col) => (
              <Link key={col.title} href="/shop" className="collection-card">
                <img src={col.image} alt={col.title} />
                <div className="collection-overlay">
                  <div>
                    <span className="collection-count">{col.count}</span>
                    <h3>{isAr ? col.titleAr : col.title}</h3>
                    <p>{isAr ? col.textAr : col.text}</p>
                  </div>
                  <div className="circle-arrow circle-arrow-light">
                    <ArrowRight size={17} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Atelier Numbers & Integrity */}
      <section className="stats-band">
        <div className="container stats-inner">
          <div className="stats-intro">
            <span className="eyebrow eyebrow-light">
              <span className="eyebrow-line" />
              {isAr ? 'قيم الدار' : 'By The Numbers'}
            </span>
            <h2>{isAr ? 'دقة لا تساوم' : 'Uncompromising Poise'}</h2>
            <p>
              {isAr
                ? 'نؤمن بالإنتاج الواعي والقطع المحدودة التي تحترم جهد الحرفي المصري وتمنحك التميز المستحق.'
                : 'We produce in strictly mindful micro-batches, ensuring that ethical artisan craftsmanship is celebrated.'}
            </p>
          </div>

          <div className="stats-grid">
            <div>
              <strong>100%</strong>
              <span>{isAr ? 'خامات مصرية وطبيعية' : 'Pure Natural Fibers'}</span>
            </div>
            <div>
              <strong>90+</strong>
              <span>{isAr ? 'ساعات تطريز يدوي' : 'Max Hand-Sewn Hours'}</span>
            </div>
            <div>
              <strong>30%</strong>
              <span>{isAr ? 'عربون طلبات خاصة' : 'Custom Design Deposit'}</span>
            </div>
            <div>
              <strong>27</strong>
              <span>{isAr ? 'محافظة نغطيها بالشحن' : 'Egyptian Governorates'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="newsletter-section">
        <div className="container newsletter-inner">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {isAr ? 'النشرة الحصرية' : 'The Atelier Journal'}
            </span>
            <h2>{t.newsletter}</h2>
            <p>{t.newsletterText}</p>
          </div>

          <form
            className="newsletter-form"
            onSubmit={(e) => {
              e.preventDefault();
              alert(
                isAr
                  ? 'شكراً لانضمامك إلى مجتمع ميرو بوتيك الراقي.'
                  : 'Thank you for subscribing to Mero Boutique.'
              );
            }}
          >
            <input
              type="email"
              required
              placeholder={isAr ? 'أدخلي بريدك الإلكتروني' : 'Enter your email address'}
            />
            <button type="submit" className="solid-button">
              {t.subscribe}
            </button>
            <small>
              {isAr
                ? 'نحترم خصوصيتك بالكامل ولا نرسل إلا ما يليق بذوقك الرفيع.'
                : 'We honor your privacy. Unsubscribe at any time.'}
            </small>
          </form>
        </div>
      </section>
    </main>
  );
}
