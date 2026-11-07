import React from 'react';
import { Link } from 'wouter';
import { useBoutique } from '../components/SiteShell';

export default function NotFound() {
  const { language } = useBoutique();
  const isAr = language === 'ar';

  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <span className="eyebrow">MERO BOUTIQUE · 404</span>
        <h1>{isAr ? 'الصفحة غير موجودة' : 'Page Not Found'}</h1>
        <p>
          {isAr
            ? 'عذراً، الرابط المطلوب غير متوفر أو تم نقله في الأتيليه.'
            : 'The page you are seeking is unavailable or has been relocated.'}
        </p>
        <Link href="/" className="solid-button">
          {isAr ? 'العودة للرئيسية' : 'Return to Home'}
        </Link>
      </div>
    </main>
  );
}
