export type Language = 'en' | 'ar';
export type ProductionState = 'ready' | 'made-to-order' | 'limited';

export interface ProductGalleryImage {
  id: string;
  product_id?: string;
  image_url: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductVariant {
  id: string;
  product_id?: string;
  size: string;
  color: string;
  sku: string;
  stock: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  category: 'Dresses' | 'Abayas' | 'Kaftans' | 'Tops' | 'Sets' | 'Exclusive Pieces';
  categoryAr: string;
  price: number;
  compareAt?: number;
  image: string;
  alt: string;
  badge?: 'New arrival' | 'Exclusive';
  description: string;
  descriptionAr: string;
  fabric: string;
  fabricAr: string;
  technique: string;
  techniqueAr: string;
  production: ProductionState;
  sizes: string[];
  colors: string[];
  stock: number;
  delivery: string;
  deliveryAr: string;
  care: string;
  careAr: string;
  isPublished?: boolean;
  isFeatured?: boolean;
  images?: ProductGalleryImage[];
  variants?: ProductVariant[];
}

export interface ShippingRate {
  id: string;
  governorate: string;
  fee_egp: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Coupon {
  id?: string;
  code: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_order_egp?: number;
  is_active: boolean;
  expires_at?: string | null;
  created_at?: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name_en: string;
  product_name_ar: string;
  size: string;
  color: string;
  quantity: number;
  unit_price_egp: number;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: string;
  notes?: string;
  changed_by?: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  order_id: string;
  transaction_ref: string;
  amount_egp: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  phone: string;
  email?: string | null;
  governorate: string;
  city_area: string;
  address: string;
  notes?: string | null;
  payment_method: 'cash_on_delivery' | 'prepaid' | 'deposit';
  status: 'pending' | 'confirmed' | 'in_production' | 'ready_to_ship' | 'shipped' | 'delivered' | 'cancelled';
  subtotal_egp: number;
  shipping_egp?: number | null;
  total_egp?: number | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  status_history?: OrderStatusHistory[];
  transactions?: PaymentTransaction[];
}

export interface CustomDesignRequest {
  id: string;
  request_number: string;
  customer_name: string;
  phone: string;
  email?: string | null;
  garment_type: string;
  preferred_fabric?: string | null;
  preferred_colors?: string | null;
  embroidery_style?: string | null;
  size_details?: string | null;
  description: string;
  reference_image_urls: string[];
  target_budget_egp?: number | null;
  needed_by?: string | null;
  deposit_rate: number;
  status: 'new' | 'contacted' | 'quoted' | 'deposit_paid' | 'in_progress' | 'completed' | 'cancelled';
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  productId: string;
  size: string;
  color: string;
  quantity: number;
}

export const imageUrls = {
  hero: '/products/embroidered-dress.svg',
  lavender: '/products/embroidered-dress.svg',
  heritage: '/products/heritage-abaya.svg',
  golden: '/products/golden-kaftan.svg',
  ivory: '/products/ivory-set.svg',
  top: '/products/embroidered-top.svg',
};

// Curated artisan pieces representing Mero Boutique's handcrafted signature catalog
export const initialArtisanProducts: Product[] = [
  {
    id: 'f87a8101-3142-498c-8547-5121b6d00001',
    slug: 'lotus-heirloom-dress',
    name: 'Lotus Heirloom Silk-Linen Dress',
    nameAr: 'فستان كتان وحرير مطرز بزهرة اللوتس',
    category: 'Dresses',
    categoryAr: 'فساتين',
    price: 4850,
    compareAt: 5600,
    image: imageUrls.lavender,
    alt: 'Hand-embroidered silk-linen dress with Egyptian lotus motifs',
    badge: 'Exclusive',
    description: 'An ethereal silhouette crafted from Egyptian silk-linen, adorned with intricate hand-embroidered lotus blossoms in soft champagne and rose gold threads along the neckline and cuffs.',
    descriptionAr: 'تصميم انسيابي فاخر من الكتان والحرير المصري، مزين بتطريز يدوي متقن لزهرة اللوتس بخيوط الذهب الوردي والشمبانيا على الياقة والأكمام.',
    fabric: 'Pure Egyptian Silk-Linen Blend',
    fabricAr: 'مزيج الكتان والحرير المصري الطبيعي',
    technique: 'Traditional Hand Needlework & Satin Stitch',
    techniqueAr: 'غرزة الساتان والتطريز اليدوي الدقيق',
    production: 'ready',
    sizes: ['S', 'M', 'L'],
    colors: ['Dusty Rose', 'Antique Ivory', 'Muted Plum'],
    stock: 7,
    delivery: 'Ships within 48–72 hours across Egypt',
    deliveryAr: 'شحن فوري خلال ٤٨ إلى ٧٢ ساعة لجميع محافظات مصر',
    care: 'Dry clean only. Press with cool iron on reverse side.',
    careAr: 'تنظيف جاف فقط. الكي بحرارة خفيفة على ظهر القماش.',
    isPublished: true,
    isFeatured: true,
    images: [
      { id: 'img-1', image_url: imageUrls.lavender, alt_text: 'Front view of Lotus Heirloom Dress', sort_order: 0, is_primary: true },
      { id: 'img-2', image_url: imageUrls.ivory, alt_text: 'Embroidery detail view', sort_order: 1, is_primary: false },
    ],
    variants: [
      { id: 'var-1', size: 'S', color: 'Dusty Rose', sku: 'MB-LOTUS-DR-S', stock: 2, is_active: true },
      { id: 'var-2', size: 'M', color: 'Dusty Rose', sku: 'MB-LOTUS-DR-M', stock: 3, is_active: true },
      { id: 'var-3', size: 'L', color: 'Dusty Rose', sku: 'MB-LOTUS-DR-L', stock: 2, is_active: true },
      { id: 'var-4', size: 'M', color: 'Antique Ivory', sku: 'MB-LOTUS-IV-M', stock: 2, is_active: true },
    ],
  },
  {
    id: 'f87a8101-3142-498c-8547-5121b6d00002',
    slug: 'heritage-noir-abaya',
    name: 'Heritage Noir Geometric Abaya',
    nameAr: 'عباية التراث الأسود بتطريز هندسي',
    category: 'Abayas',
    categoryAr: 'عبايات',
    price: 5200,
    image: imageUrls.heritage,
    alt: 'Black crepe abaya with hand-guided metallic geometry',
    badge: 'New arrival',
    description: 'An imposing drape of Japanese crepe accented by contemporary geometric embroidery inspired by architectural Nubian brickwork and heirloom filigree.',
    descriptionAr: 'قصة واسعة من الكريب الراقي مع تطريز هندسي معاصر مستوحى من النقوش النوبية والزخارف التراثية بخيوط برونزية ناعمة.',
    fabric: 'Premium Japanese Matte Crepe',
    fabricAr: 'كريب ياباني مطفي عالي الجودة',
    technique: 'Fine Couched Gold Thread & Needlework',
    techniqueAr: 'تطريز بخيوط القصب المذهبة والحرير',
    production: 'ready',
    sizes: ['52', '54', '56', '58'],
    colors: ['Midnight Onyx', 'Deep Charcoal'],
    stock: 5,
    delivery: 'Ships within 48–72 hours',
    deliveryAr: 'شحن فوري خلال ٤٨ إلى ٧٢ ساعة',
    care: 'Professional dry clean only.',
    careAr: 'تنظيف جاف متخصص فقط.',
    isPublished: true,
    isFeatured: true,
    images: [
      { id: 'img-3', image_url: imageUrls.heritage, alt_text: 'Heritage Noir Abaya', sort_order: 0, is_primary: true },
    ],
    variants: [
      { id: 'var-5', size: '54', color: 'Midnight Onyx', sku: 'MB-NOIR-54', stock: 2, is_active: true },
      { id: 'var-6', size: '56', color: 'Midnight Onyx', sku: 'MB-NOIR-56', stock: 3, is_active: true },
    ],
  },
  {
    id: 'f87a8101-3142-498c-8547-5121b6d00003',
    slug: 'golden-siwa-kaftan',
    name: 'Siwa Golden Thread Linen Kaftan',
    nameAr: 'قفطان واحة سيوة بالخيوط المذهبة',
    category: 'Kaftans',
    categoryAr: 'قفاطين',
    price: 6400,
    compareAt: 7200,
    image: imageUrls.golden,
    alt: 'Golden embroidered Kaftan inspired by Siwan heritage',
    badge: 'Exclusive',
    description: 'A statement ceremonial kaftan woven from raw flax linen. Its bodice celebrates the ancient celebratory patterns of Siwa Oasis with sunburst medallion embroidery.',
    descriptionAr: 'قفطان احتفالي فخم من الكتان الطبيعي الخام. يحتفي صدر القفطان بالنقوش الاحتفالية التراثية لواحة سيوة وتطريز قرص الشمس الأسطوري.',
    fabric: 'Pure Washed Egyptian Flax Linen',
    fabricAr: 'كتان مصري طبيعي مغسول ومصنوع يدوياً',
    technique: 'Siwan Sunburst & Cross-Stitch Artisan Needlework',
    techniqueAr: 'غرز التطريز السيوي التراثي وشمس الصباح',
    production: 'limited',
    sizes: ['Free Size'],
    colors: ['Desert Sand', 'Terracotta'],
    stock: 3,
    delivery: 'Limited edition crafted in small artisan batches',
    deliveryAr: 'إصدار محدود يُنفذ بدقة على دفعات صغيرة',
    care: 'Dry clean only to protect hand embroidery.',
    careAr: 'تنظيف جاف فقط للحفاظ على التطريز التراثي.',
    isPublished: true,
    isFeatured: true,
    images: [
      { id: 'img-4', image_url: imageUrls.golden, alt_text: 'Siwa Golden Kaftan', sort_order: 0, is_primary: true },
    ],
    variants: [
      { id: 'var-7', size: 'Free Size', color: 'Desert Sand', sku: 'MB-SIWA-SAND', stock: 2, is_active: true },
      { id: 'var-8', size: 'Free Size', color: 'Terracotta', sku: 'MB-SIWA-TERRA', stock: 1, is_active: true },
    ],
  },
  {
    id: 'f87a8101-3142-498c-8547-5121b6d00004',
    slug: 'ivory-palmetto-two-piece-set',
    name: 'Ivory Palmetto Tailored Two-Piece Set',
    nameAr: 'طقم عاجي قطعتين بتطريز سعف النخيل',
    category: 'Sets',
    categoryAr: 'أطقم',
    price: 4950,
    image: imageUrls.ivory,
    alt: 'Ivory tailored top and wide trousers with palmetto embroidery',
    badge: 'New arrival',
    description: 'A relaxed tailored tunic and wide-leg trouser pair cut from heavyweight linen, featuring micro-embroidered stylized palmettos down the lapels and cuff hems.',
    descriptionAr: 'طقم كاجوال فاخر مكون من توب وبنطلون واسع من الكتان الثقيل مع تطريز ناعم مستوحى من سعف النخيل على الياقة وحواف الأكمام.',
    fabric: 'Heavyweight Breathable Flax Linen',
    fabricAr: 'كتان مصري نقي عالي الكثافة وخفيف التهوية',
    technique: 'Micro-Botanical Satin Stitch',
    techniqueAr: 'تطريز نباتي دقيق بغرز الحرير البارزة',
    production: 'ready',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Pure Ivory', 'Oatmeal Taupe'],
    stock: 6,
    delivery: 'Ships within 48–72 hours',
    deliveryAr: 'شحن فوري خلال ٤٨ إلى ٧٢ ساعة',
    care: 'Dry clean or gentle hand wash with neutral detergent.',
    careAr: 'تنظيف جاف أو غسيل يدوي بماء بارد ومسحوق لطيف.',
    isPublished: true,
    isFeatured: false,
    images: [
      { id: 'img-5', image_url: imageUrls.ivory, alt_text: 'Ivory Palmetto Set', sort_order: 0, is_primary: true },
    ],
    variants: [
      { id: 'var-9', size: 'S', color: 'Pure Ivory', sku: 'MB-SET-IV-S', stock: 2, is_active: true },
      { id: 'var-10', size: 'M', color: 'Pure Ivory', sku: 'MB-SET-IV-M', stock: 2, is_active: true },
      { id: 'var-11', size: 'L', color: 'Pure Ivory', sku: 'MB-SET-IV-L', stock: 2, is_active: true },
    ],
  },
  {
    id: 'f87a8101-3142-498c-8547-5121b6d00005',
    slug: 'jasmine-embroidered-cotton-top',
    name: 'Jasmine Bloom Voile Tunic Top',
    nameAr: 'قميص فوال قطني بتطريز زهر الياسمين',
    category: 'Tops',
    categoryAr: 'قمصان',
    price: 2950,
    image: imageUrls.top,
    alt: 'Lightweight cotton voile top with delicate jasmine embroidery',
    description: 'Featherlight Egyptian Giza cotton voile with tonal jasmine blossom embroidery across the split neck yoke and voluminous pleated sleeves.',
    descriptionAr: 'قميص خفيف من فوال قطن الجيزة المصري مع تطريز زهري ناعم لزهور الياسمين باللون نفسه على الصدر والأكمام الفضفاضة.',
    fabric: '100% Egyptian Giza Cotton Voile',
    fabricAr: 'قطن جيزة مصري ١٠٠٪ فوال فاخر',
    technique: 'Shadow Embroidery & Open Drawn Thread Work',
    techniqueAr: 'شغل تطريز الظل وغرز الأجور المفرغة',
    production: 'ready',
    sizes: ['S', 'M', 'L'],
    colors: ['Crisp White', 'Blush Rose'],
    stock: 8,
    delivery: 'Ships within 48–72 hours',
    deliveryAr: 'شحن فوري خلال ٤٨ إلى ٧٢ ساعة',
    care: 'Gentle hand wash. Line dry in shade.',
    careAr: 'غسيل يدوي خفيف. تجفيف في الظل.',
    isPublished: true,
    isFeatured: false,
    images: [
      { id: 'img-6', image_url: imageUrls.top, alt_text: 'Jasmine Bloom Top', sort_order: 0, is_primary: true },
    ],
    variants: [
      { id: 'var-12', size: 'S', color: 'Crisp White', sku: 'MB-TOP-WH-S', stock: 3, is_active: true },
      { id: 'var-13', size: 'M', color: 'Crisp White', sku: 'MB-TOP-WH-M', stock: 3, is_active: true },
      { id: 'var-14', size: 'L', color: 'Crisp White', sku: 'MB-TOP-WH-L', stock: 2, is_active: true },
    ],
  },
  {
    id: 'f87a8101-3142-498c-8547-5121b6d00006',
    slug: 'couture-bespoke-gown',
    name: 'Royal Nile Hand-Beaded Ceremonial Gown',
    nameAr: 'فستان السهرة الملكي بتطريز نيللي فاخر',
    category: 'Exclusive Pieces',
    categoryAr: 'قطع حصرية',
    price: 9800,
    compareAt: 11500,
    image: imageUrls.hero,
    alt: 'Exclusive bridal/ceremonial gown with hand-beaded metallic relief',
    badge: 'Exclusive',
    description: 'An extraordinary masterpiece requiring more than 90 artisan hours of hand needlework, micro-seed pearls, and antique gold bullion wire over pure silk crepe.',
    descriptionAr: 'قطعة حصرية نادرة تتطلب أكثر من ٩٠ ساعة من العمل اليدوي المحترف باللؤلؤ الدقيق وخيوط السيرما الذهبية على حرير الكريب الطبيعي.',
    fabric: 'Pure Mulberry Silk Crepe & Organza Underlay',
    fabricAr: 'حرير توت بري نقي مع بطانة من الأورجانزا الفاخرة',
    technique: 'Bullion Gold Work, Seed Pearls & Relief Embroidery',
    techniqueAr: 'سيرما ذهبية مجسمة ولؤلؤ طبيعي يدوي',
    production: 'made-to-order',
    sizes: ['Custom Tailored', 'M', 'L'],
    colors: ['Regal Burgundy', 'Antique Gold', 'Noir'],
    stock: 2,
    delivery: 'Bespoke hand production: 14 to 21 working days',
    deliveryAr: 'تفصيل وتطريز يدوي خاص: من ١٤ إلى ٢١ يوم عمل',
    care: 'Specialist couture preservation care.',
    careAr: 'عناية خاصة وحفظ أزياء كوتور.',
    isPublished: true,
    isFeatured: true,
    images: [
      { id: 'img-7', image_url: imageUrls.hero, alt_text: 'Royal Nile Gown', sort_order: 0, is_primary: true },
    ],
    variants: [
      { id: 'var-15', size: 'Custom Tailored', color: 'Regal Burgundy', sku: 'MB-ROYAL-BUR', stock: 2, is_active: true },
    ],
  },
];

export const initialShippingRates: ShippingRate[] = [
  { id: 'sr-1', governorate: 'Cairo', fee_egp: 60, is_active: true },
  { id: 'sr-2', governorate: 'Giza', fee_egp: 60, is_active: true },
  { id: 'sr-3', governorate: 'Alexandria', fee_egp: 85, is_active: true },
  { id: 'sr-4', governorate: 'Qalyubia', fee_egp: 75, is_active: true },
  { id: 'sr-5', governorate: 'Dakahlia', fee_egp: 85, is_active: true },
  { id: 'sr-6', governorate: 'Sharqia', fee_egp: 85, is_active: true },
  { id: 'sr-7', governorate: 'Gharbia', fee_egp: 85, is_active: true },
  { id: 'sr-8', governorate: 'Monufia', fee_egp: 80, is_active: true },
  { id: 'sr-9', governorate: 'Beheira', fee_egp: 90, is_active: true },
  { id: 'sr-10', governorate: 'Port Said', fee_egp: 90, is_active: true },
  { id: 'sr-11', governorate: 'Ismailia', fee_egp: 90, is_active: true },
  { id: 'sr-12', governorate: 'Suez', fee_egp: 90, is_active: true },
  { id: 'sr-13', governorate: 'Fayoum', fee_egp: 95, is_active: true },
  { id: 'sr-14', governorate: 'Beni Suef', fee_egp: 95, is_active: true },
  { id: 'sr-15', governorate: 'Minya', fee_egp: 100, is_active: true },
  { id: 'sr-16', governorate: 'Assiut', fee_egp: 110, is_active: true },
  { id: 'sr-17', governorate: 'Sohag', fee_egp: 115, is_active: true },
  { id: 'sr-18', governorate: 'Qena', fee_egp: 120, is_active: true },
  { id: 'sr-19', governorate: 'Luxor', fee_egp: 125, is_active: true },
  { id: 'sr-20', governorate: 'Aswan', fee_egp: 130, is_active: true },
  { id: 'sr-21', governorate: 'Red Sea', fee_egp: 135, is_active: true },
  { id: 'sr-22', governorate: 'South Sinai', fee_egp: 140, is_active: true },
];

export const initialCoupons: Coupon[] = [
  { code: 'MERO10', discount_type: 'percent', discount_value: 10, min_order_egp: 2000, is_active: true },
  { code: 'ATELIER250', discount_type: 'fixed', discount_value: 250, min_order_egp: 2500, is_active: true },
];

export const categories = [
  { name: 'Embroidered Dresses', nameAr: 'فساتين مطرزة', filter: 'Dresses', image: imageUrls.lavender },
  { name: 'Abayas', nameAr: 'عبايات', filter: 'Abayas', image: imageUrls.heritage },
  { name: 'Kaftans', nameAr: 'قفاطين', filter: 'Kaftans', image: imageUrls.golden },
  { name: 'Embroidered Tops', nameAr: 'قمصان مطرزة', filter: 'Tops', image: imageUrls.top },
  { name: 'Two-Piece Sets', nameAr: 'أطقم من قطعتين', filter: 'Sets', image: imageUrls.ivory },
  { name: 'Exclusive Pieces', nameAr: 'قطع حصرية', filter: 'Exclusive Pieces', image: imageUrls.hero },
] as const;

export const collections = [
  {
    title: 'The Heritage Collection',
    titleAr: 'مجموعة التراث الفاخر',
    text: 'A quiet dialogue between heirloom motifs and modern silhouettes.',
    textAr: 'حوار هادئ بين الزخارف التراثية والقصات العصرية الراقية.',
    image: imageUrls.heritage,
    count: '6 pieces',
  },
  {
    title: 'Modern Atelier Elegance',
    titleAr: 'أناقة الأتيليه المعاصرة',
    text: 'Clean lines, soft structure, and embroidery that speaks softly.',
    textAr: 'خطوط نقية وتفاصيل ناعمة وتطريز ينبض بالفخامة والهدوء.',
    image: imageUrls.ivory,
    count: '8 pieces',
  },
  {
    title: 'Signature Siwan Motifs',
    titleAr: 'تطريز ميرو السيوِي التراثي',
    text: 'The motifs that make a Mero piece unmistakably an Egyptian artwork.',
    textAr: 'الزخارف التي تمنح قطعة ميرو هويتها الخاصة كعمل فني مصري.',
    image: imageUrls.golden,
    count: '4 pieces',
  },
];

export const copy = {
  en: {
    shopAll: 'Shop all',
    dresses: 'Dresses',
    abayas: 'Abayas',
    kaftans: 'Kaftans',
    collections: 'Collections',
    ourStory: 'Our story',
    customDesign: 'Custom design',
    explore: 'Explore collection',
    craftCta: 'Discover our craft',
    bag: 'Shopping bag',
    wishlist: 'Wishlist',
    search: 'Search',
    selected: 'Selected for you',
    exploreCollections: 'Explore our collections',
    stories: 'Stories from our patrons',
    newsletter: 'Stay close to the art.',
    newsletterText: 'Be the first to discover our newest collections, exclusive designs, and stories behind Egyptian artisanal needlework.',
    subscribe: 'Subscribe',
    discover: 'Discover the art of hand embroidery',
    wearArt: 'Wear art. Celebrate craftsmanship.',
    heroText: 'Discover the beauty of exclusive clothing, inspired by timeless Egyptian embroidery and reimagined for the modern woman. Every stitch tells a story.',
  },
  ar: {
    shopAll: 'تسوقي الكل',
    dresses: 'فساتين',
    abayas: 'عبايات',
    kaftans: 'قفاطين',
    collections: 'المجموعات',
    ourStory: 'قصتنا',
    customDesign: 'تصميم خاص',
    explore: 'اكتشفي المجموعة',
    craftCta: 'اكتشفي حرفتنا',
    bag: 'حقيبة التسوق',
    wishlist: 'المفضلة',
    search: 'بحث',
    selected: 'اختياراتنا لكِ',
    exploreCollections: 'اكتشفي مجموعاتنا',
    stories: 'حكايات من عميلاتنا',
    newsletter: 'كوني قريبة من الفن.',
    newsletterText: 'كوني أول من يكتشف مجموعاتنا الجديدة وتصاميمنا الحصرية وحكايات الحرفة المصرية وراء كل قطعة.',
    subscribe: 'اشتركي',
    discover: 'اكتشفي فن التطريز اليدوي',
    wearArt: 'ارتدي الفن. واحتفلي بالحرفة.',
    heroText: 'اكتشفي جمال الأزياء الحصرية المستوحاة من التطريز المصري الأصيل والمعاد تقديمه للمرأة العصرية. كل غرزة تحكي قصة.',
  },
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota or private mode fallback
  }
}
