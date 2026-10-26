import React, { useEffect, useState } from 'react';
import { FileCode2, FolderOpen, Download, Copy, Check, Sparkles, FileText, Printer, Archive, Wand2, Eye, Edit3, Plus, CheckCircle2, Loader2, Layers, Award, ShieldCheck, ChevronDown, ChevronUp, X, Zap } from 'lucide-react';
import { DeliverableBlueprintMode, FreelanceJob } from '../types';
import { BLUEPRINT_MODES, DeliveryProgressState, buildExecutiveClientDocumentHtml, detectOptimalBlueprintMode, generateEnterpriseDeliverablePackage, refineSingleDeliverableFile, renderMarkdownToRichHtml } from '../services/deliveryEngine';
import { runArbiterQualityGate } from '../services/arbiterEngine';
import { createZipBlob } from '../utils/zipBuilder';
import { safeCopyText } from '../utils/safeClipboard';
import { downloadBlob } from '../utils/safeDownload';
import { BrutalCollapsible } from './brutalist/Collapsible';

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

function defaultMode(): DeliverableBlueprintMode { return 'software_mvp'; }

export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({ job, onUpdateJob, onUpdateJobFiles, onOpenGitHubPush, aiAvailable, onOpenSettings }) => {
  const [mode, setMode] = useState<DeliverableBlueprintMode>('software_mvp');
  const [architectBrief, setArchitectBrief] = useState('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [viewMode, setViewMode] = useState<'rendered' | 'editor'>('rendered');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<DeliveryProgressState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [arbiterScore, setArbiterScore] = useState<number | null>(null);
  const [fileListCollapsed, setFileListCollapsed] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(false);

  useEffect(()=>{
    if (!job) return;
    setMode(job.blueprintMode && job.blueprintMode!=='auto' ? job.blueprintMode : detectOptimalBlueprintMode(job) || defaultMode());
    const merged = job.solutionCode || job.generatedFiles || {};
    const keys = Object.keys(merged);
    if (keys.length>0) { setSelectedFile(prev=> prev && merged[prev] ? prev : keys[0]); setViewMode(keys[0].endsWith('.md')?'rendered':'editor'); } else setSelectedFile('');
    setErrorMessage(null);
  }, [job?.id]);

  if (!job) {
    return (
      <div className="max-w-[900px] mx-auto brutal-panel p-8 text-center bg-white">
        <div className="w-16 h-16 mx-auto bg-[#0a0a0a] border-[2.5px] border-black flex items-center justify-center mb-4 text-[#FFDE03]"><Award className="w-8 h-8" /></div>
        <h3 className="text-[18px] font-black uppercase tracking-tight">استودیو معماری و پکیج تحویل</h3>
        <p className="text-[12px] font-medium text-[#555] mt-2 leading-6 max-w-[640px] mx-auto">یک پروژه از رادار انتخاب کنید تا موتور ۳ مرحله‌ای معماری، مستندات فنی و فایل‌های تحویلی را تولید کند. همه چیز brutally organized و collapsible است.</p>
      </div>
    );
  }

  const files = job.solutionCode || job.generatedFiles || {};
  const fileNames = Object.keys(files).sort();
  const activeFile = selectedFile && files[selectedFile]!==undefined ? selectedFile : fileNames[0] || '';
  const activeContent = activeFile ? files[activeFile] || '' : '';
  const isMarkdown = activeFile.toLowerCase().endsWith('.md');

  const commit = (next: Record<string,string>, extra?: Partial<FreelanceJob>)=>{
    const updated: FreelanceJob = { ...job, ...extra, solutionCode: next, generatedFiles: next };
    onUpdateJob?.(updated); onUpdateJobFiles?.(job.id, next);
  };

  const handleGenerate = async ()=>{
    setIsGenerating(true); setErrorMessage(null); setProgress({ stage:1, totalStages:3, label:'آماده‌سازی موتور ۳ مرحله‌ای...' });
    try{
      const result = await generateEnterpriseDeliverablePackage(job, { mode, customBrief: architectBrief, onProgress: p=>setProgress(p), partialFilesCallback: pf=>{ const keys=Object.keys(pf); if(keys.length){ commit({ ...files, ...pf }, { blueprintMode: mode }); setSelectedFile(c=>c||keys[0]); }} });
      const finalKeys = Object.keys(result.files).sort();
      commit(result.files, { status:'in_progress', blueprintMode: result.resolvedMode, executiveSummary: result.files['00-Executive-Pitch-and-Roadmap.md']||'' });
      if(finalKeys.length){ setSelectedFile(finalKeys[0]); setViewMode(finalKeys[0].endsWith('.md')?'rendered':'editor'); }
      setProgress(null);
    }catch(err:any){ setErrorMessage(err?.message||'خطا در تولید پکیج'); setProgress(null); } finally{ setIsGenerating(false); }
  };

  const handleAudit = async ()=>{
    if(!fileNames.length||isAuditing||isGenerating) return;
    setIsAuditing(true); setErrorMessage(null); setProgress({ stage:1, totalStages:1, label:'ممیزی ARBITER v2.2...' });
    try{
      const audit = await runArbiterQualityGate({ job, files, onProgress: msg=>setProgress({ stage:1, totalStages:1, label:msg }) });
      setArbiterScore(audit.overallScore); commit(audit.remediatedFiles, { status:'in_progress', blueprintMode: mode, executiveSummary: audit.remediatedFiles['00-Executive-Pitch-and-Roadmap.md']||'' }); setSelectedFile('00-Arbiter-Quality-Audit.md'); setViewMode('rendered'); setProgress(null);
    }catch(err:any){ setErrorMessage(err?.message||'خطا در ممیزی'); setProgress(null); } finally{ setIsAuditing(false); }
  };

  const handleRefine = async (e:React.FormEvent)=>{
    e.preventDefault(); if(!activeFile||!refinePrompt.trim()||isRefining) return;
    setIsRefining(true); setErrorMessage(null);
    try{
      const res = await refineSingleDeliverableFile({ job, fileName: activeFile, currentContent: activeContent, instruction: refinePrompt.trim() });
      commit({ ...files, [activeFile]: res.updatedContent }); setRefinePrompt('');
    }catch(err:any){ setErrorMessage(err?.message||'خطا در ارتقا'); } finally{ setIsRefining(false); }
  };
  const handleEdit = (t:string)=>{ if(!activeFile) return; commit({ ...files, [activeFile]: t }); };
  const handleAddFile = (e:React.FormEvent)=>{
    e.preventDefault(); const clean=newFileName.trim(); if(!clean) return;
    commit({ ...files, [clean]: clean.endsWith('.md')?`# ${clean}\n\n`:'' }); setSelectedFile(clean); setViewMode('editor'); setNewFileName(''); setShowNewFileInput(false);
  };
  const trigger = (blob:Blob, name:string)=> downloadBlob(blob,name);
  const slug = job.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)||'deliverable';
  const handleZip = ()=>{ if(!fileNames.length) return; trigger(createZipBlob(files), `KonkLancer-Deliverable-${slug}.zip`); };
  const handleHtml = ()=>{ if(!fileNames.length) return; trigger(new Blob([buildExecutiveClientDocumentHtml(job, files)],{type:'text/html'}),`Executive-Dossier-${slug}.html`); };
  const handleDoc = ()=>{ if(!fileNames.length) return; trigger(new Blob([`\ufeff${buildExecutiveClientDocumentHtml(job, files)}`],{type:'application/msword'}),`Spec-${slug}.doc`); };
  const handleSingle = ()=>{ if(!activeFile) return; trigger(new Blob([activeContent],{type:'text/plain'}), activeFile.split('/').pop()||activeFile); };
  const handleCopy = async (k:string, t:string)=>{ const ok=await safeCopyText(t); setCopiedKey(ok?k:null); setTimeout(()=>setCopiedKey(null),2000); };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* Top control - collapsible */}
      <BrutalCollapsible title={`استودیو: ${job.title.slice(0,60)}`} icon={Layers} variant="ink" defaultOpen={true} storageKey="studio-top">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="brutal-badge brutal-badge--accent">{job.platform} ● {job.category}</span>
            <span className="brutal-badge brutal-badge--ink font-mono">{job.budgetFormatted}</span>
            <span className="ml-auto flex items-center gap-2">
              <button onClick={handleGenerate} disabled={isGenerating||isAuditing} className="brutal-btn brutal-btn--primary">
                {isGenerating? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {isGenerating?'در حال تولید ۳ مرحله‌ای...': fileNames.length>0?'بازتولید کامل (۳ فاز)':'تولید معماری و فایل‌ها'}
              </button>
              {fileNames.length>0 && <button onClick={handleAudit} disabled={isGenerating||isAuditing} className="brutal-btn bg-[#FFDE03] border-black">
                {isAuditing? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} ممیزی ARBITER {arbiterScore!==null && <span className="px-1.5 py-0.5 bg-black text-white font-mono text-[11px]">{arbiterScore}/100</span>}
              </button>}
            </span>
          </div>

          {/* Blueprint selector collapsible */}
          <div className="border-[2.5px] border-black">
            <button onClick={()=>setBriefCollapsed(!briefCollapsed)} className="w-full flex items-center justify-between px-3 py-2 bg-[#FFFBF0] border-b-[2.5px] border-black font-black text-[11px] uppercase tracking-widest">
              <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> الگوی مهندسی و خروجی تحویلی</span>
              {briefCollapsed? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {!briefCollapsed && (
              <div className="p-3 space-y-3 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {BLUEPRINT_MODES.map(bm=>{
                    const sel = mode===bm.id;
                    return (
                      <button key={bm.id} onClick={()=>setMode(bm.id)} className={`text-right p-3 border-[2.5px] border-black text-[12px] font-bold leading-tight ${sel?'bg-black text-white shadow-[2px_2px_0px_0px_#000]':'bg-white hover:bg-[#FFDE03]'}`}>
                        ✦ {bm.label}
                        <span className={`block text-[10px] font-medium mt-1 ${sel?'text-white/70':'text-black/60'}`}>{bm.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="field-group">
                  <label className="field-group__label">دستور اختصاصی برای معمار ارشد (اختیاری)</label>
                  <textarea rows={2} value={architectBrief} onChange={e=>setArchitectBrief(e.target.value)} placeholder="استک Python 3.11 + FastAPI + SQLite، لاگ کامل، تست pytest..." className="brutal-input !border-0 !shadow-none min-h-[60px] text-[12px]" />
                </div>
              </div>
            )}
          </div>

          {isGenerating && progress && (
            <div className="p-3 bg-black text-white border-[2.5px] border-black space-y-2">
              <div className="flex items-center justify-between text-[11px] font-black uppercase"><span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-[#FFDE03]" /> {progress.label}</span><span className="font-mono bg-[#FFDE03] text-black px-2 py-1 border border-white">Stage {progress.stage}/{progress.totalStages}</span></div>
              <div className="h-2 bg-white border-[2px] border-white overflow-hidden"><div className="h-full bg-[#FFDE03] transition-all" style={{ width: `${Math.round((progress.stage/progress.totalStages)*100)}%` }} /></div>
            </div>
          )}
          {aiAvailable===false && <div className="p-3 bg-[#FFDE03] border-[2.5px] border-black flex items-center justify-between text-[12px] font-bold"><span>کلید API تنظیم نشده است.</span><button onClick={onOpenSettings} className="brutal-btn brutal-btn--ink brutal-btn--sm">مدیریت کلیدها</button></div>}
          {errorMessage && <div className="p-3 bg-[#FF3B30] text-white border-[2.5px] border-black font-bold text-[12px]">{errorMessage}</div>}
        </div>
      </BrutalCollapsible>

      {fileNames.length>0 && (
        <>
          <BrutalCollapsible title={`خروجی‌های رسمی (${fileNames.length} فایل)`} icon={Archive} variant="accent" defaultOpen={true} storageKey="studio-exports">
            <div className="flex flex-wrap gap-2">
              <button onClick={handleZip} className="brutal-btn brutal-btn--ink"><Archive className="w-4 h-4" /> ZIP کامل</button>
              <button onClick={handleHtml} className="brutal-btn bg-[#0066FF] text-white border-black"><Printer className="w-4 h-4" /> HTML / PDF</button>
              <button onClick={handleDoc} className="brutal-btn bg-white"><FileText className="w-4 h-4" /> Word .doc</button>
              {onOpenGitHubPush && <button onClick={()=>onOpenGitHubPush(job, files)} className="brutal-btn brutal-btn--ghost border-[2px]">انتشار GitHub</button>}
              {files['00-Executive-Pitch-and-Roadmap.md'] && <button onClick={()=>handleCopy('pitch', files['00-Executive-Pitch-and-Roadmap.md'])} className="brutal-btn">{copiedKey==='pitch'?<Check className="w-4 h-4" />:<Copy className="w-4 h-4" />} {copiedKey==='pitch'?'کپی شد':'کپی نقشه راه'}</button>}
            </div>
          </BrutalCollapsible>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* file explorer */}
            <div className="lg:col-span-4 brutal-panel">
              <div className="brutal-header">
                <span className="flex items-center gap-2"><FolderOpen className="w-4 h-4" /> فایل‌های تحویلی</span>
                <div className="flex items-center gap-1">
                  <button onClick={()=>setFileListCollapsed(!fileListCollapsed)} className="w-7 h-7 bg-white border-[2px] border-black flex items-center justify-center">{fileListCollapsed? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}</button>
                  <button onClick={()=>setShowNewFileInput(!showNewFileInput)} className="px-2 py-1 bg-[#FFDE03] border-[2px] border-black text-[11px] font-black flex items-center gap-1"><Plus className="w-3 h-3" /> فایل جدید</button>
                </div>
              </div>
              {!fileListCollapsed && (
                <div className="p-2 bg-[#FFFBF0] max-h-[600px] overflow-y-auto brutal-scroll space-y-1">
                  {showNewFileInput && (
                    <form onSubmit={handleAddFile} className="flex gap-1 mb-2">
                      <input value={newFileName} onChange={e=>setNewFileName(e.target.value)} placeholder="src/helper.py" dir="ltr" className="flex-1 brutal-input !h-[34px] font-mono text-[12px]" />
                      <button type="submit" className="px-3 bg-black text-white border-[2px] border-black font-black text-[11px]">ایجاد</button>
                    </form>
                  )}
                  {fileNames.map(fname=>{
                    const active = activeFile===fname; const size = Math.max(0.2, files[fname].length/1024).toFixed(1); const isDoc = fname.endsWith('.md');
                    return (
                      <button key={fname} onClick={()=>{setSelectedFile(fname); setViewMode(fname.endsWith('.md')?'rendered':'editor');}} className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 border-[2px] text-[12px] font-mono text-left ${active?'bg-black text-white border-black shadow-[2px_2px_0px_0px_#000]':'bg-white border-black hover:bg-[#FFDE03]'}`} dir="ltr">
                        <span className="flex items-center gap-2 truncate">{isDoc? <FileText className="w-4 h-4 shrink-0" /> : <FileCode2 className="w-4 h-4 shrink-0" />}<span className="truncate">{fname}</span></span>
                        <span className="text-[10px] opacity-60 shrink-0">{size} KB</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* editor */}
            <div className="lg:col-span-8 brutal-panel flex flex-col overflow-hidden">
              <div className="brutal-header bg-[#FFDE03] gap-2">
                <span className="font-mono font-black truncate text-[12px]" dir="ltr">{activeFile}</span>
                <div className="flex items-center gap-1 ml-auto">
                  {isMarkdown && (
                    <div className="flex border-[2px] border-black overflow-hidden">
                      <button onClick={()=>setViewMode('rendered')} className={`px-2.5 py-1 text-[11px] font-black flex items-center gap-1 ${viewMode==='rendered'?'bg-black text-white':'bg-white'}`}><Eye className="w-3.5 h-3.5" /> مستند</button>
                      <button onClick={()=>setViewMode('editor')} className={`px-2.5 py-1 text-[11px] font-black flex items-center gap-1 ${viewMode==='editor'?'bg-black text-white':'bg-white'}`}><Edit3 className="w-3.5 h-3.5" /> خام</button>
                    </div>
                  )}
                  <button onClick={()=>handleCopy('file', activeContent)} className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-bold flex items-center gap-1">{copiedKey==='file'?<Check className="w-3 h-3" />:<Copy className="w-3 h-3" />} {copiedKey==='file'?'کپی شد':'کپی'}</button>
                  <button onClick={handleSingle} className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-bold flex items-center gap-1"><Download className="w-3 h-3" /> دانلود</button>
                </div>
              </div>

              {isMarkdown && viewMode==='rendered' ? (
                <div dir="rtl" className="p-6 overflow-y-auto max-h-[500px] bg-white prose max-w-none leading-8 brutal-scroll" dangerouslySetInnerHTML={{ __html: renderMarkdownToRichHtml(activeContent) }} />
              ) : (
                <textarea value={activeContent} onChange={e=>handleEdit(e.target.value)} dir={isMarkdown?'auto':'ltr'} spellCheck={false} className="w-full min-h-[460px] max-h-[520px] p-4 bg-[#0a0a0a] text-[#F5F5F0] font-mono text-[12.5px] leading-6 focus:outline-none" />
              )}

              <form onSubmit={handleRefine} className="p-2 bg-[#FFFBF0] border-t-[2.5px] border-black flex gap-2">
                <input value={refinePrompt} onChange={e=>setRefinePrompt(e.target.value)} placeholder={`دستور ارتقای «${activeFile}»...`} className="flex-1 brutal-input !h-[38px] text-[12px]" />
                <button type="submit" disabled={!refinePrompt.trim()||isRefining} className="brutal-btn brutal-btn--ink brutal-btn--sm shrink-0">
                  {isRefining? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} ارتقا
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
