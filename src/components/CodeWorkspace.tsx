import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Download, Copy, Check, Sparkles, FileText, Printer, Archive, Wand2, Eye, Edit3, Plus, Loader2, Layers, Award, ShieldCheck, ChevronDown, ChevronUp, X, Zap, Search, Save, CornerDownLeft } from 'lucide-react';
import { DeliverableBlueprintMode, FreelanceJob } from '../types';
import { BLUEPRINT_MODES, DeliveryProgressState, buildExecutiveClientDocumentHtml, detectOptimalBlueprintMode, generateEnterpriseDeliverablePackage, refineSingleDeliverableFile } from '../services/deliveryEngine';
import { runArbiterQualityGate } from '../services/arbiterEngine';
import { createZipBlob } from '../utils/zipBuilder';
import { safeCopyText } from '../utils/safeClipboard';
import { downloadBlob } from '../utils/safeDownload';
import { BrutalCollapsible } from './brutalist/Collapsible';
import { FileTree } from './workspace/FileTree';
import { CodeEditor } from './workspace/CodeEditor';
import { MarkdownView } from './workspace/MarkdownView';
import { PromptDialog } from './workspace/PromptDialog';
import { buildFileTree, isValidFilePath, renameFileKey, searchInFiles, uniquePath, LANGUAGE_LABEL, languageOf } from './workspace/fileTree';

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
  const [newFileFolder, setNewFileFolder] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [arbiterScore, setArbiterScore] = useState<number | null>(null);
  const [fileListCollapsed, setFileListCollapsed] = useState(false);
  const [briefCollapsed, setBriefCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [revealLine, setRevealLine] = useState<number | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 });
  const [savedFlash, setSavedFlash] = useState(false);
  const [editedPaths, setEditedPaths] = useState<Set<string>>(() => new Set());

  useEffect(()=>{
    if (!job) return;
    setMode(job.blueprintMode && job.blueprintMode!=='auto' ? job.blueprintMode : detectOptimalBlueprintMode(job) || defaultMode());
    const merged = job.solutionCode || job.generatedFiles || {};
    const keys = Object.keys(merged);
    if (keys.length>0) { setSelectedFile(prev=> prev && merged[prev] ? prev : keys[0]); setViewMode(keys[0].endsWith('.md')?'rendered':'editor'); } else setSelectedFile('');
    setErrorMessage(null);
    setEditedPaths(new Set());
    setRenameTarget(null); setDeleteTarget(null); setNewFileFolder(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  const files = useMemo(() => job?.solutionCode || job?.generatedFiles || {}, [job?.solutionCode, job?.generatedFiles]);
  const fileNames = useMemo(() => Object.keys(files).sort(), [files]);
  const tree = useMemo(() => buildFileTree(files), [files]);
  const searchHits = useMemo(() => searchInFiles(files, searchQuery), [files, searchQuery]);
  const totalMatches = useMemo(() => searchHits.reduce((sum, hit) => sum + hit.matches.length, 0), [searchHits]);

  const activeFile = selectedFile && files[selectedFile] !== undefined ? selectedFile : fileNames[0] || '';
  const activeContent = activeFile ? files[activeFile] || '' : '';
  const isMarkdown = activeFile.toLowerCase().endsWith('.md');

  const commit = (next: Record<string,string>, extra?: Partial<FreelanceJob>)=>{
    if (!job) return;
    const updated: FreelanceJob = { ...job, ...extra, solutionCode: next, generatedFiles: next };
    onUpdateJob?.(updated); onUpdateJobFiles?.(job.id, next);
  };

  if (!job) {
    return (
      <div className="max-w-[900px] mx-auto brutal-panel p-8 text-center bg-white">
        <div className="w-16 h-16 mx-auto bg-[#0a0a0a] border-[2.5px] border-black flex items-center justify-center mb-4 text-[#FFDE03]"><Award className="w-8 h-8" /></div>
        <h3 className="text-[18px] font-black uppercase tracking-tight">استودیو معماری و پکیج تحویل</h3>
        <p className="text-[12px] font-medium text-[#555] mt-2 leading-6 max-w-[640px] mx-auto">یک پروژه از رادار انتخاب کنید تا موتور ۳ مرحله‌ای معماری، مستندات فنی و فایل‌های تحویلی را تولید کند. همه چیز brutally organized و collapsible است.</p>
      </div>
    );
  }

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

  const handleEdit = (text:string)=>{
    if(!activeFile) return;
    commit({ ...files, [activeFile]: text });
    setEditedPaths(prev => {
      if (prev.has(activeFile)) return prev;
      const next = new Set(prev); next.add(activeFile); return next;
    });
  };

  const handleSave = ()=>{
    if (!activeFile) return;
    commit({ ...files });
    setSavedFlash(true);
    window.setTimeout(()=> setSavedFlash(false), 1500);
  };

  const openFile = (path:string, line?:number)=>{
    setSelectedFile(path);
    setViewMode(path.toLowerCase().endsWith('.md') ? (line ? 'editor' : 'rendered') : 'editor');
    setRevealLine(line ?? null);
  };

  /** ایجاد فایل جدید در پوشه‌ی مشخص (از دکمه‌ی + روی پوشه یا دکمه‌ی هدر). */
  const startNewFile = (folder:string)=>{ setNewFileFolder(folder); setNewFileName(''); setRenameTarget(null); setDeleteTarget(null); };

  const handleAddFile = (e:React.FormEvent)=>{
    e.preventDefault();
    const folder = newFileFolder ?? '';
    const raw = newFileName.trim();
    if (!raw) return;
    const path = raw.includes('/') ? raw : `${folder ? `${folder}/` : ''}${raw}`;
    if (!isValidFilePath(path)) { setErrorMessage(`مسیر «${path}» معتبر نیست. مسیر نسبی و بدون ../ بنویسید.`); return; }
    if (files[path] !== undefined) { setErrorMessage(`فایل «${path}» از قبل وجود دارد.`); return; }
    setErrorMessage(null);
    commit({ ...files, [path]: path.toLowerCase().endsWith('.md') ? `# ${path.split('/').pop()}\n\n` : '' });
    setSelectedFile(path); setViewMode(path.toLowerCase().endsWith('.md') ? 'rendered' : 'editor');
    setNewFileFolder(null); setNewFileName('');
  };

  const quickAddFile = (folder:string)=>{
    const path = uniquePath(files, folder);
    commit({ ...files, [path]: path.toLowerCase().endsWith('.md') ? `# ${path.split('/').pop()}\n\n` : '' });
    setSelectedFile(path); setViewMode('editor');
  };

  const startRename = (path:string)=>{ setRenameTarget(path); setRenameValue(path); setDeleteTarget(null); setNewFileFolder(null); };

  const handleRename = (e:React.FormEvent)=>{
    e.preventDefault();
    if (!renameTarget) return;
    const next = renameValue.trim().replace(/\\/g,'/');
    if (!next || next === renameTarget) { setRenameTarget(null); return; }
    if (!isValidFilePath(next)) { setErrorMessage(`مسیر «${next}» معتبر نیست.`); return; }
    if (files[next] !== undefined) { setErrorMessage(`فایل «${next}» از قبل وجود دارد.`); return; }
    setErrorMessage(null);
    commit(renameFileKey(files, renameTarget, next));
    if (selectedFile === renameTarget) setSelectedFile(next);
    setRenameTarget(null);
  };

  const handleDelete = (path:string)=> setDeleteTarget(path);
  const confirmDelete = ()=>{
    if (!deleteTarget) return;
    const next = { ...files };
    delete next[deleteTarget];
    commit(next);
    if (selectedFile === deleteTarget) setSelectedFile(Object.keys(next).sort()[0] || '');
    setDeleteTarget(null);
  };

  const trigger = (blob:Blob, name:string)=> downloadBlob(blob,name);
  const slug = job.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)||'deliverable';
  const handleZip = ()=>{ if(!fileNames.length) return; trigger(createZipBlob(files), `KonkLancer-Deliverable-${slug}.zip`); };
  const handleHtml = ()=>{ if(!fileNames.length) return; trigger(new Blob([buildExecutiveClientDocumentHtml(job, files)],{type:'text/html'}),`Executive-Dossier-${slug}.html`); };
  const handleDoc = ()=>{ if(!fileNames.length) return; trigger(new Blob([`\ufeff${buildExecutiveClientDocumentHtml(job, files)}`],{type:'application/msword'}),`Spec-${slug}.doc`); };
  const handleSingle = ()=>{ if(!activeFile) return; trigger(new Blob([activeContent],{type:'text/plain'}), activeFile.split('/').pop()||activeFile); };
  const handleCopy = async (k:string, t:string)=>{ const ok=await safeCopyText(t); setCopiedKey(ok?k:null); setTimeout(()=>setCopiedKey(null),2000); };

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto">
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
          {aiAvailable===false && <div className="p-3 bg-[#FFDE03] border-[2.5px] border-black flex items-center justify-between gap-3 text-[12px] font-bold"><span>اتصال هوش مصنوعی آماده نیست؛ توکن رله و دسترسی درگاه را بررسی کنید.</span><button onClick={onOpenSettings} className="brutal-btn brutal-btn--ink brutal-btn--sm shrink-0">تنظیم اتصال</button></div>}
          {errorMessage && <div className="p-3 bg-[#FF3B30] text-white border-[2.5px] border-black font-bold text-[12px] flex items-start justify-between gap-3"><span>{errorMessage}</span><button onClick={()=>setErrorMessage(null)} aria-label="بستن خطا" className="shrink-0"><X className="w-4 h-4" /></button></div>}
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
            {/* ── file explorer (tree + project search) ── */}
            <div className="lg:col-span-3 brutal-panel">
              <div className="brutal-header">
                <span className="flex items-center gap-2"><FolderOpen className="w-4 h-4" /> فایل‌ها <span className="font-mono text-[10px] opacity-70">{fileNames.length}</span></span>
                <div className="flex items-center gap-1">
                  <button onClick={()=>{ setSearchOpen(v=>!v); if (searchOpen) setSearchQuery(''); }} aria-label="جست‌وجو در پروژه" aria-pressed={searchOpen} className={`w-7 h-7 border-[2px] border-black flex items-center justify-center ${searchOpen?'bg-black text-[#FFDE03]':'bg-white'}`}><Search className="w-3.5 h-3.5" /></button>
                  <button onClick={()=>startNewFile('')} aria-label="فایل جدید" className="w-7 h-7 bg-[#FFDE03] border-[2px] border-black flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                  <button onClick={()=>setFileListCollapsed(!fileListCollapsed)} aria-label={fileListCollapsed?'باز کردن لیست فایل‌ها':'بستن لیست فایل‌ها'} className="w-7 h-7 bg-white border-[2px] border-black flex items-center justify-center">{fileListCollapsed? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}</button>
                </div>
              </div>

              {!fileListCollapsed && (
                <div className="bg-[#FFFBF0]">
                  {searchOpen && (
                    <div className="p-2 border-b-[2px] border-black space-y-2">
                      <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="جست‌وجو در همه‌ی فایل‌ها..." dir="auto" aria-label="عبارت جست‌وجو" className="brutal-input !h-[32px] text-[12px] w-full" />
                      {searchQuery.trim().length>0 && searchQuery.trim().length<2 && <div className="text-[10px] font-bold text-[#555]">حداقل ۲ نویسه وارد کنید.</div>}
                      {searchQuery.trim().length>=2 && (
                        <div className="text-[10px] font-black uppercase text-[#555]">{totalMatches} نتیجه در {searchHits.length} فایل</div>
                      )}
                      {searchHits.length>0 && (
                        <div className="max-h-[240px] overflow-y-auto brutal-scroll space-y-1" data-testid="project-search-results">
                          {searchHits.map(hit=>(
                            <div key={hit.path} className="border-[2px] border-black bg-white">
                              <div className="px-2 py-1 bg-[#E8E6E0] border-b-[2px] border-black font-mono text-[10px] font-black truncate" dir="ltr" title={hit.path}>{hit.path}</div>
                              {hit.matches.slice(0,6).map(m=>(
                                <button key={`${hit.path}:${m.line}:${m.column}`} onClick={()=>openFile(hit.path, m.line)} className="w-full flex items-start gap-2 px-2 py-1 text-left hover:bg-[#FFDE03] border-b border-[#0a0a0a]/10 last:border-b-0">
                                  <span className="font-mono text-[10px] font-black text-[#0066FF] shrink-0 w-7 text-right" dir="ltr">{m.line}</span>
                                  <span className="font-mono text-[10.5px] truncate" dir="ltr">{m.text}</span>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                      {searchQuery.trim().length>=2 && searchHits.length===0 && <div className="text-[11px] font-bold text-[#555] py-2 text-center">چیزی پیدا نشد.</div>}
                    </div>
                  )}

                  {newFileFolder !== null && (
                    <form onSubmit={handleAddFile} className="p-2 border-b-[2px] border-black space-y-1 bg-[#FFDE03]">
                      <div className="text-[10px] font-black uppercase">فایل جدید {newFileFolder ? `در ${newFileFolder}/` : 'در ریشه'}</div>
                      <div className="flex gap-1">
                        <input autoFocus value={newFileName} onChange={e=>setNewFileName(e.target.value)} placeholder="helper.py" dir="ltr" aria-label="نام فایل جدید" className="flex-1 brutal-input !h-[30px] font-mono text-[12px]" />
                        <button type="submit" aria-label="ایجاد فایل" className="px-2 bg-black text-white border-[2px] border-black font-black text-[11px] flex items-center"><CornerDownLeft className="w-3 h-3" /></button>
                        <button type="button" onClick={()=>setNewFileFolder(null)} aria-label="لغو فایل جدید" className="px-2 bg-white border-[2px] border-black"><X className="w-3 h-3" /></button>
                      </div>
                    </form>
                  )}

                  {renameTarget !== null && (
                    <form onSubmit={handleRename} className="p-2 border-b-[2px] border-black space-y-1 bg-[#0066FF]">
                      <div className="text-[10px] font-black uppercase text-white">تغییر نام {renameTarget}</div>
                      <div className="flex gap-1">
                        <input autoFocus value={renameValue} onChange={e=>setRenameValue(e.target.value)} dir="ltr" aria-label="مسیر جدید فایل" className="flex-1 brutal-input !h-[30px] font-mono text-[12px]" />
                        <button type="submit" aria-label="تأیید تغییر نام" className="px-2 bg-black text-white border-[2px] border-black flex items-center"><Check className="w-3 h-3" /></button>
                        <button type="button" onClick={()=>setRenameTarget(null)} aria-label="لغو تغییر نام" className="px-2 bg-white border-[2px] border-black"><X className="w-3 h-3" /></button>
                      </div>
                    </form>
                  )}

                  <div className="p-2 max-h-[600px] overflow-y-auto brutal-scroll">
                    <FileTree
                      nodes={tree}
                      activePath={activeFile || null}
                      dirtyPaths={editedPaths}
                      onOpen={openFile}
                      onRename={startRename}
                      onDelete={handleDelete}
                      onNewFile={startNewFile}
                      forceExpanded={searchOpen && searchQuery.trim().length>=2}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── editor ── */}
            <div className="lg:col-span-9 brutal-panel flex flex-col overflow-hidden">
              <div className="brutal-header bg-[#FFDE03] gap-2">
                <span className="font-mono font-black truncate text-[12px]" dir="ltr">{activeFile}</span>
                <span className="hidden sm:inline px-1.5 py-0.5 border-[2px] border-black text-[9px] font-black uppercase bg-white shrink-0">{LANGUAGE_LABEL[languageOf(activeFile)]}</span>
                <div className="flex items-center gap-1 ml-auto">
                  {isMarkdown && (
                    <div className="flex border-[2px] border-black overflow-hidden">
                      <button onClick={()=>setViewMode('rendered')} aria-pressed={viewMode==='rendered'} className={`px-2.5 py-1 text-[11px] font-black flex items-center gap-1 ${viewMode==='rendered'?'bg-black text-white':'bg-white'}`}><Eye className="w-3.5 h-3.5" /> مستند</button>
                      <button onClick={()=>setViewMode('editor')} aria-pressed={viewMode==='editor'} className={`px-2.5 py-1 text-[11px] font-black flex items-center gap-1 ${viewMode==='editor'?'bg-black text-white':'bg-white'}`}><Edit3 className="w-3.5 h-3.5" /> خام</button>
                    </div>
                  )}
                  <button onClick={handleSave} aria-label="ذخیره" className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-bold flex items-center gap-1">{savedFlash?<Check className="w-3 h-3" />:<Save className="w-3 h-3" />} {savedFlash?'ذخیره شد':'ذخیره'}</button>
                  <button onClick={()=>handleCopy('file', activeContent)} className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-bold flex items-center gap-1">{copiedKey==='file'?<Check className="w-3 h-3" />:<Copy className="w-3 h-3" />} {copiedKey==='file'?'کپی شد':'کپی'}</button>
                  <button onClick={handleSingle} className="px-2 py-1 bg-white border-[2px] border-black text-[11px] font-bold flex items-center gap-1"><Download className="w-3 h-3" /> دانلود</button>
                </div>
              </div>

              {isMarkdown && viewMode==='rendered' ? (
                <div dir="rtl" className="overflow-y-auto max-h-[520px] bg-white brutal-scroll" data-testid="markdown-view">
                  <MarkdownView content={activeContent} emptyHint="این فایل خالی است. از تب «خام» شروع به نوشتن کنید." />
                </div>
              ) : (
                <div className="h-[520px] border-[2.5px] border-black border-x-0" data-testid="code-editor">
                  <CodeEditor
                    path={activeFile}
                    value={activeContent}
                    onChange={handleEdit}
                    onSave={handleSave}
                    onCursorChange={setCursor}
                    revealLine={revealLine}
                    onRevealHandled={()=>setRevealLine(null)}
                  />
                </div>
              )}

              <div className="px-2 py-1 bg-[#0a0a0a] border-t-[2px] border-black flex items-center gap-3 text-[10px] font-mono font-bold text-[#FFDE03]" dir="ltr">
                <span>Ln {cursor.line}, Col {cursor.column}</span>
                {cursor.selected>0 && <span>{cursor.selected} selected</span>}
                <span className="text-white/40">UTF-8</span>
                <span className="text-white/40">{LANGUAGE_LABEL[languageOf(activeFile)]}</span>
                <span className="ml-auto hidden sm:inline text-white/40">Ctrl+S save · Tab indent · Ctrl+/ comment</span>
              </div>

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

      <PromptDialog
        open={deleteTarget !== null}
        title="حذف فایل"
        description={deleteTarget ? `فایل «${deleteTarget}» از پکیج تحویلی حذف می‌شود. این کار قابل بازگشت نیست، اما می‌توانید دوباره بسازید.` : undefined}
        confirmLabel="حذف کن"
        tone="danger"
        withInput={false}
        onCancel={()=>setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};
