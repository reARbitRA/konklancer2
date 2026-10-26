import React, { useState } from 'react';
import {
  Sparkles, CheckCircle2, AlertTriangle, Clock, Layers, Coins, X,
  ArrowLeft, Flame, FileText, Code2, RefreshCw, ShieldCheck, TrendingUp,
} from 'lucide-react';
import { FreelanceJob, AIAnalysis } from '../types';
import { analyzeJobDirect } from '../services/browserLLM';
import { BrutalModal } from './brutalist/Modal';

interface AIEvaluatorModalProps {
  job: FreelanceJob | null;
  onClose: () => void;
  onProceedToProposal: (job: FreelanceJob) => void;
  onProceedToCoding: (job: FreelanceJob) => void;
  onUpdateAnalysis: (jobId: string, analysis: AIAnalysis) => void;
}

const RISK_LABEL: Record<string, { label: string; bg: string }> = {
  low: { label: 'ریسک پایین', bg: 'bg-[#00E599]' },
  medium: { label: 'ریسک متوسط', bg: 'bg-[#FFDE03]' },
  high: { label: 'ریسک بالا', bg: 'bg-[#FF3B30] text-white' },
};

export const AIEvaluatorModal: React.FC<AIEvaluatorModalProps> = ({
  job, onClose, onProceedToProposal, onProceedToCoding, onUpdateAnalysis,
}) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(job?.aiAnalysis || null);
  const [error, setError] = useState<string | null>(null);

  if (!job) return null;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await analyzeJobDirect(job);
      setAnalysis(data);
      onUpdateAnalysis(job.id, data);
    } catch (err: any) {
      setError(err.message || 'خطا در برقراری ارتباط با مدل هوش مصنوعی');
    } finally {
      setLoading(false);
    }
  };

  const risk = analysis ? RISK_LABEL[analysis.riskLevel] || RISK_LABEL.medium : null;

  return (
    <BrutalModal
      title="ارزیابی هوشمند پروژه با Konkred AI"
      subtitle={`${job.platform} · ${job.id.slice(0, 18)}`}
      icon={Sparkles}
      onClose={onClose}
      size="lg"
      meta={
        <span className="hidden sm:inline-flex px-2 py-1 bg-[#FFDE03] text-[#0a0a0a] border-[2px] border-[#0a0a0a] text-[10px] font-black">
          AI ENGINE
        </span>
      }
      footer={
        <>
          <button onClick={onClose} className="brutal-btn brutal-btn--sm">
            <X className="w-3.5 h-3.5" /> بستن
          </button>
          {analysis && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => { onClose(); onProceedToProposal(job); }}
                className="brutal-btn brutal-btn--sm"
              >
                <FileText className="w-3.5 h-3.5" /> نگارش پروپوزال با این تحلیل
              </button>
              <button
                onClick={() => { onClose(); onProceedToCoding(job); }}
                className="brutal-btn brutal-btn--sm brutal-btn--primary gap-1"
              >
                <Code2 className="w-3.5 h-3.5" /> تولید خودکار سورس <ArrowLeft className="w-3 h-3" />
              </button>
            </div>
          )}
        </>
      }
    >
      <div className="space-y-3">
        {/* Job summary */}
        <div className="p-3 bg-[#FFFBF0] border-[2.5px] border-[#0a0a0a]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-[13px] font-black leading-6">{job.title}</span>
            <span className="shrink-0 px-2.5 py-1 bg-[#FFDE03] border-[2px] border-[#0a0a0a] font-mono font-black text-[11px]">
              {job.budgetFormatted}
            </span>
          </div>
          <p className="mt-2 text-[12px] leading-6 text-[#333] line-clamp-3">{job.description}</p>
        </div>

        {/* Idle */}
        {!analysis && !loading && (
          <div className="border-[2.5px] border-[#0a0a0a] p-6 text-center space-y-3 bg-white">
            <div className="w-14 h-14 mx-auto bg-[#FFDE03] border-[2.5px] border-[#0a0a0a] flex items-center justify-center">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-[13px] font-black">شروع تحلیل پتانسیل اتوماسیون پروژه</h3>
            <p className="text-[11px] leading-6 text-[#4a4a4a] max-w-md mx-auto">
              هوش مصنوعی متن پروژه را بررسی می‌کند تا درصد امکان انجام ۱۰۰٪ خودکار توسط ایجنت،
              قیمت رقابتی برنده و ترفند روانشناسی را مشخص کند.
            </p>
            <button onClick={runAnalysis} className="brutal-btn brutal-btn--primary">
              <Sparkles className="w-4 h-4" /> اجرای تحلیل فوری (Konkred AI)
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="border-[2.5px] border-[#0a0a0a] p-10 text-center space-y-3 bg-[#FFFBF0]">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin" />
            <p className="text-[12px] font-bold">در حال ارزیابی کدنویسی، ضریب سود و بررسی محدودیت‌های فنی کارفرما…</p>
            <div className="h-3 w-full max-w-sm mx-auto bg-white border-[2px] border-[#0a0a0a] overflow-hidden">
              <div className="h-full bg-[#0066FF] animate-pulse" style={{ width: '65%' }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-[#FF3B30] text-white border-[2.5px] border-[#0a0a0a] flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> {error}
            </span>
            <button onClick={runAnalysis} className="px-2.5 py-1 bg-white text-[#0a0a0a] border-[2px] border-[#0a0a0a] text-[11px] font-black hover:bg-[#FFDE03]">
              تلاش مجدد
            </button>
          </div>
        )}

        {/* Results */}
        {analysis && !loading && (
          <div className="space-y-3 animate-brutal-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Automatability */}
              <div className="p-3 bg-white border-[2.5px] border-[#0a0a0a]">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>امتیاز اتوماسیون</span>
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 font-mono text-2xl font-black">{analysis.automatabilityScore}٪</div>
                <div className="mt-2 h-2.5 w-full bg-[#FFFBF0] border-[2px] border-[#0a0a0a] overflow-hidden">
                  <div className="h-full bg-[#00E599]" style={{ width: `${analysis.automatabilityScore}%` }} />
                </div>
                <div className="mt-1.5 text-[10px] font-black uppercase tracking-wide text-[#00875A]">آماده اجرای خودکار</div>
              </div>

              {/* Price */}
              <div className="p-3 bg-[#FFFBF0] border-[2.5px] border-[#0a0a0a]">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>قیمت پیشنهادی برنده</span>
                  <Coins className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 font-mono text-lg font-black">{analysis.recommendedBidFormatted}</div>
                <p className="mt-1.5 text-[10px] font-bold text-[#4a4a4a]">~۱۸٪ پایین‌تر از بودجه برای تایید فوری</p>
              </div>

              {/* Duration */}
              <div className="p-3 bg-[#0066FF] text-white border-[2.5px] border-[#0a0a0a]">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>زمان تحویل پیشنهادی</span>
                  <Clock className="w-3.5 h-3.5" />
                </div>
                <div className="mt-1 font-mono text-lg font-black">{analysis.suggestedDuration}</div>
                <p className="mt-1.5 text-[10px] font-bold opacity-90">احتمال برنده شدن: {analysis.winProbability}</p>
              </div>
            </div>

            {/* Reason */}
            <div className="p-3 border-[2.5px] border-[#0a0a0a] bg-white">
              <h4 className="text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> تحلیل استراتژیک ایجنت
              </h4>
              <p className="mt-1.5 text-[12px] leading-6 text-[#333]">{analysis.feasibilityReason}</p>
            </div>

            {/* Kicker */}
            <div className="p-3 bg-[#FFDE03] border-[2.5px] border-[#0a0a0a]">
              <span className="text-[11px] font-black uppercase tracking-wide block">نکته کلیدی خط اول پروپوزال</span>
              <p className="mt-1 text-[12px] font-bold italic leading-6">«{analysis.suggestedKicker}»</p>
            </div>

            {/* Risk + stack */}
            <div className="flex flex-wrap items-center gap-2">
              {risk && (
                <span className={`px-2.5 py-1 border-[2px] border-[#0a0a0a] text-[11px] font-black ${risk.bg}`}>
                  <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
                  {risk.label}
                </span>
              )}
              <span className="px-2.5 py-1 bg-white border-[2px] border-[#0a0a0a] text-[11px] font-black flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> برد: {analysis.winProbability}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <Layers className="w-3.5 h-3.5" /> پشته فنی:
              </span>
              <div className="flex flex-wrap gap-1">
                {analysis.technicalStack.map((tech, i) => (
                  <span key={i} className="brutal-tag">{tech}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </BrutalModal>
  );
};
