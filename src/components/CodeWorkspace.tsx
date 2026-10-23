import React, { useEffect, useState } from 'react';
import {
  FileCode2,
  FolderOpen,
  Download,
  Copy,
  Check,
  Sparkles,
  FileText,
  Printer,
  Archive,
  Wand2,
  Eye,
  Edit3,
  Plus,
  CheckCircle2,
  Loader2,
  Layers,
  Award,
} from 'lucide-react';
import { DeliverableBlueprintMode, FreelanceJob } from '../types';
import {
  BLUEPRINT_MODES,
  DeliveryProgressState,
  buildExecutiveClientDocumentHtml,
  detectOptimalBlueprintMode,
  generateEnterpriseDeliverablePackage,
  refineSingleDeliverableFile,
  renderMarkdownToRichHtml,
} from '../services/deliveryEngine';
import { createZipBlob } from '../utils/zipBuilder';
import { safeCopyText } from '../utils/safeClipboard';
import { downloadBlob } from '../utils/safeDownload';

interface CodeWorkspaceProps {
  job: FreelanceJob | null;
  onUpdateJob?: (updatedJob: FreelanceJob) => void;
  onUpdateJobFiles?: (jobId: string, files: Record<string, string>) => void;
  onOpenGitHubPush?: (job: FreelanceJob, files: Record<string, string>) => void;
  onUpdateJobRepoUrl?: (jobId: string, repoUrl: string) => void;
  githubToken?: string;
  aiAvailable?: boolean | null;
  onOpenSettings?: () => void;
}

function defaultModeForCategory(_cat?: string): DeliverableBlueprintMode {
  return 'software_mvp';
}

