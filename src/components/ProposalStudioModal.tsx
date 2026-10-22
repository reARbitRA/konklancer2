import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Copy, 
  Check, 
  Sparkles, 
  X, 
  Coins, 
  Clock, 
  Send,
  Code2,
  ThumbsUp
} from 'lucide-react';
import { FreelanceJob, ProposalResult } from '../types';
import { getCustomLLMHeaders } from '../utils/customLLMClient';

interface ProposalStudioModalProps {
  job: FreelanceJob | null;
  onClose: () => void;
  onProceedToCoding: (job: FreelanceJob) => void;
  onSaveProposalToJob: (jobId: string, proposal: string, price: number) => void;
}

export const ProposalStudioModal: React.FC<ProposalStudioModalProps> = ({
  job,
  onClose,
  onProceedToCoding,
  onSaveProposalToJob,
}) => {
  const [tone, setTone] = useState<'friendly_expert' | 'direct_urgent' | 'technical_detailed'>('friendly_expert');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [proposalText, setProposalText] = useState<string>('');
  const [deliveryTime, setDeliveryTime] = useState<string>('۴ ساعت');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (job) {
      const initialPrice = job.proposedPrice || (job.budget ? Math.round(job.budget * 0.82) : 2500000);
      setCustomPrice(initialPrice);
      if (job.proposal) {
        setProposalText(job.proposal);
      } else {
        generateProposal('friendly_expert', initialPrice);
      }
    }
  }, [job]);

  if (!job) return null;

  const generateProposal = async (selectedTone = tone, price = customPrice) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/generate-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCustomLLMHeaders(),
        },
        body: JSON.stringify({
          title: job.title,
          description: job.description,
          budget: price,
          tone: selectedTone,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'خطا در تولید پروپوزال');

      setProposalText(data.proposal);
      setDeliveryTime(data.deliveryTime || '۴ ساعت');
      onSaveProposalToJob(job.id, data.proposal, price);
    } catch (err: any) {
      setError(err.message || 'خطا در ارتباط با سرور هوش مصنوعی');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(proposalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAndAdvance = () => {
    onSaveProposalToJob(job.id, proposalText, customPrice);
    onClose();
    onProceedToCoding(job);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">استودیو نگارش پیشنهاد متقاعدکننده (ضد کلیشه)</h2>
              <p className="text-[11px] text-slate-400 font-mono">پروژه: {job.title.slice(0, 45)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Tone Selector Tabs */}
          <div className="space-y-2">
            <label className="text-xs text-slate-400 block">انتخاب سبک و لحن روانشناسی:</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'friendly_expert', label: 'صمیمی و ارشد (پیش‌فرض)', desc: 'بیشترین جلب اعتماد' },
                { key: 'direct_urgent', label: 'صریح و تحویل فوری', desc: 'تاکید بر انجام تا چند ساعت' },
                { key: 'technical_detailed', label: 'فنی و ساختاریافته', desc: 'اشاره به کتابخانه‌ها و تست' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    const newTone = item.key as any;
                    setTone(newTone);
                    generateProposal(newTone, customPrice);
                  }}
                  className={`p-3 rounded-lg border text-right transition-all ${
                    tone === item.key
                      ? 'bg-slate-800 border-amber-500/60 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="block text-xs font-semibold">{item.label}</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pricing & Duration Controls */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">مبلغ پیشنهادی شما (تومان):</label>
              <div className="relative">
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 tabular-nums"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                بودجه کارفرما: {job.budgetFormatted}
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">زمان تحویل:</label>
              <input
                type="text"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                placeholder="مثال: ۴ ساعت یا ۱ روز"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-emerald-400/90 mt-1 block">
                تحویل سریع = ۸۰٪ افزایش شانس برنده شدن
              </span>
            </div>
          </div>

          {/* Proposal Text Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>متن نهایی پیشنهاد (آماده ارسال در سایت فریلنسری):</span>
              </label>

              <button
                onClick={() => generateProposal(tone, customPrice)}
                disabled={loading}
                className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
              >
                {loading ? 'در حال بازنویسی...' : 'بازنویسی مجدد ↻'}
              </button>
            </div>

            <div className="relative">
              <textarea
                rows={6}
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                placeholder="متن پروپوزال توسط هوش مصنوعی در حال نگارش است..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-amber-500/60 font-sans"
              />

              <button
                onClick={handleCopy}
                className="absolute left-3 bottom-3 flex items-center gap-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-[11px] border border-slate-700 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-300">کپی شد!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>کپی برای چت کارفرما</span>
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            <p className="text-[11px] text-slate-400">
              💡 این متن را مستقیماً داخل کادر پیشنهاد در سایت {job.platform} پیست کنید و ارسال نمایید.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white"
          >
            انصراف
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium"
            >
              کپی متن
            </button>

            <button
              onClick={handleSaveAndAdvance}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-lg text-xs shadow-md transition-all active:scale-95"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>ثبت پیشنهاد و شروع کدنویسی</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
