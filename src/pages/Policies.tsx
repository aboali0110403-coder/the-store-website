import React from 'react';
import { useRoute, Link } from 'wouter';
import { ArrowLeft, ShieldCheck, Truck, RotateCcw, FileText } from 'lucide-react';
import { useBoutique } from '../components/SiteShell';

export default function Policies() {
  const [, params] = useRoute('/policies/:slug');
  const slug = params?.slug || 'shipping';
  const { language } = useBoutique();
  const isAr = language === 'ar';

  const sections: Record<
    string,
    { title: string; titleAr: string; description: string; descriptionAr: string; icon: any }
  > = {
    shipping: {
      title: 'Shipping & Delivery Across Egypt',
      titleAr: 'سياسة الشحن والتوصيل لجميع محافظات مصر',
      description: 'Transparent delivery rates, timelines, and courier inspection policies.',
      descriptionAr: 'تفاصيل مواعيد الشحن لجميع محافظات مصر وحق المعاينة عند الاستلام.',
      icon: Truck,
    },
    returns: {
      title: 'Returns & Exchange Policy',
      titleAr: 'سياسة الاستبدال والاسترجاع وحماية المستهلك',
      description: 'Your rights under Egyptian Consumer Protection Law No. 181 of 2018.',
      descriptionAr: 'حقوقك القانونية وفق قانون حماية المستهلك المصري رقم ١٨١ لسنة ٢٠١٨.',
      icon: RotateCcw,
    },
    terms: {
      title: 'Terms of Service',
      titleAr: 'الشروط والأحكام العامة للمتجر',
      description: 'Ordering, bespoke commissions, and pricing terms.',
      descriptionAr: 'شروط الطلب والعربون وسياسات التصاميم الخاصة.',
      icon: FileText,
    },
    privacy: {
      title: 'Privacy & Data Protection',
      titleAr: 'سياسة الخصوصية وحماية بيانات العملاء',
      description: 'How Mero Boutique safeguards your personal and delivery data.',
      descriptionAr: 'التزامنا الكامل بسرية بيانات التوصيل والاتصال الخاصة بكِ.',
      icon: ShieldCheck,
    },
  };

  const current = sections[slug] || sections.shipping;
  const Icon = current.icon;

  return (
    <main className="policy-page">
      <div className="container policy-wrap">
        <Link href="/shop" className="text-link policy-back">
          <ArrowLeft size={14} />
          {isAr ? 'العودة للمتجر' : 'Back to shop'}
        </Link>

        <div className="policy-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            <Icon size={14} />
            {isAr ? 'العناية بالعميلة والشفافية القانونية' : 'Customer Protection & Atelier Policies'}
          </span>
          <h1>{isAr ? current.titleAr : current.title}</h1>
          <p>{isAr ? current.descriptionAr : current.description}</p>
        </div>

        <div className="policy-layout">
          {/* Policy navigation */}
          <nav className="policy-nav">
            <span className="footer-label">{isAr ? 'السياسات' : 'Policies'}</span>
            <Link href="/policies/shipping" className={slug === 'shipping' ? 'active' : ''}>
              {isAr ? 'الشحن والتوصيل' : 'Shipping & Delivery'}
            </Link>
            <Link href="/policies/returns" className={slug === 'returns' ? 'active' : ''}>
              {isAr ? 'الاستبدال والاسترجاع' : 'Returns & Exchange'}
            </Link>
            <Link href="/policies/terms" className={slug === 'terms' ? 'active' : ''}>
              {isAr ? 'الشروط والأحكام' : 'Terms of Service'}
            </Link>
            <Link href="/policies/privacy" className={slug === 'privacy' ? 'active' : ''}>
              {isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}
            </Link>
          </nav>

          {/* Policy Body */}
          <article className="policy-content">
            {slug === 'shipping' && (
              <>
                <section className="policy-section">
                  <h2>{isAr ? 'مواعيد وتغطية الشحن' : 'Delivery Coverage & Timelines'}</h2>
                  <p>
                    {isAr
                      ? 'نوفر خدمة الشحن السريع لجميع محافظات جمهورية مصر العربية (٢٧ محافظة) عبر شركات شحن معتمدة وموثوقة.'
                      : 'We provide expedited courier delivery across all 27 governorates of Egypt via trusted carriers.'}
                  </p>
                  <ul>
                    <li>
                      <strong>{isAr ? 'القاهرة والجيزة والإسكندرية:' : 'Cairo, Giza & Alexandria:'}</strong>{' '}
                      {isAr ? 'خلال ٢٤ إلى ٤٨ ساعة عمل للقطع الجاهزة.' : '24 to 48 business hours for ready-to-ship pieces.'}
                    </li>
                    <li>
                      <strong>{isAr ? 'محافظات الوجه البحري والدلتا والقناة:' : 'Delta & Canal Governorates:'}</strong>{' '}
                      {isAr ? 'خلال يومين إلى ٣ أيام عمل.' : '2 to 3 business days.'}
                    </li>
                    <li>
                      <strong>{isAr ? 'محافظات الصعيد والبحر الأحمر وسيناء:' : 'Upper Egypt, Red Sea & Sinai:'}</strong>{' '}
                      {isAr ? 'خلال ٣ إلى ٥ أيام عمل.' : '3 to 5 business days.'}
                    </li>
                  </ul>
                </section>

                <section className="policy-section">
                  <h2>{isAr ? 'حق المعاينة والفحص عند الاستلام' : 'Inspection on Delivery'}</h2>
                  <p>
                    {isAr
                      ? 'تضمن ميرو بوتيك لجميع عميلاتها حق فتح الشحنة وفحص القطعة والتأكد من مطابقة المقاس ونقاء التطريز اليدوي قبل دفع القيمة للمندوب.'
                      : 'Patrons have the full right to open and inspect the piece before completing cash payment.'}
                  </p>
                </section>
              </>
            )}

            {slug === 'returns' && (
              <>
                <section className="policy-section">
                  <h2>{isAr ? 'حق الاسترجاع القانوني (١٤ يوماً)' : '14-Day Statutory Return Right'}</h2>
                  <p>
                    {isAr
                      ? 'وفقاً للمادة ١٧ من قانون حماية المستهلك المصري رقم ١٨١ لسنة ٢٠١٨، يحق للمستهلك استبدال السلعة أو إعادتها واسترداد قيمتها النقدية خلال ١٤ يوماً من تاريخ الاستلام دون إبداء أسباب، بشرط أن تكون السلعة بحالتها الأصلية غير ملبوسة ومرفق بها كافة البطاقات والتغليف الأصلي.'
                      : 'Under Article 17 of Egyptian Consumer Protection Law No. 181 of 2018, customers are entitled to return or exchange items within 14 days of receipt, provided the item is unworn with tags attached.'}
                  </p>
                </section>

                <section className="policy-section">
                  <h2>{isAr ? 'استثناءات السلع المصنعة حسب الطلب' : 'Exceptions for Bespoke Orders'}</h2>
                  <p>
                    {isAr
                      ? 'وفقاً للمادة ١٧ الفقرة (أ)، تُستثنى من حق الاسترجاع السلع التي صُنعت بناءً على طلب المستهلك أو وفقاً لمواصفات حددها بنفسه (طلبات التصميم الخاص)، إلا في حال وجود عيب صناعة غير مطابق للمواصفات المتفق عليها.'
                      : 'Bespoke items tailored to custom measurements or specific personalized motifs are exempt from unconditional returns unless a manufacturing defect exists.'}
                  </p>
                </section>
              </>
            )}

            {slug === 'terms' && (
              <>
                <section className="policy-section">
                  <h2>{isAr ? 'شروط الطلب والأسعار' : 'Ordering & Pricing'}</h2>
                  <p>
                    {isAr
                      ? 'جميع الأسعار المعروضة بالجنيه المصري (EGP) ومستقاة مباشرة من قاعدة بيانات المتجر المعتمدة. لا نعتمد أي أسعار يتم التلاعب بها من واجهة المتصفح.'
                      : 'All prices are in Egyptian Pounds (EGP) and verified through our database RPCs. Client-manipulated pricing is rejected.'}
                  </p>
                </section>

                <section className="policy-section">
                  <h2>{isAr ? 'عربون التصاميم الخاصة (٣٠٪)' : 'Bespoke 30% Deposit'}</h2>
                  <p>
                    {isAr
                      ? 'يتطلب الشروع في تنفيذ طلبات التصميم الخاص سداد عربون بنسبة ٣٠٪ بعد الاتفاق على التصميم، ويُسدد المتبقي عند الاستلام والمعاينة.'
                      : 'A 30% deposit is required before bespoke cutting and hand embroidery begins, with the remaining balance due upon delivery.'}
                  </p>
                </section>
              </>
            )}

            {slug === 'privacy' && (
              <>
                <section className="policy-section">
                  <h2>{isAr ? 'سرية بيانات العميلات' : 'Customer Data Protection'}</h2>
                  <p>
                    {isAr
                      ? 'نلتزم التزاماً صارماً بعدم مشاركة بياناتك أو رقم هاتفك أو عنوانك مع أي طرف ثالث سوى مندوب التوصيل المعتمد لغرض تسليم شحنتك.'
                      : 'We maintain strict confidentiality. Your delivery and contact info is never sold or shared with any third party other than our verified courier.'}
                  </p>
                </section>
              </>
            )}

            <div className="policy-contact">
              <strong>{isAr ? 'هل لديكِ أي استفسار؟' : 'Need Personal Assistance?'}</strong>
              <p>
                {isAr
                  ? 'فريق خدمة عملاء ميرو بوتيك متاح للرد على استفساراتك بشأن المقاسات ومواعيد الشحن.'
                  : 'Our concierge team is available to help with sizing, fabric advice, or tracking.'}
              </p>
              <a
                href="mailto:concierge@meroboutique.com"
                className="text-link"
              >
                concierge@meroboutique.com
              </a>
            </div>
          </article>
        </div>
      </div>
    </main>
  );
}
