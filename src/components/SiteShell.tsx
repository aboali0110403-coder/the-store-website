import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  ShoppingBag,
  Heart,
  Menu,
  X,
  ArrowRight,
  ShieldCheck,
  Instagram,
  Mail,
  Sparkles,
  Truck,
} from 'lucide-react';
import {
  Language,
  Product,
  CartItem,
  ShippingRate,
  CategoryItem,
  initialCategories,
  readStorage,
  writeStorage,
  copy,
  initialArtisanProducts,
} from '../lib/store';
import { fetchCatalog, fetchShippingRates, fetchCategories } from '../lib/api';
import { formatEGP, mergeCartItems } from '../lib/commerceLogic';

interface BoutiqueContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  cart: CartItem[];
  addToBag: (productId: string, size: string, color: string, quantity?: number) => void;
  updateQuantity: (productId: string, size: string, color: string, quantity: number) => void;
  removeFromBag: (productId: string, size: string, color: string) => void;
  clearBag: () => void;
  cartCount: number;
  cartTotal: number;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  products: Product[];
  categories: CategoryItem[];
  shippingRates: ShippingRate[];
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  refreshCatalog: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  loadingCatalog: boolean;
}

const BoutiqueContext = createContext<BoutiqueContextType | null>(null);

export function useBoutique() {
  const ctx = useContext(BoutiqueContext);
  if (!ctx) throw new Error('useBoutique must be used within BoutiqueProvider');
  return ctx;
}

export const BoutiqueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => readStorage<Language>('mero_lang', 'en'));
  const [cart, setCart] = useState<CartItem[]>(() => readStorage<CartItem[]>('mero_cart', []));
  const [wishlist, setWishlist] = useState<string[]>(() => readStorage<string[]>('mero_wishlist', []));
  const [products, setProducts] = useState<Product[]>(initialArtisanProducts);
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const loadCategoriesData = async () => {
    try {
      const cats = await fetchCategories();
      if (cats && cats.length > 0) setCategories(cats);
    } catch (e) {
      console.warn('Categories load note:', e);
    }
  };

  const loadData = async () => {
    setLoadingCatalog(true);
    try {
      const [prods, rates, cats] = await Promise.all([
        fetchCatalog(),
        fetchShippingRates(),
        fetchCategories(),
      ]);
      if (prods && prods.length > 0) setProducts(prods);
      if (rates && rates.length > 0) setShippingRates(rates);
      if (cats && cats.length > 0) setCategories(cats);
    } catch (e) {
      console.warn('Data load warning:', e);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    writeStorage('mero_lang', lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      if (lang === 'ar') {
        document.body.classList.add('rtl');
      } else {
        document.body.classList.remove('rtl');
      }
    }
  };

  useEffect(() => {
    setLanguage(language);
  }, []);

  const addToBag = (productId: string, size: string, color: string, quantity = 1) => {
    setCart((prev) => {
      const updated = mergeCartItems(prev, { productId, size, color, quantity });
      writeStorage('mero_cart', updated);
      return updated;
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (productId: string, size: string, color: string, quantity: number) => {
    setCart((prev) => {
      let updated: CartItem[];
      if (quantity <= 0) {
        updated = prev.filter(
          (i) => !(i.productId === productId && i.size === size && i.color === color)
        );
      } else {
        updated = prev.map((item) =>
          item.productId === productId && item.size === size && item.color === color
            ? { ...item, quantity: Math.min(20, quantity) }
            : item
        );
      }
      writeStorage('mero_cart', updated);
      return updated;
    });
  };

  const removeFromBag = (productId: string, size: string, color: string) => {
    setCart((prev) => {
      const updated = prev.filter(
        (i) => !(i.productId === productId && i.size === size && i.color === color)
      );
      writeStorage('mero_cart', updated);
      return updated;
    });
  };

  const clearBag = () => {
    setCart([]);
    writeStorage('mero_cart', []);
  };

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      const exists = prev.includes(productId);
      const updated = exists ? prev.filter((id) => id !== productId) : [...prev, productId];
      writeStorage('mero_wishlist', updated);
      return updated;
    });
  };

  const isWishlisted = (productId: string) => wishlist.includes(productId);

  const cartCount = useMemo(() => cart.reduce((total, item) => total + item.quantity, 0), [cart]);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      const prod = products.find((p) => p.id === item.productId);
      return total + (prod ? prod.price * item.quantity : 0);
    }, 0);
  }, [cart, products]);

  return (
    <BoutiqueContext.Provider
      value={{
        language,
        setLanguage,
        cart,
        addToBag,
        updateQuantity,
        removeFromBag,
        clearBag,
        cartCount,
        cartTotal,
        wishlist,
        toggleWishlist,
        isWishlisted,
        products,
        categories,
        shippingRates,
        isCartOpen,
        setIsCartOpen,
        refreshCatalog: loadData,
        refreshCategories: loadCategoriesData,
        loadingCatalog,
      }}
    >
      <SiteShellInner>{children}</SiteShellInner>
    </BoutiqueContext.Provider>
  );
};

const SiteShellInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    language,
    setLanguage,
    cart,
    cartCount,
    cartTotal,
    removeFromBag,
    updateQuantity,
    products,
    isCartOpen,
    setIsCartOpen,
  } = useBoutique();

  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAr = language === 'ar';
  const t = copy[language];

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  return (
    <div className={`site-frame ${isAr ? 'rtl' : ''}`}>
      {/* Announcement bar */}
      <div className="announcement-bar">
        <Sparkles size={12} />
        <span>{isAr ? 'تطريز يدوي أصيل بحرفية مصرية معاصرة' : 'Handcrafted Egyptian Artisanal Embroidery'}</span>
        <span className="announcement-dot">·</span>
        <span className="announcement-secondary">{isAr ? 'شحن فوري متاح' : 'Bespoke & Ready Editions Available'}</span>
        <span className="announcement-dot">·</span>
        <Link href="/track-order" className="announcement-track-link">
          <Truck size={12} />
          <span>{isAr ? 'تتبع طلبك' : 'Track Order'}</span>
        </Link>
      </div>

      {/* Main sticky header */}
      <header className="site-header">
        <div className="header-inner">
          <button
            type="button"
            className="mobile-menu-button icon-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <Link href="/" className="site-logo" aria-label="Mero Boutique Home">
            <img
              src="/mero-logo.png"
              alt="Mero Boutique"
              className="site-logo-img"
            />
            <div className="wordmark">
              <span>MERO</span>
              <small>BOUTIQUE</small>
            </div>
          </Link>

          <nav className="main-nav desktop-only">
            <Link href="/" className={location === '/' ? 'active' : ''}>
              {isAr ? 'الرئيسية' : 'Home'}
            </Link>
            <Link href="/shop" className={location === '/shop' ? 'active' : ''}>
              {t.shopAll}
            </Link>
            <Link href="/shop?category=Dresses" className={location.includes('category=Dresses') ? 'active' : ''}>
              {t.dresses}
            </Link>
            <Link href="/shop?category=Abayas" className={location.includes('category=Abayas') ? 'active' : ''}>
              {t.abayas}
            </Link>
            <Link href="/shop?category=Kaftans" className={location.includes('category=Kaftans') ? 'active' : ''}>
              {t.kaftans}
            </Link>
            <Link href="/custom-design" className={location === '/custom-design' ? 'active' : ''}>
              {t.customDesign}
            </Link>
            <Link href="/track-order" className={location.startsWith('/track') ? 'active' : ''}>
              {isAr ? 'تتبع طلبك' : 'Track Order'}
            </Link>
            <Link href="/our-story" className={location === '/our-story' ? 'active' : ''}>
              {t.ourStory}
            </Link>
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="language-toggle"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              title={isAr ? 'Switch to English' : 'التحويل للعربية'}
            >
              {language === 'en' ? 'ع' : 'EN'}
            </button>

            <Link href="/shop" className="icon-button" aria-label="Wishlist">
              <Heart size={18} />
            </Link>

            <button
              type="button"
              className="icon-button"
              onClick={() => setIsCartOpen(true)}
              aria-label="View shopping bag"
            >
              <ShoppingBag size={18} />
              {cartCount > 0 && <span className="action-count">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav slide-out */}
      {mobileMenuOpen && (
        <>
          <div className="menu-backdrop" onClick={() => setMobileMenuOpen(false)} />
          <div className="main-nav is-open" style={{ zIndex: 40 }}>
            <div className="mobile-nav-top">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="site-logo">
                <img
                  src="/mero-logo.png"
                  alt="Mero Boutique"
                  className="site-logo-img"
                  style={{ height: '40px' }}
                />
                <span className="wordmark">
                  <span>MERO</span>
                  <small>BOUTIQUE</small>
                </span>
              </Link>
              <button
                type="button"
                className="icon-button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>
            <Link href="/">{isAr ? 'الرئيسية' : 'Home'}</Link>
            <Link href="/shop">{t.shopAll}</Link>
            <Link href="/shop?category=Dresses">{t.dresses}</Link>
            <Link href="/shop?category=Abayas">{t.abayas}</Link>
            <Link href="/shop?category=Kaftans">{t.kaftans}</Link>
            <Link href="/custom-design">{t.customDesign}</Link>
            <Link href="/track-order">{isAr ? 'تتبع مسار طلبك' : 'Track Your Order'}</Link>
            <Link href="/our-story">{t.ourStory}</Link>
            <Link href="/admin" className="text-[#947381] mt-6 flex items-center gap-2">
              <ShieldCheck size={14} />
              {isAr ? 'إدارة المتجر' : 'Admin Portal'}
            </Link>
          </div>
        </>
      )}

      {/* Main page content */}
      <div className="page-wrapper">{children}</div>

      {/* Shopping Bag Drawer */}
      {isCartOpen && (
        <div className="drawer-layer" role="dialog" aria-modal="true" aria-label="Shopping Bag">
          <button
            type="button"
            className="drawer-overlay"
            onClick={() => setIsCartOpen(false)}
            aria-label="Close cart"
          />
          <aside className="cart-drawer">
            <div className="drawer-header">
              <div>
                <span className="eyebrow">{isAr ? 'ميرو / حقيبة التسوق' : 'MERO / SHOPPING BAG'}</span>
                <h2>{isAr ? 'حقيبتك' : 'Your Bag'}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsCartOpen(false)}
                aria-label="Close bag"
              >
                <X size={20} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="empty-state">
                <ShoppingBag size={34} strokeWidth={1.2} className="text-[#c4a46d]" />
                <p>{isAr ? 'حقيبة التسوق فارغة حالياً' : 'Your bag is empty.'}</p>
                <Link
                  href="/shop"
                  className="outline-button"
                  onClick={() => setIsCartOpen(false)}
                >
                  {isAr ? 'تصفحي المتجر' : 'Explore pieces'}
                </Link>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    if (!product) return null;
                    return (
                      <div
                        key={`${item.productId}-${item.size}-${item.color}`}
                        className="cart-item"
                      >
                        <img src={product.image} alt={product.alt} />
                        <div className="cart-item-copy">
                          <div className="cart-item-top">
                            <h3>{isAr ? product.nameAr : product.name}</h3>
                            <button
                              type="button"
                              className="remove-button"
                              onClick={() => removeFromBag(item.productId, item.size, item.color)}
                              aria-label="Remove item"
                            >
                              ×
                            </button>
                          </div>
                          <p>
                            {item.size} · {item.color}
                          </p>
                          <div className="cart-item-bottom">
                            <span>{formatEGP(product.price, language)}</span>
                            <div className="quantity-control">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.productId, item.size, item.color, item.quantity - 1)
                                }
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span>{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(item.productId, item.size, item.color, item.quantity + 1)
                                }
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="drawer-summary">
                  <div>
                    <span>{isAr ? 'المجموع قبل الشحن' : 'Subtotal before shipping'}</span>
                    <strong>{formatEGP(cartTotal, language)}</strong>
                  </div>
                  <p>
                    {isAr
                      ? 'يُحسب الشحن بدقة حسب المحافظة في خطوة إتمام الطلب.'
                      : 'Exact governorate shipping rate calculated at checkout.'}
                  </p>
                  <Link
                    href="/checkout"
                    className="solid-button full-width"
                    onClick={() => setIsCartOpen(false)}
                  >
                    {isAr ? 'متابعة الطلب' : 'Proceed to Checkout'}
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* Luxury Footer */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link href="/" className="footer-logo-wrap" aria-label="Mero Boutique Home">
              <img
                src="/mero-logo.png"
                alt="Mero Boutique"
                className="footer-logo-img"
              />
            </Link>
            <div className="wordmark wordmark-light">
              <span>MERO</span>
              <small>BOUTIQUE</small>
            </div>
            <p>
              {isAr
                ? 'دار أزياء مصرية راقية تصيغ التراث بأنامل ذهبية وتطريز يدوي بديع للمرأة العصرية المتألقة.'
                : 'Exclusive Egyptian designer garments where embroidery heritage becomes modern self-expression.'}
            </p>
            <div className="social-links">
              <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram">
                <Instagram size={17} />
              </a>
              <a href="mailto:concierge@meroboutique.com" aria-label="Email Concierge">
                <Mail size={17} />
              </a>
            </div>
          </div>

          <div className="footer-column">
            <span className="footer-label">{isAr ? 'المجموعات' : 'Collections'}</span>
            <Link href="/shop?category=Dresses">{t.dresses}</Link>
            <Link href="/shop?category=Abayas">{t.abayas}</Link>
            <Link href="/shop?category=Kaftans">{t.kaftans}</Link>
            <Link href="/shop?category=Sets">{isAr ? 'أطقم حصرية' : 'Tailored Sets'}</Link>
            <Link href="/custom-design">{t.customDesign}</Link>
          </div>

          <div className="footer-column">
            <span className="footer-label">{isAr ? 'العناية بالعملاء' : 'Customer Care'}</span>
            <Link href="/track-order">{isAr ? 'تتبع مسار طلبك' : 'Track Your Order'}</Link>
            <Link href="/policies/shipping">{isAr ? 'سياسة الشحن ومحافظات مصر' : 'Shipping & Delivery'}</Link>
            <Link href="/policies/returns">{isAr ? 'الاستبدال والاسترجاع' : 'Returns & Exchange'}</Link>
            <Link href="/policies/terms">{isAr ? 'الشروط والأحكام' : 'Terms & Conditions'}</Link>
            <Link href="/policies/privacy">{isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link>
          </div>

          <div className="footer-column">
            <span className="footer-label">{isAr ? 'عن الدار' : 'The Atelier'}</span>
            <Link href="/our-story">{t.ourStory}</Link>
            <Link href="/custom-design">{isAr ? 'طلب تصميم خاص' : 'Bespoke Atelier Service'}</Link>
            <Link href="/admin" className="text-[#c4a46d] flex items-center gap-1.5">
              <ShieldCheck size={13} />
              {isAr ? 'بوابة المسؤولين' : 'Store Admin'}
            </Link>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Mero Boutique. {isAr ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}
          </span>
          <span>{isAr ? 'صُنع بحب وإتقان في مصر' : 'Designed & Handcrafted in Cairo, Egypt'}</span>
        </div>
      </footer>
    </div>
  );
};