export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({
  job,
  onUpdateJob,
  onUpdateJobFiles,
  onOpenGitHubPush,
  aiAvailable,
  onOpenSettings,
}) => {
  const [mode, setMode] = useState<DeliverableBlueprintMode>('software_mvp');
  const [architectBrief, setArchitectBrief] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [viewMode, setViewMode] = useState<'rendered' | 'editor'>('rendered');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<DeliveryProgressState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ابزار ویرایش و تکمیل هوشمند تک‌فایل با AI
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // افزودن دستی فایل جدید به پکیج تحویلی
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  useEffect(() => {
    if (!job) return;
    setMode(
      job.blueprintMode && job.blueprintMode !== 'auto'
        ? job.blueprintMode
        : detectOptimalBlueprintMode(job) || defaultModeForCategory(job.categoryKey),
    );
    const mergedMap = job.solutionCode || job.generatedFiles || {};
    const keys = Object.keys(mergedMap);
    if (keys.length > 0) {
      setSelectedFile((prev) => (prev && mergedMap[prev] ? prev : keys[0]));
      const first = keys[0];
      setViewMode(first.endsWith('.md') ? 'rendered' : 'editor');
    } else {
      setSelectedFile('');
    }
    setErrorMessage(null);
  }, [job?.id]);

  if (!job) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 sm:p-14 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
          <Award className="w-8 h-8 text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">
          استودیو معماری، مستندسازی فنی عمیق و پکیج تحویل کارفرما
        </h3>
        <p className="text-sm text-slate-400 leading-relaxed">
          یک پروژه از بخش «شکار پروژه‌ها» انتخاب کنید تا این موتور در ۳ فاز متوالی همزمان با استانداردهای مهندسی روز دنیا:
          <br />
          ۱) نقشه راه اجرایی و طرح توجیهی کارفرما · ۲) مستند جامع معماری و مشخصات فنی عمیق · ۳) فایل‌های کد/ابزار اجرایی و کتابچه راهنمای تحویل را تولید و به صورت پکیج ZIP و سند رسمی کارفرما بسته‌بندی کند.
        </p>
      </div>
    );
  }

  const files = job.solutionCode || job.generatedFiles || {};
  const fileNames = Object.keys(files).sort();
  const activeFile = selectedFile && files[selectedFile] !== undefined ? selectedFile : fileNames[0] || '';
  const activeContent = activeFile ? files[activeFile] || '' : '';
  const isMarkdownFile = activeFile.toLowerCase().endsWith('.md');

  const commitFilesUpdate = (nextFiles: Record<string, string>, extra?: Partial<FreelanceJob>) => {
    const updatedJob: FreelanceJob = {
      ...job,
      ...extra,
      solutionCode: nextFiles,
      generatedFiles: nextFiles,
    };
    onUpdateJob?.(updatedJob);
    onUpdateJobFiles?.(job.id, nextFiles);
  };

  const handleGenerateEnterprisePackage = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setProgress({
      stage: 1,
      totalStages: 3,
      label: 'آماده‌سازی موتور ۳ مرحله‌ای معماری و مستندسازی...',
    });

    try {
      const result = await generateEnterpriseDeliverablePackage(job, {
        mode,
        customBrief: architectBrief,
        onProgress: (prog) => setProgress(prog),
        partialFilesCallback: (partialFiles) => {
          const partialKeys = Object.keys(partialFiles);
          if (partialKeys.length > 0) {
            const mergedPartial = { ...files, ...partialFiles };
            commitFilesUpdate(mergedPartial, { blueprintMode: mode });
            setSelectedFile((curr) => curr || partialKeys[0]);
          }
        },
      });

      const finalKeys = Object.keys(result.files).sort();
      commitFilesUpdate(result.files, {
        status: 'in_progress',
        blueprintMode: result.resolvedMode,
        executiveSummary: result.files['00-Executive-Pitch-and-Roadmap.md'] || '',
      });
      if (finalKeys.length > 0) {
        setSelectedFile(finalKeys[0]);
        setViewMode(finalKeys[0].endsWith('.md') ? 'rendered' : 'editor');
      }
      setProgress(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در تولید پکیج تحویلی. کلید فعال در نوار بالا را بررسی کنید.');
      setProgress(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefineCurrentFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFile || !refinePrompt.trim() || isRefining) return;
    setIsRefining(true);
    setErrorMessage(null);
    try {
      const res = await refineSingleDeliverableFile({
        job,
        fileName: activeFile,
        currentContent: activeContent,
        instruction: refinePrompt.trim(),
      });
      const updatedFiles = {
        ...files,
        [activeFile]: res.updatedContent,
      };
      commitFilesUpdate(updatedFiles);
      setRefinePrompt('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'خطا در بازطراحی فایل با هوش مصنوعی');
    } finally {
      setIsRefining(false);
    }
  };

  const handleDirectContentEdit = (newText: string) => {
    if (!activeFile) return;
    commitFilesUpdate({
      ...files,
      [activeFile]: newText,
    });
  };

  const handleAddManualFile = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFileName.trim();
    if (!clean) return;
    commitFilesUpdate({
      ...files,
      [clean]: clean.endsWith('.md') ? `# ${clean}\n\n` : '',
    });
    setSelectedFile(clean);
    setViewMode('editor');
    setNewFileName('');
    setShowNewFileInput(false);
  };

  // ==================== خروجی‌های رسمی قابل تحویل به کارفرما ====================
  const triggerBlobDownload = (blob: Blob, filename: string) => {
    downloadBlob(blob, filename);
  };

  const safeSlug = job.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'deliverable';

  const handleDownloadFullZip = () => {
    if (fileNames.length === 0) return;
    const zipBlob = createZipBlob(files);
    triggerBlobDownload(zipBlob, `KonkLancer-Deliverable-${safeSlug}.zip`);
  };

  const handleDownloadExecutiveHtmlReport = () => {
    if (fileNames.length === 0) return;
    const html = buildExecutiveClientDocumentHtml(job, files);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    triggerBlobDownload(blob, `Executive-Technical-Dossier-${safeSlug}.html`);
  };

  const handleDownloadWordDoc = () => {
    if (fileNames.length === 0) return;
    const html = buildExecutiveClientDocumentHtml(job, files);
    const wordWrapped = `\ufeff${html}`;
    const blob = new Blob([wordWrapped], { type: 'application/msword;charset=utf-8' });
    triggerBlobDownload(blob, `Client-Technical-Specification-${safeSlug}.doc`);
  };

  const handleDownloadSingleFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeContent], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, activeFile.split('/').pop() || activeFile);
  };

  const handleCopyText = async (key: string, text: string) => {
    const ok = await safeCopyText(text);
    setCopiedKey(ok ? key : null);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Studio Control Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/25 border border-emerald-500/25 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-bold bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 rounded-full">
              <Layers className="w-3.5 h-3.5" />
              <span>شاه‌ماهی تحویل پروژه · معماری ۳ مرحله‌ای عمیق + بسته‌بندی رسمی کارفرما</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white pt-1">{job.title}</h2>
            <p className="text-xs text-slate-400 line-clamp-2">{job.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleGenerateEnterprisePackage}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-400 text-slate-950 font-extrabold rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-xs sm:text-sm"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>
                {isGenerating
                  ? 'در حال معماری و تولید ۳ مرحله‌ای...'
                  : fileNames.length > 0
                    ? 'بازتولید کامل پکیج تحویلی (۳ فاز عمیق)'
                    : 'تولید کامل معماری، مستندات فنی و فایل‌های تحویلی'}
              </span>
            </button>
          </div>
        </div>

        {/* Blueprint Mode Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-2">
            ۱. انتخاب الگوی مهندسی و نوع خروجی قابل تحویل به کارفرما:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {BLUEPRINT_MODES.map((bm) => {
              const selected = mode === bm.id;
              return (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => setMode(bm.id)}
                  className={`text-right p-3 rounded-xl border transition-all ${
                    selected
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                      : 'bg-slate-950/60 hover:bg-slate-800/70 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center gap-1.5">
                    <span>✦</span>
                    <span>{bm.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{bm.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Senior Architect Instructions */}
        <div>
          <label className="block text-xs font-bold text-slate-300 mb-1.5">
            ۲. دستور کار و نکات اختصاصی شما برای معمار ارشد (اختیاری — برای دقت ۱۰۰٪ مطابق سلیقه شما):
          </label>
          <textarea
            rows={2}
            value={architectBrief}
            onChange={(e) => setArchitectBrief(e.target.value)}
            placeholder="مثال: استک Python 3.11 + FastAPI + SQLite باشد، لاگینگ کامل، فایل تست خودکار pytest و خلاصه مدیریتی دو‌زبانه (فارسی + انگلیسی رسمی بریتانیایی) هم داخل پکیج قرار بگیرد..."
            className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Live 3-Stage Pipeline Progress */}
        {isGenerating && progress && (
          <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/40 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-indigo-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                {progress.label}
              </span>
              <span className="font-mono text-emerald-400 font-bold">
                Stage {progress.stage} / {progress.totalStages}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-emerald-400 to-teal-300 transition-all duration-500"
                style={{ width: `${Math.round((progress.stage / progress.totalStages) * 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              {[
                { s: 1, t: 'گام ۱: نقشه راه و طرح اجرایی' },
                { s: 2, t: 'گام ۲: مستند معماری و مشخصات فنی' },
                { s: 3, t: 'گام ۳: کد اجرایی، تست و راهنمای تحویل' },
              ].map((step) => (
                <div
                  key={step.s}
                  className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                    progress.stage > step.s
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : progress.stage === step.s
                        ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-200 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {progress.stage > step.s ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                  )}
                  <span className="truncate">{step.t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {aiAvailable === false && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between gap-3">
            <span>برای فعال‌سازی موتور معماری و تحویل، کلید API خود را از نوار بالا ثبت یا انتخاب کنید.</span>
            <button
              onClick={onOpenSettings}
              className="px-3 py-1.5 bg-amber-500 text-slate-950 font-bold rounded-lg shrink-0"
            >
              مدیریت کلیدها
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Export Suite & Deliverable Workspace */}
      {fileNames.length > 0 && (
        <>
          {/* One-Tap Client Export Toolbar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">
                خروجی‌های رسمی آماده ارسال به کارفرما ({fileNames.length.toLocaleString('fa-IR')} فایل مهندسی در پکیج)
              </h3>
              <p className="text-[11px] text-slate-400">
                پکیج ZIP شامل تمامی کدها و مستندات است؛ سند رسمی کارفرما دارای صفحه‌آرایی چاپی فارسی و جداول استاندارد است
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadFullZip}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md transition-all"
              >
                <Archive className="w-4 h-4" />
                <span>دانلود پکیج کامل ZIP</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExecutiveHtmlReport}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-md transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>سند رسمی کارفرما (HTML / چاپ PDF)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadWordDoc}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow-md transition-all"
              >
                <FileText className="w-4 h-4" />
                <span>خروجی Word (.doc)</span>
              </button>

              {onOpenGitHubPush && (
                <button
                  type="button"
                  onClick={() => onOpenGitHubPush(job, files)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold rounded-xl text-xs transition-all"
                >
                  <span>انتشار مخزن GitHub</span>
                </button>
              )}

              {files['00-Executive-Pitch-and-Roadmap.md'] && (
                <button
                  type="button"
                  onClick={() => handleCopyText('pitch', files['00-Executive-Pitch-and-Roadmap.md'])}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-medium transition-all"
                >
                  {copiedKey === 'pitch' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'pitch' ? 'کپی شد!' : 'کپی نقشه راه کارفرما'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Main IDE + Rich Document Studio */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* File Explorer Sidebar */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col max-h-[680px]">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-200 font-bold text-xs">
                  <FolderOpen className="w-4 h-4 text-emerald-400" />
                  <span>درخت فایل‌های تحویلی پروژه</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewFileInput((v) => !v)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> فایل جدید
                </button>
              </div>

              {showNewFileInput && (
                <form onSubmit={handleAddManualFile} className="mb-3 flex gap-1.5">
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    placeholder="src/helper.py یا notes.md"
                    dir="ltr"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                  >
                    ایجاد
                  </button>
                </form>
              )}

              <div className="space-y-1.5 overflow-y-auto flex-1 pr-0.5">
                {fileNames.map((fname) => {
                  const active = activeFile === fname;
                  const sizeKb = Math.max(0.2, fname ? files[fname].length / 1024 : 0).toFixed(1);
                  const isDoc = fname.endsWith('.md');
                  return (
                    <button
                      key={fname}
                      type="button"
                      onClick={() => {
                        setSelectedFile(fname);
                        setViewMode(fname.endsWith('.md') ? 'rendered' : 'editor');
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-mono transition-all ${
                        active
                          ? 'bg-emerald-500/15 border border-emerald-500/45 text-emerald-300 font-bold'
                          : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0" dir="ltr">
                        {isDoc ? (
                          <FileText className="w-4 h-4 shrink-0 text-amber-400" />
                        ) : (
                          <FileCode2 className="w-4 h-4 shrink-0 text-sky-400" />
                        )}
                        <span className="truncate">{fname}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0" dir="ltr">
                        {sizeKb} KB
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active File Viewer / Editor + AI Refiner */}
            <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              {/* Toolbar */}
              <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-emerald-400" dir="ltr">
                  {activeFile}
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {isMarkdownFile && (
                    <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setViewMode('rendered')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${
                          viewMode === 'rendered'
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" /> نمای مستند رسمی
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('editor')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors ${
                          viewMode === 'editor'
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" /> ویرایش متن خام
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopyText('file', activeContent)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg"
                  >
                    {copiedKey === 'file' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedKey === 'file' ? 'کپی شد' : 'کپی فایل'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadSingleFile}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>دانلود تکی</span>
                  </button>
                </div>
              </div>

              {/* Body */}
              {isMarkdownFile && viewMode === 'rendered' ? (
                <div
                  dir="rtl"
                  className="p-6 sm:p-8 overflow-y-auto max-h-[540px] bg-white text-slate-900 prose max-w-none leading-8"
                  dangerouslySetInnerHTML={{ __html: renderMarkdownToRichHtml(activeContent) }}
                />
              ) : (
                <textarea
                  value={activeContent}
                  onChange={(e) => handleDirectContentEdit(e.target.value)}
                  dir={isMarkdownFile ? 'auto' : 'ltr'}
                  spellCheck={false}
                  className="w-full min-h-[460px] max-h-[540px] p-5 bg-slate-950 text-slate-200 text-xs sm:text-sm font-mono leading-relaxed focus:outline-none resize-y"
                />
              )}

              {/* Iterative Single-File AI Refiner Footer */}
              <form
                onSubmit={handleRefineCurrentFile}
                className="p-3.5 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  placeholder={`دستور تکمیل یا بازنگری هوشمند فایل «${activeFile}» (مثلاً: افزودن تست‌های مرزی، دیاگرام جزئی‌تر، ترجمه دو‌زبانه...)`}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!refinePrompt.trim() || isRefining}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold rounded-xl text-xs shrink-0"
                >
                  {isRefining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  <span>{isRefining ? 'در حال ارتقای فایل...' : 'تکمیل و ارتقای همین فایل با AI'}</span>
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
