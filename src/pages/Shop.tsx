import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Search, SlidersHorizontal, Heart, Plus, Sparkles } from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { Product } from '../lib/store';
import { formatEGP } from '../lib/commerceLogic';

export default function Shop() {
  const { language, products, toggleWishlist, isWishlisted, addToBag } = useBoutique();
  const [location] = useLocation();
  const isAr = language === 'ar';

  // Read initial category from query string if available
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'newest'>('featured');
  const [selectedSize, setSelectedSize] = useState<string>('All');
  const [selectedProduction, setSelectedProduction] = useState<string>('All');
  const [mobileFiltersVisible, setMobileFiltersVisible] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('category');
    if (cat) {
      setSelectedCategory(cat);
    }
  }, [location]);

  const categories = useMemo(
    () => ['All', 'Dresses', 'Abayas', 'Kaftans', 'Tops', 'Sets', 'Exclusive Pieces'],
    []
  );

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.sizes.forEach((s) => set.add(s)));
    return ['All', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
        if (selectedSize !== 'All' && !p.sizes.includes(selectedSize)) return false;
        if (selectedProduction !== 'All' && p.production !== selectedProduction) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = p.name.toLowerCase().includes(q) || p.nameAr.includes(q);
          const matchDesc = p.description.toLowerCase().includes(q) || p.descriptionAr.includes(q);
          const matchFabric = p.fabric.toLowerCase().includes(q) || p.fabricAr.includes(q);
          if (!matchName && !matchDesc && !matchFabric) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.price - b.price;
        if (sortBy === 'price-desc') return b.price - a.price;
        if (sortBy === 'newest') return (b.isPublished ? 1 : 0) - (a.isPublished ? 1 : 0);
        return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
      });
  }, [products, selectedCategory, selectedSize, selectedProduction, searchQuery, sortBy]);

  return (
    <main>
      <div className="page-intro">
        <div className="container page-intro-inner">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {isAr ? 'كتالوج ميرو الفاخر' : 'The Mero Boutique Catalog'}
            </span>
            <h1>{isAr ? 'مجموعات الأزياء الراقية' : 'Artisanal Collections'}</h1>
            <p>
              {isAr
                ? 'استكشفي أزياء ميرو المتميزة بالتطريز اليدوي والتصاميم الراقية المصنوعة في مصر بأعلى معايير الإتقان.'
                : 'Explore refined Egyptian handcrafted dresses, kaftans, abayas, and coordinated sets tailored for enduring grace.'}
            </p>
          </div>
          <span className="page-intro-note">
            {filteredProducts.length} {isAr ? 'قطعة معروضة' : 'pieces available'}
          </span>
        </div>
      </div>

      <div className="container shop-content">
        {/* Search and sort toolbar */}
        <div className="shop-toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              type="text"
              placeholder={isAr ? 'ابحثي عن فستان، خامة، تطريز…' : 'Search by piece, fabric, embroidery…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="filter-toggle"
            onClick={() => setMobileFiltersVisible(!mobileFiltersVisible)}
          >
            <SlidersHorizontal size={14} />
            {isAr ? 'تصفية النتائج' : 'Filters'}
          </button>

          <div className="sort-select">
            <label htmlFor="sort-select" className="sr-only">
              Sort by
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="featured">{isAr ? 'الأكثر تميزاً' : 'Featured'}</option>
              <option value="price-asc">{isAr ? 'السعر: من الأقل للأعلى' : 'Price: Low to High'}</option>
              <option value="price-desc">{isAr ? 'السعر: من الأعلى للأقل' : 'Price: High to Low'}</option>
              <option value="newest">{isAr ? 'أحدث الإضافات' : 'Newest'}</option>
            </select>
          </div>
        </div>

        <div className={`shop-grid-layout ${mobileFiltersVisible ? 'filters-visible' : ''}`}>
          {/* Filters Sidebar */}
          <aside className="filter-panel">
            <div className="filter-panel-header">
              <span>{isAr ? 'تصفية القطع' : 'Filter Pieces'}</span>
              {(selectedCategory !== 'All' || selectedSize !== 'All' || selectedProduction !== 'All') && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSelectedSize('All');
                    setSelectedProduction('All');
                    setSearchQuery('');
                  }}
                >
                  {isAr ? 'إعادة ضبط' : 'Reset'}
                </button>
              )}
            </div>

            {/* Categories */}
            <div className="filter-group">
              <h3>{isAr ? 'التصنيف' : 'Category'}</h3>
              <div className="filter-options">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={selectedCategory === cat ? 'selected' : ''}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat === 'All' ? (isAr ? 'جميع القطع' : 'All Pieces') : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Production State */}
            <div className="filter-group">
              <h3>{isAr ? 'نوع التنفيذ' : 'Production Type'}</h3>
              <div className="filter-options">
                <button
                  type="button"
                  className={selectedProduction === 'All' ? 'selected' : ''}
                  onClick={() => setSelectedProduction('All')}
                >
                  {isAr ? 'الكل' : 'All Types'}
                </button>
                <button
                  type="button"
                  className={selectedProduction === 'ready' ? 'selected' : ''}
                  onClick={() => setSelectedProduction('ready')}
                >
                  {isAr ? 'جاهز للشحن الفوري' : 'Ready to Ship'}
                </button>
                <button
                  type="button"
                  className={selectedProduction === 'made-to-order' ? 'selected' : ''}
                  onClick={() => setSelectedProduction('made-to-order')}
                >
                  {isAr ? 'تنفيذ يدوي مخصص' : 'Made to Order'}
                </button>
                <button
                  type="button"
                  className={selectedProduction === 'limited' ? 'selected' : ''}
                  onClick={() => setSelectedProduction('limited')}
                >
                  {isAr ? 'إصدار محدود' : 'Limited Edition'}
                </button>
              </div>
            </div>

            {/* Sizes */}
            <div className="filter-group">
              <h3>{isAr ? 'المقاس' : 'Size'}</h3>
              <div className="filter-options filter-pills">
                {availableSizes.map((s) => (
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
          </aside>

          {/* Product Grid */}
          <div className="shop-results">
            {filteredProducts.length === 0 ? (
              <div className="empty-results">
                <Sparkles size={32} />
                <h2>{isAr ? 'لم نعثر على قطع مطابقة' : 'No matching pieces found'}</h2>
                <p>
                  {isAr
                    ? 'جربي إزالة بعض خيارات التصفية أو البحث عن كلمة أخرى.'
                    : 'Try clearing some filters or exploring a different category.'}
                </p>
                <button
                  type="button"
                  className="solid-button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setSelectedSize('All');
                    setSelectedProduction('All');
                    setSearchQuery('');
                  }}
                >
                  {isAr ? 'عرض جميع القطع' : 'View All Pieces'}
                </button>
              </div>
            ) : (
              <div className="product-grid">
                {filteredProducts.map((product) => {
                  const wish = isWishlisted(product.id);
                  const isStockControlled =
                    product.production === 'ready' || product.production === 'limited';
                  const isSoldOut = isStockControlled && product.stock <= 0;

                  return (
                    <article key={product.id} className="product-card">
                      <div className="product-image-wrap">
                        {isSoldOut ? (
                          <span className="product-badge" style={{ background: '#a34d55' }}>
                            {isAr ? 'نفدت الكمية' : 'Out of Stock'}
                          </span>
                        ) : product.badge ? (
                          <span className="product-badge">{product.badge}</span>
                        ) : null}
                        <button
                          type="button"
                          className={`wishlist-button ${wish ? 'is-saved' : ''}`}
                          onClick={() => toggleWishlist(product.id)}
                          aria-label="Toggle wishlist"
                        >
                          <Heart size={16} fill={wish ? 'currentColor' : 'none'} />
                        </button>
                        <Link href={`/shop/${product.slug}`} className="product-image-link">
                          <img src={product.image} alt={product.alt} />
                        </Link>
                        <Link href={`/shop/${product.slug}`} className="quick-view">
                          {isAr ? 'عرض التفاصيل والمقاسات' : 'View Details & Sizes'}
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
                            className={`add-mini ${isSoldOut ? 'opacity-40 cursor-not-allowed' : ''}`}
                            disabled={isSoldOut}
                            onClick={() => {
                              if (isSoldOut) return;
                              addToBag(
                                product.id,
                                product.sizes[0] || 'Standard',
                                product.colors[0] || 'Signature',
                                1
                              );
                            }}
                            aria-label={
                              isSoldOut
                                ? isAr
                                  ? 'نفدت الكمية'
                                  : 'Out of Stock'
                                : `Add ${product.name} to bag`
                            }
                            title={isSoldOut ? (isAr ? 'نفدت الكمية' : 'Out of Stock') : undefined}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <p>{isAr ? product.categoryAr : product.category}</p>
                        <div className="product-meta">
                          <strong>{formatEGP(product.price, language)}</strong>
                          <span
                            className={`text-[11px] ${
                              isSoldOut
                                ? 'text-[#a34d55] font-semibold'
                                : product.production === 'ready'
                                ? 'text-[#567c4b]'
                                : product.production === 'limited'
                                ? 'text-[#806f77] font-medium'
                                : 'text-[#c4a46d]'
                            }`}
                          >
                            {isSoldOut
                              ? isAr
                                ? 'نفدت الكمية'
                                : 'Out of Stock'
                              : product.production === 'ready'
                              ? isAr
                                ? 'جاهز للشحن'
                                : 'Ready'
                              : product.production === 'limited'
                              ? isAr
                                ? 'إصدار محدود'
                                : 'Limited'
                              : isAr
                              ? 'يُنفّذ حسب الطلب'
                              : 'Made to Order'}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
