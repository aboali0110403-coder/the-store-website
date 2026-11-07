import React from 'react';
import { Link } from 'wouter';
import { Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';
import { useBoutique } from '../components/SiteShell';

export default function Story() {
  const { language } = useBoutique();
  const isAr = language === 'ar';

  return (
    <main>
      <section className="story-hero">
        <div className="container story-hero-inner">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {isAr ? 'عن الدار والحرفة' : 'The Atelier Narrative'}
            </span>
            <h1>{isAr ? 'حيث يلتقي التراث بالفخامة العصرية' : 'Heritage Woven Into Modern Poise'}</h1>
            <p>
              {isAr
                ? 'تأسست ميرو بوتيك في القاهرة انطلاقاً من إيمان عميق بأن التطريز اليدوي المصري ليس مجرد زخرفة، بل هو تاريخ حي وفن راقٍ يستحق أن يتجدد ليواكب أناقة المرأة اليوم.'
                : 'Founded in Cairo, Mero Boutique was born out of an enduring reverence for Egyptian embroidery—reimagining heirloom motifs as wearable contemporary art.'}
            </p>
          </div>
          <img src="/products/embroidered-dress.svg" alt="Artisan atelier work" />
        </div>
      </section>

      <section className="section">
        <div className="container story-intro">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-line" />
              {isAr ? 'فلسفة التصميم' : 'Design Ethos'}
            </span>
            <h2>{isAr ? 'أصالة الغرزة ونقاء الخامة' : 'The Tactile Truth of Pure Fibers'}</h2>
          </div>
          <div className="story-intro-copy">
            <p>
              {isAr
                ? 'نرفض تماماً الأقمشة البلاستيكية المصنعة رخيصة التكلفة؛ فكل قطعة في ميرو تُحاك من الكتان الطبيعي المصري، أو حرير التوت البري، أو فوال قطن الجيزة النقي ذي التيلة الطويلة.'
                : 'We consciously avoid synthetic fast-fashion blends. Every Mero creation begins with raw Egyptian flax linen, pure silk-linen, or featherlight Giza cotton voile.'}
            </p>
            <p>
              {isAr
                ? 'تعمل حرفياتنا في ورشتنا بالقاهرة ساعات طوال في صياغة الغرز اليدوية بكل عناية، مما يمنح كل رداء تفرداً وقيمة تدوم لأعوام طويلة.'
                : 'Our women artisans in Cairo dedicate themselves to heirloom needlework, ensuring every piece carries timeless value and soul.'}
            </p>
          </div>
        </div>
      </section>

      {/* Production Nuance */}
      <section className="story-methods">
        <div className="container">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow eyebrow-light">
                <span className="eyebrow-line" />
                {isAr ? 'شفافية الإنتاج' : 'Craft Distinction'}
              </span>
              <h2>{isAr ? 'مستويات التنفيذ الحرفي' : 'Production Nuance'}</h2>
            </div>
            <div className="story-swatch" />
          </div>

          <div className="methods-grid">
            <div className="method-card">
              <div className="method-top">
                <span>01</span>
                <Sparkles size={16} />
              </div>
              <h3>{isAr ? 'التطريز اليدوي الخالص' : 'Pure Hand Needlework'}</h3>
              <p>
                {isAr
                  ? 'قطع حصرية تُطرز غرزة بغرزة بأنامل أمهر صانعات التطريز التقليدي، وتستغرق بين ٤٠ إلى ٩٠ ساعة عمل.'
                  : 'Individual stitches hand-guided with silk, cotton, or gilded bullion threads, requiring 40 to 90 hours.'}
              </p>
            </div>

            <div className="method-card">
              <div className="method-top">
                <span>02</span>
                <Sparkles size={16} />
              </div>
              <h3>{isAr ? 'الإنتاج المحدود' : 'Limited Editions'}</h3>
              <p>
                {isAr
                  ? 'دفعات صغيرة جداً لا تتجاوز بضع قطع لكل لون ومقاس للحفاظ على خصوصيتك وتفردك.'
                  : 'Mindful micro-batches created with zero mass waste, celebrating distinct artisanal identity.'}
              </p>
            </div>

            <div className="method-card">
              <div className="method-top">
                <span>03</span>
                <Sparkles size={16} />
              </div>
              <h3>{isAr ? 'التفصيل والتطريز الخاص' : 'Bespoke Atelier'}</h3>
              <p>
                {isAr
                  ? 'خدمة متخصصة لتصميم فساتين المناسبات والقفاطين التراثية بحسب قياسات ورغبة كل عميلة.'
                  : 'One-on-one commission service allowing patrons to tailor colors, motifs, and silhouettes.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quote */}
      <section className="section">
        <div className="container story-quote">
          <Sparkles size={24} className="text-[#c4a46d]" />
          <blockquote>
            {isAr
              ? '«حين ترتدين قطعة من ميرو، فأنتِ لا ترتدين ثوباً فحسب، بل تحملين حكاية أصيلة سطرها حرفيون مصريون بشغف وإخلاص.»'
              : '“When you wear a Mero silhouette, you don’t merely wear fashion—you wear living heritage woven with deep artisan dedication.”'}
          </blockquote>
          <span>MERO BOUTIQUE · CAIRO ATELIER</span>
        </div>
      </section>

      {/* CTA */}
      <div className="story-cta">
        <div className="container story-cta-inner">
          <div>
            <span className="eyebrow" style={{ color: '#49343f' }}>
              {isAr ? 'ابدأي رحلتك معنا' : 'Begin Your Journey'}
            </span>
            <h2>{isAr ? 'اكتشفي إبداعات الموسم' : 'Explore The Pieces'}</h2>
          </div>
          <Link href="/shop" className="solid-button">
            {isAr ? 'تسوقي الكتالوج' : 'Shop The Catalog'}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </main>
  );
}
