import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { verifyCaptchaAnswer } from '../lib/commerceLogic';

interface CaptchaChallengeProps {
  onVerify: (isValid: boolean) => void;
  language?: 'en' | 'ar';
}

export const CaptchaChallenge: React.FC<CaptchaChallengeProps> = ({ onVerify, language = 'en' }) => {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isAnsweredCorrectly, setIsAnsweredCorrectly] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const generateChallenge = () => {
    const a = Math.floor(Math.random() * 9) + 2;
    const b = Math.floor(Math.random() * 8) + 1;
    setNum1(a);
    setNum2(b);
    setUserAnswer('');
    setIsAnsweredCorrectly(false);
    onVerify(false);
  };

  useEffect(() => {
    generateChallenge();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUserAnswer(val);

    // If honeypot is filled, bot detected
    if (honeypot) {
      onVerify(false);
      return;
    }

    const correct = verifyCaptchaAnswer(num1 + num2, val);
    setIsAnsweredCorrectly(correct);
    onVerify(correct);
  };

  const isAr = language === 'ar';

  return (
    <div className="border border-[rgba(73,52,63,0.18)] bg-[#fffaf8] p-4 my-4 flex flex-col gap-2 rounded-none">
      {/* Bot honeypot: hidden from real humans */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="website_url">Leave this empty</label>
        <input
          id="website_url"
          type="text"
          name="website_url"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between text-xs font-medium text-[#49343f]">
        <span className="flex items-center gap-1.5 font-sans uppercase tracking-wider text-[11px]">
          <ShieldCheck size={15} className="text-[#c4a46d]" />
          {isAr ? 'التحقق الأمني للطلب' : 'Security Verification'}
        </span>
        <button
          type="button"
          onClick={generateChallenge}
          className="text-[#947381] hover:text-[#49343f] flex items-center gap-1 text-[10px] uppercase tracking-wider transition-colors"
          title={isAr ? 'تحديث السؤال' : 'Refresh question'}
        >
          <RefreshCw size={12} />
          {isAr ? 'تغيير' : 'Refresh'}
        </button>
      </div>

      <p className="text-[11px] text-[#806f77] m-0">
        {isAr
          ? `يرجى حل المسألة البسيطة للتأكد من أنك لست روبوتًا: ما ناتج ${num1} + ${num2}؟`
          : `Please solve the quick challenge to confirm you are human: What is ${num1} + ${num2}?`}
      </p>

      <div className="flex items-center gap-3 mt-1">
        <input
          type="number"
          inputMode="numeric"
          required
          placeholder="?"
          value={userAnswer}
          onChange={handleChange}
          className="w-24 h-10 px-3 border border-[rgba(73,52,63,0.22)] bg-white text-[#3e3037] text-center font-bold text-sm outline-none focus:border-[#c4a46d]"
        />
        {isAnsweredCorrectly && (
          <span className="text-[11px] text-[#567c4b] font-medium flex items-center gap-1">
            ✓ {isAr ? 'تم التحقق بنجاح' : 'Verified successfully'}
          </span>
        )}
      </div>
    </div>
  );
};
