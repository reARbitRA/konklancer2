import React, { useState, useEffect } from 'react';
import {
  FileText, Copy, Check, Sparkles, X, Coins, Clock, Send, Code2, ThumbsUp, RefreshCw, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import { FreelanceJob } from '../types';
import { generateProposalDirect } from '../services/browserLLM';
import { safeCopyText } from '../utils/safeClipboard';
import { BrutalModal } from './brutalist/Modal';

interface ProposalStudioModalProps {
  job: FreelanceJob | null;
  onClose: () => void;
  onProceedToCoding: (job: FreelanceJob) => void;
  onSaveProposalToJob: (jobId: string, proposal: string, price: number) => void;
}

const TONES = [
  { key: 'friendly_expert', label: 'صمیمی و ارشد', desc: 'بیشترین جلب اعتماد', icon: ThumbsUp },
  { key: 'direct_urgent', label: 'صریح و فوری', desc: 'تحویل تا چند ساعت', icon: Clock },
  { key: 'technical_detailed', label: 'فنی و ساختاریافته', desc: 'کتابخانه‌ها و تست', icon: Code2 },
] as const;

export const ProposalStudioModal: React.FC<ProposalStudioModalProps> = ({
  job, onClose, onProceedToCoding, onSaveProposalToJob,
}) => {
  const [tone, setTone] = useState<'friendly_expert' | 'direct_urgent' | 'technical_detailed'>('friendly_expert');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [proposalText, setProposalText] = useState<string>('');
  const [deliveryTime, setDeliveryTime] = useState<string>('۴ ساعت');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Initialize local state when the modal opens — but DO NOT auto-fire the
  // LLM call. The user must explicitly click a tone or the "regenerate"
  // button so we don't burn quota / show unexpected progress on open.
  useEffect(() => {
    if (!job) return;
    const initialPrice = job.proposedPrice || (job.budget ? Math.round(job.budget * 0.82) : 2500000);
    setCustomPrice(initialPrice);
    if (job.proposal) {
      setProposalText(job.proposal);
    } else {
      setProposalText('');
      setHasGenerated(false);
    }
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) return null;

  const generateProposal = async (selectedTone = tone, price = customPrice) => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateProposalDirect(job, selectedTone, price);
      setProposalText(data.proposal);
      setDeliveryTime(data.deliveryTime || '۴ ساعت');
      setHasGenerated(true);
      onSaveProposalToJob(job.id, data.proposal, price);
    } catch (err: any) {
      setError(err.message || 'خطا در ارتباط با سرور هوش مصنوعی');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const ok = await safeCopyText(proposalText);
    setCopied(ok);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveAndAdvance = () => {
    onSaveProposalToJob(job.id, proposalText, customPrice);
    onClose();
    onProceedToCoding(job);
  };

  return (
    <BrutalModal
      title="استودیو نگارش پیشنهاد متقاعدکننده"
      subtitle={`${job.platform} · ${job.title.slice(0, 40)}`}
      icon={FileText}
      onClose={onClose}
      size="lg"
      variant="accent"
      meta={
        <span className="hidden sm:inline-flex px-2 py-1 bg-[#0a0a0a] text-[#FFDE03] border-[2px] border-[#0a0a0a] text-[10px] font-black">
          ANTI-CLICHÉ
        </span>
      }
      footer={
        <>
          <button onClick={onClose} className="brutal-btn brutal-btn--sm">
            <X className="w-3.5 h-3.5" /> انصراف
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleCopy} className="brutal-btn brutal-btn--sm">
              <Copy className="w-3.5 h-3.5" /> کپی متن
            </button>
            <button onClick={handleSaveAndAdvance} className="brutal-btn brutal-btn--sm brutal-btn--mint gap-1">
              <Code2 className="w-3.5 h-3.5" /> ثبت پیشنهاد و شروع کدنویسی <ArrowLeft className="w-3 h-3" />
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        {/* Tone selector */}
        <div>
          <label className="block text-[11px] font-black uppercase tracking-wide mb-1.5">انتخاب سبک و لحن روانشناسی</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TONES.map((item) => {
              const active = tone === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => { const t = item.key as any; setTone(t); generateProposal(t, customPrice); }}
                  className={`p-2.5 border-[2.5px] border-[#0a0a0a] text-right transition-all ${
                    active ? 'bg-[#0a0a0a] text-white shadow-[3px_3px_0px_0px_#000]' : 'bg-white hover:bg-[#FFFBF0]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-black">
                    <item.icon className="w-3.5 h-3.5" /> {item.label}
                  </span>
                  <span className={`block text-[10px] mt-0.5 font-medium ${active ? 'opacity-80' : 'text-[#4a4a4a]'}`}>{item.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Price + delivery */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-[#FFFBF0] border-[2.5px] border-[#0a0a0a]">
          <div>
            <label className="block text-[11px] font-black mb-1 flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> مبلغ پیشنهادی (تومان)</label>
            <input
              type="number"
              value={customPrice}
              onChange={(e) => setCustomPrice(parseInt(e.target.value) || 0)}
              className="w-full bg-white border-[2px] border-[#0a0a0a] px-2.5 py-1.5 text-[12px] font-mono font-black focus:outline-none focus:border-[#0066FF] tabular-nums"
            />
            <span className="text-[10px] font-bold text-[#4a4a4a] mt-1 block">بودجه کارفرما: {job.budgetFormatted}</span>
          </div>
          <div>
            <label className="block text-[11px] font-black mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> زمان تحویل</label>
            <input
              type="text"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              placeholder="مثال: ۴ ساعت یا ۱ روز"
              className="w-full bg-white border-[2px] border-[#0a0a0a] px-2.5 py-1.5 text-[12px] font-bold focus:outline-none focus:border-[#0066FF]"
            />
            <span className="text-[10px] font-bold text-[#00875A] mt-1 block">تحویل سریع = ۸۰٪ افزایش شانس برد</span>
          </div>
        </div>

        {/* Proposal text */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> متن نهایی پیشنهاد
            </label>
            <button
              onClick={() => generateProposal(tone, customPrice)}
              disabled={loading}
              className="brutal-btn brutal-btn--sm !h-[26px] !text-[10px]"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'در حال بازنویسی…' : 'بازنویسی مجدد'}
            </button>
          </div>

          <div className="relative">
            <textarea
              rows={7}
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              placeholder={loading ? 'متن پروپوزال توسط هوش مصنوعی در حال نگارش است…' : 'متن پروپوزال اینجا نمایش داده می‌شود…'}
              className="w-full bg-white border-[2.5px] border-[#0a0a0a] p-3 pb-11 text-[12px] leading-7 text-[#1a1a1a] focus:outline-none focus:border-[#0066FF] font-sans"
            />
            <button
              onClick={handleCopy}
              className={`absolute left-2 bottom-2 flex items-center gap-1 px-2.5 py-1 border-[2px] border-[#0a0a0a] text-[11px] font-black transition-colors ${
                copied ? 'bg-[#00E599]' : 'bg-white hover:bg-[#FFDE03]'
              }`}
            >
              {copied ? <><Check className="w-3 h-3" /> کپی شد!</> : <><Copy className="w-3 h-3" /> کپی برای چت کارفرما</>}
            </button>
          </div>

          {error && (
            <div className="mt-2 p-2 bg-[#FF3B30] text-white border-[2px] border-[#0a0a0a] text-[11px] font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          <p className="mt-2 text-[11px] font-bold text-[#4a4a4a] flex items-start gap-1">
            <Send className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            این متن را مستقیماً داخل کادر پیشنهاد در سایت {job.platform} پیست و ارسال کنید.
          </p>
          {!hasGenerated && !loading && (
            <p className="mt-1 text-[10px] font-bold text-[#8a6d00] bg-[#FFDE03]/40 border-[2px] border-[#0a0a0a] px-2 py-1 inline-block">
              هنوز پیشنهادی تولید نشده — یک لحن را انتخاب کنید یا «بازنویسی مجدد» را بزنید.
            </p>
          )}
        </div>
      </div>
    </BrutalModal>
  );
};
