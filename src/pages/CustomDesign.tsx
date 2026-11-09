import React, { useState } from 'react';
import { Link } from 'wouter';
import {
  Scissors,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Plus,
  Trash2,
  Upload,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { useBoutique } from '../components/SiteShell';
import { submitCustomDesignRequest, uploadDesignReferenceImage, deleteStorageFile } from '../lib/api';
import { formatEGP } from '../lib/commerceLogic';
import { CaptchaChallenge } from '../components/CaptchaChallenge';

interface ReferenceImageItem {
  id: string;
  url: string;
  path?: string;
  name: string;
  preview: string;
  isUploading?: boolean;
  error?: string;
}

export default function CustomDesign() {
  const { language } = useBoutique();
  const isAr = language === 'ar';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    garmentType: 'Embroidered Dress',
    preferredFabric: '',
    preferredColors: '',
    embroideryStyle: '',
    sizeDetails: '',
    description: '',
    targetBudget: '',
    neededBy: '',
  });

  const [referenceItems, setReferenceItems] = useState<ReferenceImageItem[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showUrlFallback, setShowUrlFallback] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isCaptchaValid, setIsCaptchaValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ requestNumber: string; name: string } | null>(null);

  const handleDeviceFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError('');
    const remainingSlots = 5 - referenceItems.length;
    if (remainingSlots <= 0) {
      setUploadError(
        isAr
          ? 'الحد الأقصى للصور المرجعية هو ٥ صور فقط.'
          : 'You can attach up to 5 reference images maximum.'
      );
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    for (const file of filesToUpload) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setUploadError(
          isAr
            ? `الملف "${file.name}" ليس بصيغة مدعومة. الصيغ المسموحة: JPEG, PNG, WebP.`
            : `File "${file.name}" has an unsupported format. Supported: JPEG, PNG, WebP.`
        );
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError(
          isAr
            ? `حجم الملف "${file.name}" يتجاوز الحد الأقصى (٥ ميجابايت).`
            : `File "${file.name}" exceeds the 5 MB maximum size limit.`
        );
        continue;
      }

      const tempId = `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const previewUrl = URL.createObjectURL(file);

      const newItem: ReferenceImageItem = {
        id: tempId,
        url: '',
        name: file.name,
        preview: previewUrl,
        isUploading: true,
      };

      setReferenceItems((prev) => [...prev, newItem]);

      try {
        const res = await uploadDesignReferenceImage(file);
        setReferenceItems((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? { ...item, url: res.path, path: res.path, isUploading: false }
              : item
          )
        );
      } catch (err: any) {
        setReferenceItems((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? { ...item, isUploading: false, error: err?.message || 'Upload failed' }
              : item
          )
        );
      }
    }

    e.target.value = '';
  };

  const handleRemoveReferenceItem = async (index: number) => {
    const item = referenceItems[index];
    if (item.path) {
      deleteStorageFile('design-references', item.path);
    }
    setReferenceItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddManualUrl = () => {
    if (!newImageUrl.trim() || referenceItems.length >= 5) return;
    const tempId = `url-${Date.now()}`;
    setReferenceItems((prev) => [
      ...prev,
      {
        id: tempId,
        url: newImageUrl.trim(),
        name: newImageUrl.trim().split('/').pop() || 'reference-image',
        preview: newImageUrl.trim(),
        isUploading: false,
      },
    ]);
    setNewImageUrl('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.name.trim().length < 2) {
      setError(isAr ? 'يرجى كتابة الاسم بالكامل.' : 'Please enter your full name.');
      return;
    }
    const cleanPhone = form.phone.replace(/\D/g, '');
    if (cleanPhone.length < 7) {
      setError(isAr ? 'يرجى كتابة رقم هاتف صحيح.' : 'Please enter a valid phone number.');
      return;
    }
    if (form.description.trim().length < 12) {
      setError(
        isAr
          ? 'يرجى كتابة وصف تفصيلي للتصميم المطلوب (١٢ حرفاً على الأقل).'
          : 'Please provide a descriptive explanation of your vision (at least 12 characters).'
      );
      return;
    }
    if (!isCaptchaValid) {
      setError(isAr ? 'يرجى حل مسألة التحقق الأمني.' : 'Please complete the security verification challenge.');
      return;
    }

    const stillUploading = referenceItems.some((i) => i.isUploading);
    if (stillUploading) {
      setError(
        isAr
          ? 'يرجى الانتظار حتى اكتمال رفع الصور المرجعية قبل إرسال الطلب.'
          : 'Please wait until all reference images finish uploading.'
      );
      return;
    }

    setSaving(true);
    try {
      const validUrls = referenceItems.filter((i) => Boolean(i.path || i.url)).map((i) => i.path || i.url);
      const res = await submitCustomDesignRequest({
        customer_name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        garment_type: form.garmentType,
        preferred_fabric: form.preferredFabric || undefined,
        preferred_colors: form.preferredColors || undefined,
        embroidery_style: form.embroideryStyle || undefined,
        size_details: form.sizeDetails || undefined,
        description: form.description,
        reference_image_urls: validUrls,
        target_budget_egp: form.targetBudget ? Number(form.targetBudget) : undefined,
        needed_by: form.neededBy || undefined,
      });

      setSuccess({
        requestNumber: res.request_number,
        name: form.name,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : isAr ? 'تعذر إرسال طلب التصميم.' : 'Could not submit request.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <main className="container confirmation-page">
        <div className="confirmation-card">
          <div className="confirmation-mark">
            <CheckCircle2 size={32} />
          </div>
          <span className="eyebrow">MERO ATELIER · BESPOKE</span>
          <h1>{isAr ? 'تم تسجيل طلب التصميم الخاص' : 'Bespoke Request Received'}</h1>
          <p>
            {isAr
              ? `شكراً لكِ يا ${success.name}، تم إرسال تفاصيل تصميمك إلى ورشة ميرو بوتيك. سيتواصل معكِ مصممنا الرئيسي لمراجعة درجات الأقمشة ومخطط التطريز وتقدير التكلفة.`
              : `Thank you ${success.name}. Your bespoke inquiry is now with our chief artisan. We will review your vision and reach out to discuss fabric swatches, thread palette, and schedule.`}
          </p>

          <div className="order-reference">
            <span>{isAr ? 'رقم طلب التصميم:' : 'Request Reference:'}</span>
            <strong>{success.requestNumber}</strong>
          </div>

          <div className="custom-deposit-note">
            <strong>{isAr ? 'ملاحظة بشأن العربون:' : 'Bespoke Deposit Notice:'}</strong>
            <p>
              {isAr
                ? 'يتم سداد عربون ٣٠٪ فقط بعد اعتماد الرسم التخطيطي واختيار الخيوط والقماش للبدء في القص والتطريز اليدوي.'
                : 'A 30% deposit is payable only after formal approval of the embroidery blueprint and fabric swatches.'}
            </p>
          </div>

          <div className="confirmation-actions">
            <Link href="/shop" className="solid-button">
              {isAr ? 'العودة للمتجر' : 'Explore Ready Catalog'}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="custom-design-page">
      <div className="container custom-design-wrap">
        <div className="custom-design-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" />
            {isAr ? 'خدمة التصميم الخاص' : 'Bespoke Couture Service'}
          </span>
          <h1>{isAr ? 'صممي قطعتك الحصرية' : 'Commission Your Heirloom'}</h1>
          <p>
            {isAr
              ? 'شاركينا فكرتك أو مناسبتك الخاصة؛ لنحول خيالك إلى قطعة مطرزة يدوياً تُفصل خصيصاً لمقاسك وذوقك الراقي.'
              : 'Work directly with our Cairo atelier. Tell us your silhouette, preferred natural fabrics, and embroidery dreams.'}
          </p>
        </div>

        <div className="custom-design-layout">
          {/* Inquiry Form */}
          <form className="custom-design-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <span>
                  {isAr ? 'الاسم بالكامل' : 'Full Name'} <em>*</em>
                </span>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={isAr ? 'الاسم الكريم' : 'Your name'}
                />
              </div>

              <div className="form-field">
                <span>
                  {isAr ? 'رقم الهاتف / واتساب' : 'Phone / WhatsApp'} <em>*</em>
                </span>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="010XXXXXXXX"
                />
              </div>

              <div className="form-field">
                <span>{isAr ? 'البريد الإلكتروني (اختياري)' : 'Email'}</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="name@example.com"
                />
              </div>

              <div className="form-field">
                <span>
                  {isAr ? 'نوع القطعة' : 'Garment Type'} <em>*</em>
                </span>
                <select
                  value={form.garmentType}
                  onChange={(e) => setForm({ ...form, garmentType: e.target.value })}
                >
                  <option value="Embroidered Dress">{isAr ? 'فستان مطرز' : 'Embroidered Dress'}</option>
                  <option value="Ceremonial Abaya">{isAr ? 'عباية مناسبات فاخرة' : 'Ceremonial Abaya'}</option>
                  <option value="Artisan Kaftan">{isAr ? 'قفطان تراثي' : 'Artisan Kaftan'}</option>
                  <option value="Two-Piece Set">{isAr ? 'طقم مطرز قطعتين' : 'Two-Piece Set'}</option>
                  <option value="Couture Evening Gown">{isAr ? 'فستان سهرة كوتور' : 'Couture Evening Gown'}</option>
                </select>
              </div>

              <div className="form-field">
                <span>{isAr ? 'الخامة المفضلة' : 'Preferred Fabric'}</span>
                <input
                  type="text"
                  value={form.preferredFabric}
                  onChange={(e) => setForm({ ...form, preferredFabric: e.target.value })}
                  placeholder={isAr ? 'كتان مغسول، حرير كريب، فوال قطني…' : 'e.g. Raw Linen, Silk Crepe'}
                />
              </div>

              <div className="form-field">
                <span>{isAr ? 'الألوان المفضلة' : 'Preferred Palette'}</span>
                <input
                  type="text"
                  value={form.preferredColors}
                  onChange={(e) => setForm({ ...form, preferredColors: e.target.value })}
                  placeholder={isAr ? 'عاجي، نبيتي، زيتي، كحلي…' : 'e.g. Burgundy, Champagne Gold'}
                />
              </div>

              <div className="form-field">
                <span>{isAr ? 'أسلوب التطريز المفضل' : 'Embroidery Technique'}</span>
                <input
                  type="text"
                  value={form.embroideryStyle}
                  onChange={(e) => setForm({ ...form, embroideryStyle: e.target.value })}
                  placeholder={isAr ? 'سيرما مذهبة، زهور ناعمة، تطريز سيوي…' : 'e.g. Siwan motifs, subtle floristry'}
                />
              </div>

              <div className="form-field">
                <span>{isAr ? 'الميزانية التقديرية (ج.م)' : 'Target Budget (EGP)'}</span>
                <input
                  type="number"
                  value={form.targetBudget}
                  onChange={(e) => setForm({ ...form, targetBudget: e.target.value })}
                  placeholder="5000"
                />
              </div>

              <div className="form-field form-field-wide">
                <span>{isAr ? 'المقاسات أو قياسات خاصة' : 'Size or Custom Dimensions'}</span>
                <input
                  type="text"
                  value={form.sizeDetails}
                  onChange={(e) => setForm({ ...form, sizeDetails: e.target.value })}
                  placeholder={isAr ? 'المقاس المعتاد أو الطول ومحيط الصدر' : 'Standard size or custom bust/length'}
                />
              </div>

              <div className="form-field form-field-wide">
                <span>
                  {isAr ? 'تفاصيل التصميم والرؤية' : 'Detailed Description & Vision'} <em>*</em>
                </span>
                <textarea
                  required
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder={
                    isAr
                      ? 'صفي لنا المناسبة، شكل الياقة، كثافة التطريز، وأي فكرة تودين تنفيذها…'
                      : 'Describe your silhouette idea, density of embroidery, sleeve cut, or the occasion.'
                  }
                />
              </div>

              <div className="form-field form-field-wide">
                <div className="flex items-center justify-between mb-1">
                  <span>
                    {isAr
                      ? `صور مرجعية للتصميم (${referenceItems.length} من ٥)`
                      : `Reference Images (${referenceItems.length} of 5)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowUrlFallback(!showUrlFallback)}
                    className="text-[11px] text-[#49343f] underline"
                  >
                    {showUrlFallback
                      ? isAr
                        ? 'إخفاء خيار الروابط'
                        : 'Hide URL option'
                      : isAr
                      ? 'إضافة رابط صورة كبديل'
                      : 'Or enter image URL instead'}
                  </button>
                </div>

                {uploadError && (
                  <p className="text-xs text-[#a34d55] mb-2">{uploadError}</p>
                )}

                {/* Device Upload Area */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <label
                      className={`outline-button min-h-[42px] px-4 text-xs cursor-pointer flex items-center gap-2 ${
                        referenceItems.length >= 5 ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <Upload size={14} />
                      <span>
                        {isAr ? 'رفع صور من جهازكِ' : 'Upload photos from device'}
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleDeviceFiles}
                        disabled={referenceItems.length >= 5}
                      />
                    </label>
                    <span className="text-[11px] text-[#806f77]">
                      {isAr
                        ? 'JPEG, PNG, WebP (حتى ٥ صور، بحد أقصى ٥ ميجابايت لكل صورة)'
                        : 'JPEG, PNG, WebP (Up to 5 images, max 5 MB each)'}
                    </span>
                  </div>

                  {/* Optional URL Input Fallback */}
                  {showUrlFallback && (
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://.../reference.webp"
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        disabled={referenceItems.length >= 5}
                      />
                      <button
                        type="button"
                        onClick={handleAddManualUrl}
                        className="outline-button min-h-[40px] px-3 text-xs"
                        disabled={referenceItems.length >= 5 || !newImageUrl.trim()}
                      >
                        <Plus size={14} />
                        {isAr ? 'إضافة رابط' : 'Add URL'}
                      </button>
                    </div>
                  )}

                  {/* Thumbnail Previews Grid */}
                  {referenceItems.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-2">
                      {referenceItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="relative border border-[rgba(73,52,63,0.2)] bg-[#fffaf8] p-1.5 flex flex-col gap-1 text-xs"
                        >
                          <img
                            src={item.preview}
                            alt={item.name}
                            className="w-full h-24 object-cover border border-[rgba(73,52,63,0.1)]"
                          />
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-[#806f77] truncate max-w-[85px]">
                              {item.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveReferenceItem(index)}
                              className="text-[#a34d55] hover:text-[#49343f] p-0.5"
                              title={isAr ? 'حذف الصورة' : 'Remove image'}
                              aria-label={`Remove reference image ${index + 1}`}
                            >
                              <X size={13} />
                            </button>
                          </div>
                          {item.isUploading && (
                            <span className="text-[9px] text-[#c4a46d]">
                              {isAr ? 'جارٍ الرفع…' : 'Uploading…'}
                            </span>
                          )}
                          {item.error && (
                            <span className="text-[9px] text-[#a34d55]">
                              {item.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Captcha */}
            <CaptchaChallenge
              language={language}
              onVerify={(valid) => setIsCaptchaValid(valid)}
            />

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="solid-button full-width mt-4"
              disabled={saving}
            >
              {saving
                ? isAr
                  ? 'جارٍ إرسال طلب التصميم…'
                  : 'Submitting request…'
                : isAr
                ? 'إرسال طلب التصميم الخاص للأتيليه'
                : 'Submit Bespoke Commission'}
            </button>
          </form>

          {/* Bespoke Guidance Aside */}
          <aside className="custom-design-aside">
            <span className="eyebrow" style={{ color: '#49343f' }}>
              <Scissors size={14} />
              {isAr ? 'خطوات التنفيذ' : 'The Bespoke Process'}
            </span>
            <h2>{isAr ? 'كيف نحقق رؤيتك؟' : 'How We Work'}</h2>
            <p>
              {isAr
                ? 'في ميرو، نعتبر التصميم الخاص رحلة إبداعية مشتركة نحرص فيها على كل غرزة ولمسة جمالية.'
                : 'Every bespoke commission receives dedicated one-on-one atelier oversight.'}
            </p>

            <ul>
              <li>
                <strong>{isAr ? '١. الاستشارة والتخطيط:' : '1. Consultation:'}</strong>{' '}
                {isAr ? 'مراجعة التصميم واختيار القماش ودرجات خيوط التطريز.' : 'Pattern alignment and thread selection.'}
              </li>
              <li>
                <strong>{isAr ? '٢. اعتماد العربون (٣٠٪):' : '2. Approval & 30% Deposit:'}</strong>{' '}
                {isAr ? 'يتم سداد عربون ٣٠٪ للبدء الفعلي في قص الخامة والتطريز اليدوي.' : 'Formal deposit initiates hand cutting.'}
              </li>
              <li>
                <strong>{isAr ? '٣. الصياغة اليدوية:' : '3. Artisan Execution:'}</strong>{' '}
                {isAr ? 'من أسبوعين إلى ثلاثة أسابيع من العمل الحرفي الدقيق.' : '14 to 21 working days of hand-needlework.'}
              </li>
              <li>
                <strong>{isAr ? '٤. التسليم والفحص:' : '4. Delivery & Inspection:'}</strong>{' '}
                {isAr ? 'تغليف فاخر وشحن آمن مع حق المعاينة قبل سداد المتبقي.' : 'Luxury packaging with final inspection.'}
              </li>
            </ul>

            <div className="custom-deposit-note">
              <strong>{isAr ? 'نسبة العربون القانونية:' : 'Statutory Deposit Policy:'}</strong>
              <p>
                {isAr
                  ? 'معدل العربون ثابت ومحدد بنسبة ٣٠٪ وفق معايير الحرفة وقانون حماية المستهلك للسلع المصنعة حسب الطلب.'
                  : 'The fixed 30% deposit rate covers custom fabric procurement and dedicated artisan hours.'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
