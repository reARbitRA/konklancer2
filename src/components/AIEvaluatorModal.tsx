import React, { useState } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Layers, 
  Coins, 
  X,
  ArrowLeft,
  Flame,
  FileText,
  Code2
} from 'lucide-react';
import { FreelanceJob, AIAnalysis } from '../types';
import { getCustomLLMHeaders, getCustomLLMPayload } from '../utils/customLLMClient';

interface AIEvaluatorModalProps {
  job: FreelanceJob | null;
  onClose: () => void;
  onProceedToProposal: (job: FreelanceJob) => void;
  onProceedToCoding: (job: FreelanceJob) => void;
  onUpdateAnalysis: (jobId: string, analysis: AIAnalysis) => void;
}

export const AIEvaluatorModal: React.FC<AIEvaluatorModalProps> = ({
  job,
  onClose,
  onProceedToProposal,
  onProceedToCoding,
  onUpdateAnalysis,
}) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(job?.aiAnalysis || null);
  const [error, setError] = useState<string | null>(null);

  if (!job) return null;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCustomLLMHeaders(),
        },
        body: JSON.stringify({
          title: job.title,
          ...getCustomLLMPayload(),
          description: job.description,
          budget: job.budget,
          platform: job.platform,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'خطا در تحلیل پروژه');

      setAnalysis(data);
      onUpdateAnalysis(job.id, data);
    } catch (err: any) {
      setError(err.message || 'خطا در برقراری ارتباط با مدل هوش مصنوعی');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">ارزیابی هوشمند پروژه با Konkred AI</h2>
              <p className="text-[11px] text-slate-400 font-mono">پلتفرم: {job.platform} · شناسه: {job.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Job summary info */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-white">{job.title}</span>
              <span className="font-mono text-emerald-400 font-bold tabular-nums">{job.budgetFormatted}</span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
              {job.description}
            </p>
          </div>

          {/* If no analysis yet, show trigger button */}
          {!analysis && !loading && (
            <div className="text-center py-8 space-y-3">
              <Sparkles className="h-10 w-10 text-sky-400 mx-auto animate-pulse" />
              <h3 className="text-sm font-bold text-white">شروع تحلیل پتانسیل اتوماسیون پروژه</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                هوش مصنوعی متن پروژه را بررسی می‌کند تا درصد امکان انجام ۱۰۰٪ خودکار توسط ایجنت، قیمت رقابتی برنده و ترفند روانشناسی را مشخص کند.
              </p>
              <button
                onClick={runAnalysis}
                className="mt-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium rounded-lg text-xs shadow-md transition-all active:scale-95"
              >
                اجرای تحلیل فوری (Konkred AI)
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-12 space-y-3">
              <div className="h-8 w-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-300">در حال ارزیابی کدنویسی، ضریب سود و بررسی محدودیت‌های فنی کارفرما...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-3 bg-red-950/30 border border-red-800/50 rounded-lg text-xs text-red-300 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={runAnalysis} className="underline text-red-200">تلاش مجدد</button>
            </div>
          )}

          {/* Results Display */}
          {analysis && !loading && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Primary Score Indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Score */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>امتیاز اتوماسیون:</span>
                    <Flame className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
                      {analysis.automatabilityScore}٪
                    </span>
                    <span className="text-[11px] text-emerald-500 font-medium">آماده اجرای خودکار</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${analysis.automatabilityScore}%` }}
                    />
                  </div>
                </div>

                {/* Recommended Price */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>قیمت پیشنهادی برنده:</span>
                    <Coins className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <div className="font-mono text-lg font-bold text-amber-300 tabular-nums">
                    {analysis.recommendedBidFormatted}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    ~۱۸٪ پایین‌تر از بودجه برای تایید فوری
                  </p>
                </div>

                {/* Turnaround Time */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>زمان تحویل پیشنهادی:</span>
                    <Clock className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <div className="font-mono text-lg font-bold text-white">
                    {analysis.suggestedDuration}
                  </div>
                  <p className="text-[11px] text-sky-400/90 font-medium mt-1">
                    احتمال برنده شدن: {analysis.winProbability}
                  </p>
                </div>
              </div>

              {/* Feasibility reason */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>تحلیل استراتژیک ایجنت:</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {analysis.feasibilityReason}
                </p>
              </div>

              {/* Key psychological hook */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs space-y-1">
                <span className="font-semibold text-amber-300 block">نکته کلیدی خط اول پروپوزال:</span>
                <p className="text-slate-300 italic">
                  "{analysis.suggestedKicker}"
                </p>
              </div>

              {/* Technical Stack */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span>پشته فنی اجرایی:</span>
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {analysis.technicalStack.map((tech, i) => (
                    <span key={i} className="bg-slate-800 px-2 py-0.5 rounded text-slate-200">
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            بستن
          </button>

          {analysis && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onClose();
                  onProceedToProposal(job);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>نگارش پروپوزال با این تحلیل</span>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onProceedToCoding(job);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-lg text-xs shadow-md transition-all active:scale-95"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>تولید خودکار سورس کد</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
