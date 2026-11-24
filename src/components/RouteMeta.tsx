import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useBoutique } from './SiteShell';

const SITE = 'Mero Boutique';
const ORIGIN = 'https://mero-boutique.vercel.app';

type Meta = { en: string; ar: string; descEn?: string; descAr?: string; noindex?: boolean };

const ROUTES: Array<[RegExp, Meta]> = [
  [/^\/shop\/.+/, { en: 'Product', ar: 'المنتج' }],
  [/^\/shop\/?$/, { en: 'Shop All', ar: 'تسوقي الكل' }],
  [/^\/checkout\/?$/, { en: 'Checkout', ar: 'إتمام الطلب', noindex: true }],
  [/^\/custom-design\/?$/, { en: 'Custom Design', ar: 'تصميم خاص' }],
  [/^\/our-story\/?$/, { en: 'Our Story', ar: 'قصتنا' }],
  [/^\/policies\/.+/, { en: 'Policies', ar: 'السياسات' }],
  [/^\/track(-order)?\/?$/, { en: 'Track Your Order', ar: 'تتبع طلبك', noindex: true }],
  [/^\/admin/, { en: 'Store Admin', ar: 'إدارة المتجر', noindex: true }],
];

function setMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export default function RouteMeta() {
  const [path] = useLocation();
  const { language } = useBoutique();

  useEffect(() => {
    const isAr = language === 'ar';
    const hit = ROUTES.find(([re]) => re.test(path));
    const baseTitle = document.documentElement.dataset.baseTitle || document.title;
    document.documentElement.dataset.baseTitle = baseTitle;
    const known = path === '/' || Boolean(hit);
    document.title = hit ? `${isAr ? hit[1].ar : hit[1].en} | ${SITE}` : baseTitle;

    const canonical = `${ORIGIN}${path === '/' ? '/' : path.replace(/\/$/, '')}`;
    setMeta('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', canonical);
    setMeta('meta[name="robots"]', () => Object.assign(document.createElement('meta'), { name: 'robots' }), 'content', hit?.[1].noindex || !known ? 'noindex, nofollow' : 'index, follow');
    document.documentElement.lang = isAr ? 'ar' : 'en';
  }, [path, language]);

  return null;
}
