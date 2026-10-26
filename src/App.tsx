import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { RefreshCw, X, WifiOff, Radar, Settings, Terminal, Workflow, Sparkles, Cpu } from 'lucide-react';
import { BrutalHeader } from './components/layout/BrutalHeader';
import { BrutalSidebar } from './components/layout/BrutalSidebar';
import { StatusBar, MobileNav } from './components/StatusBar';
import { CommandPalette, PaletteAction } from './components/CommandPalette';
import { JobHunter } from './components/JobHunter';
import { CodeWorkspace } from './components/CodeWorkspace';
import { PipelineBoard } from './components/PipelineBoard';
import { AutoPilotPanel } from './components/AutoPilotPanel';
import { OutcomeAnalytics } from './components/OutcomeAnalytics';
import { AIEvaluatorModal } from './components/AIEvaluatorModal';
import { ProposalStudioModal } from './components/ProposalStudioModal';
import { GitHubDispatcher } from './components/GitHubDispatcher';
import { GitHubWorkflowManager } from './components/GitHubWorkflowManager';
import { SettingsModal } from './components/SettingsModal';
import { FreelanceJob, AIAnalysis, ActivityLogItem, UserSettings, PriorityLevel } from './types';
import { categorizeJobWithGemini } from './utils/geminiCategorizer';
import { categoryLabel, detectCategory } from '../shared/taxonomy';
import { evaluateProjectRelevance } from '../shared/relevanceEngine';
import { FeedStatusBar, FeedSource } from './components/FeedStatusBar';
import { hasConfiguredBrowserKey, isNativeAndroidApp, isStandaloneClientMode } from './services/browserLLM';
import { subscribeVaultChanges, readStoredCustomLLM } from './utils/customLLMClient';
import { loadInitialFeedUnified, runDirectTabletLiveScan, syncCloudFeedDirectFromGitHub } from './services/standaloneFeed';
import { createBid, updateBid, writeApiTokenToStorage } from './services/outcomeApi';
import { safeGetJSON, safeGetItem, safeSetJSON } from './utils/safeStorage';
import { dueBidReminders, notificationPermission, readNotifiedIds, rememberNotifiedIds, requestNotificationPermission, showReminderNotification } from './utils/reminders';

const MANUAL_VAULT_STORAGE_KEY = 'konklancer_manual_jobs_v2';

function readPermanentManualVault(): FreelanceJob[] {
  const parsed = safeGetJSON<FreelanceJob[]>(MANUAL_VAULT_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}
function writePermanentManualVault(list: FreelanceJob[]): void {
  safeSetJSON(MANUAL_VAULT_STORAGE_KEY, list);
}
function isValidFreelanceJob(data: any): data is FreelanceJob {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.id !== 'string' || !data.id.trim()) return false;
  if (typeof data.title !== 'string' || !data.title.trim()) return false;
  if (typeof data.description !== 'string') return false;
  if (typeof data.budget !== 'number' || isNaN(data.budget)) return false;
  if (typeof data.platform !== 'string') return false;
  if (!['ponisha', 'karlancer', 'parskoders', 'global'].includes(data.platformKey)) return false;
  if (!Array.isArray(data.tags)) return false;
  return true;
}
function enrichJob(job: FreelanceJob): FreelanceJob {
  const det = detectCategory(job.title, job.description, (job.tags || []).join(' '));
  const categoryKey = det.key;
  const rel = evaluateProjectRelevance(job.title, job.description, categoryKey, job.tags);
  return {
    ...job,
    categoryKey,
    category: categoryLabel(categoryKey),
    priority: job.priority || (job.budget >= 6000000 ? 'High' : job.budget >= 4000000 ? 'Medium' : 'Low'),
    categorizedTag: categoryLabel(categoryKey),
    relevanceTier: rel.tier,
    relevanceScore: rel.relevanceScore,
    relevanceReason: rel.reason,
  };
}
export function mergeFeedJobs(current: FreelanceJob[], incoming: FreelanceJob[], seed: FreelanceJob[] = []): FreelanceJob[] {
  const permanentMap = new Map<string, FreelanceJob>();
  const userTouchedMap = new Map<string, FreelanceJob>();
  for (const vJob of readPermanentManualVault()) { permanentMap.set(vJob.id, enrichJob({ ...vJob, pinned: true })); }
  for (const job of current) {
    if (job.isManual || job.pinned || job.id.startsWith('custom-') || job.id.startsWith('manual-')) { permanentMap.set(job.id, enrichJob({ ...job, pinned: true })); continue; }
    const isTouched = job.status !== 'new' || Boolean(job.aiAnalysis) || Boolean(job.proposal) || Boolean(job.generatedFiles) || Boolean(job.solutionCode);
    if (isTouched) userTouchedMap.set(job.id, job);
  }
  if (permanentMap.size > 0) writePermanentManualVault([...permanentMap.values()]);
  const incomingIds = new Set(incoming.map(j=>j.id));
  const mergedIncoming: FreelanceJob[] = [];
  for (const job of incoming) {
    if (permanentMap.has(job.id)) continue;
    const prev = userTouchedMap.get(job.id);
    if (!prev) mergedIncoming.push(enrichJob(job));
    else mergedIncoming.push(enrichJob({ ...job, status: prev.status, aiAnalysis: prev.aiAnalysis, proposal: prev.proposal, proposedPrice: prev.proposedPrice, generatedFiles: prev.generatedFiles, solutionCode: prev.solutionCode, executiveSummary: prev.executiveSummary, blueprintMode: prev.blueprintMode, repoUrl: prev.repoUrl, completedAt: prev.completedAt, priority: prev.priority ?? job.priority }));
  }
  const preservedOffFeed = [...userTouchedMap.values()].filter(j=> !incomingIds.has(j.id) && !permanentMap.has(j.id));
  const usedIds = new Set([...permanentMap.keys(), ...incomingIds, ...userTouchedMap.keys()]);
  const seeded = seed.filter(j=> !usedIds.has(j.id)).map(enrichJob);
  return [...permanentMap.values(), ...mergedIncoming, ...preservedOffFeed, ...seeded];
}

function useRouteTab(): 'hunter' | 'coder' | 'pipeline' | 'autopilot' | 'analytics' {
  const loc = useLocation();
  const path = loc.pathname;
  if (path.startsWith('/analytics')) return 'analytics';
  if (path.startsWith('/studio') || path.startsWith('/coder')) return 'coder';
  if (path.startsWith('/pipeline')) return 'pipeline';
  if (path.startsWith('/ops') || path.startsWith('/autopilot')) return 'autopilot';
  return 'hunter';
}

const Layout: React.FC<{
  jobs: FreelanceJob[];
  feed: { source: FeedSource; scannedAt: string | null; scannedProjects: number };
  settings: UserSettings;
  logs: ActivityLogItem[];
  isScanning: boolean;
  scanStatusText: string | null;
  socketConnected: boolean;
  totalEarningsToday: number;
  activeJobsCount: number;
  onOpenSettings: ()=>void;
  onOpenCommandPalette: ()=>void;
  onQuickScan: ()=>void;
  onSyncCloudFeed: ()=>void;
  cloudBusy: boolean;
  cloudEnabled: boolean;
  handleSelectAnalysis: (job: FreelanceJob)=>void;
  handleSelectProposal: (job: FreelanceJob)=>void;
  handleSelectCoding: (job: FreelanceJob)=>void;
  handleAddManual: (job: Partial<FreelanceJob>)=>void;
  handleTogglePin: (id:string)=>void;
  handleDeleteManual: (id:string)=>void;
  handleMoveStatus: (id:string, s:FreelanceJob['status'])=>void;
  handleUpdatePriority: (id:string, p:PriorityLevel)=>void;
  handleUpdateSettings: (p:Partial<UserSettings>)=>void;
  aiAvailable: boolean;
  selectedJobForCoding: FreelanceJob | null;
  onUpdateJob: (j:FreelanceJob)=>void;
  onUpdateJobFiles: (id:string, files:Record<string,string>)=>void;
  onOpenGitHubPush: (job:FreelanceJob, files:Record<string,string>)=>void;
  onUpdateJobRepoUrl: (id:string, url:string)=>void;
  githubToken: string;
  dailyEarningsGoal: number;
}> = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = useRouteTab();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // auto collapse on mobile
  useEffect(()=>{
    const mql = window.matchMedia('(max-width: 1024px)');
    const handler = ()=>{ if(mql.matches) setSidebarCollapsed(true); };
    handler();
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFBF0] text-[#0a0a0a] flex flex-col">
      <BrutalHeader
        onOpenSettings={props.onOpenSettings}
        onOpenCommandPalette={props.onOpenCommandPalette}
        onQuickScan={props.onQuickScan}
        isScanning={props.isScanning}
        scanStatusText={props.scanStatusText}
        totalEarningsToday={props.totalEarningsToday}
        activeJobsCount={props.activeJobsCount}
        socketConnected={props.socketConnected}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={()=>setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex flex-1 max-w-[1600px] w-full mx-auto">
        <BrutalSidebar collapsed={sidebarCollapsed} onToggle={()=>setSidebarCollapsed(!sidebarCollapsed)} jobs={props.jobs} feed={props.feed} onOpenSettings={props.onOpenSettings} />

        <main className="flex-1 min-w-0 p-3 lg:p-5 pb-20 lg:pb-5">
          <Routes>
            <Route path="/" element={<Navigate to="/hunt" replace />} />
            <Route path="/hunt" element={
              <>
                <FeedStatusBar
                  source={props.feed.source}
                  scannedAt={props.feed.scannedAt}
                  scannedProjects={props.feed.scannedProjects}
                  jobCount={props.jobs.filter(j=> j.isManual || j.pinned || j.relevanceTier !== 'junk').length}
                  isScanning={props.isScanning}
                  onScan={props.onQuickScan}
                  cloudEnabled={props.cloudEnabled}
                  cloudBusy={props.cloudBusy || props.isScanning}
                  onCloudScan={props.onQuickScan}
                  onSyncFeed={props.onSyncCloudFeed}
                />
                <div className="mt-4">
                  <JobHunter
                    jobs={props.jobs}
                    onSelectJobForAnalysis={props.handleSelectAnalysis}
                    onSelectJobForProposal={props.handleSelectProposal}
                    onSelectJobForCoding={(job)=>{ props.handleSelectCoding(job); navigate('/studio'); }}
                    onAddNewManualJob={props.handleAddManual}
                    onTogglePinJob={props.handleTogglePin}
                    onDeleteManualJob={props.handleDeleteManual}
                  />
                </div>
              </>
            } />
            <Route path="/pipeline" element={
              <PipelineBoard
                jobs={props.jobs}
                onSelectJobForAnalysis={props.handleSelectAnalysis}
                onSelectJobForProposal={props.handleSelectProposal}
                onSelectJobForCoding={(job)=>{ props.handleSelectCoding(job); navigate('/studio'); }}
                onMoveJobStatus={props.handleMoveStatus}
                onUpdatePriority={props.handleUpdatePriority}
                dailyEarningsGoal={props.dailyEarningsGoal}
              />
            } />
            <Route path="/studio" element={
              <CodeWorkspace
                job={props.selectedJobForCoding}
                aiAvailable={props.aiAvailable}
                onOpenSettings={props.onOpenSettings}
                githubToken={props.githubToken}
                onUpdateJob={props.onUpdateJob}
                onOpenGitHubPush={props.onOpenGitHubPush}
                onUpdateJobFiles={props.onUpdateJobFiles}
                onUpdateJobRepoUrl={props.onUpdateJobRepoUrl}
              />
            } />
            <Route path="/analytics" element={<OutcomeAnalytics />} />
            <Route path="/ops" element={
              <AutoPilotPanel
                logs={props.logs}
                settings={props.settings}
                jobs={props.jobs}
                onUpdateSettings={props.handleUpdateSettings}
                onTriggerManualScan={props.onQuickScan}
                isScanning={props.isScanning}
              />
            } />
            <Route path="*" element={<Navigate to="/hunt" replace />} />
          </Routes>
        </main>
      </div>

      <StatusBar
        socketConnected={props.socketConnected}
        feedSource={props.feed.source}
        jobCount={props.jobs.length}
        activeTab={activeTab}
        onOpenSettings={props.onOpenSettings}
        onOpenCommandPalette={props.onOpenCommandPalette}
      />
      <MobileNav activeTab={activeTab} setActiveTab={(tab)=> {
        const map: Record<string,string> = { hunter:'/hunt', coder:'/studio', pipeline:'/pipeline', autopilot:'/ops', analytics:'/analytics' };
        navigate(map[tab] || '/hunt');
      }} activeJobsCount={props.activeJobsCount} />
    </div>
  );
};

export default function App() {
  const [jobs, setJobs] = useState<FreelanceJob[]>(()=>{
    const manualVault = readPermanentManualVault().map(enrichJob);
    const saved = safeGetJSON<FreelanceJob[]>('freelanceflow_jobs', []);
    if (!Array.isArray(saved) || saved.length === 0) return manualVault;
    const list = saved.map(enrichJob);
    return mergeFeedJobs(manualVault, list, []);
  });

  const [feed, setFeed] = useState<{ source: FeedSource; scannedAt: string | null; scannedProjects: number }>({ source: 'unknown', scannedAt: null, scannedProjects: 0 });
  const [aiAvailable, setAiAvailable] = useState<boolean>(()=> hasConfiguredBrowserKey());
  const [settings, setSettings] = useState<UserSettings>(()=>{
    const defaults: UserSettings = { githubToken:'', githubUseSSH:false, githubSSHKey:'', defaultDiscountRate:18, autoBidThreshold:85, cyborgMode:true, preferredTone:'friendly_expert', dailyEarningsGoal:5000000 };
    let parsed: Partial<UserSettings> = {};
    let standaloneCustomLLM: UserSettings['customLLM'] | undefined;
    try {
      const saved = localStorage.getItem('konklancer_settings') || localStorage.getItem('freelanceflow_settings');
      if (saved) parsed = JSON.parse(saved);
      const savedCustom = safeGetItem('freelanceflow_custom_llm');
      if (savedCustom) standaloneCustomLLM = JSON.parse(savedCustom);
    } catch {}
    const { githubToken: legacyToken, ...rest } = parsed as any;
    const sessionToken = sessionStorage.getItem('freelanceflow_github_token') || '';
    if (legacyToken && !sessionToken) sessionStorage.setItem('freelanceflow_github_token', legacyToken);
    return { ...defaults, ...rest, ...(rest.customLLM || standaloneCustomLLM ? { customLLM: rest.customLLM || standaloneCustomLLM } : {}), githubToken: sessionToken || legacyToken || '' };
  });

  useEffect(()=>{ const unsub = subscribeVaultChanges(()=> setAiAvailable(hasConfiguredBrowserKey())); return unsub; }, []);
  const [logs, setLogs] = useState<ActivityLogItem[]>([{ id:'log-1', timestamp: new Date().toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit' }), type:'scan', message:'موتور v4 نئو-بروتالیست (اسکن عمیق + گاوصندوق دائمی + استودیو ۳ مرحله‌ای) آماده است.' }]);
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<FreelanceJob | null>(null);
  const [selectedJobForProposal, setSelectedJobForProposal] = useState<FreelanceJob | null>(null);
  const [selectedJobForCodingId, setSelectedJobForCodingId] = useState<string | null>(null);
  const [gitHubPushState, setGitHubPushState] = useState<{ job: FreelanceJob | null; files: Record<string,string> }>({ job: null, files: {} });
  const [jobToInit, setJobToInit] = useState<FreelanceJob | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState<string | null>(null);
  const [cloudInfo, setCloudInfo] = useState<{ enabled:boolean; repo?:string; status?:any }>({ enabled: true });
  const [cloudBusy, setCloudBusy] = useState(false);
  const selectedJobForCoding = jobs.find(j=> j.id===selectedJobForCodingId) || null;

  useEffect(()=>{ try{ safeSetJSON('freelanceflow_jobs', jobs); const protectedJobs = jobs.filter(j=> j.isManual || j.pinned || j.id.startsWith('custom-') || j.id.startsWith('manual-')); writePermanentManualVault(protectedJobs); } catch{} }, [jobs]);
  useEffect(()=>{ try{ const { githubToken, ...persisted } = settings; if(githubToken) sessionStorage.setItem('freelanceflow_github_token', githubToken); safeSetJSON('konklancer_settings', persisted); safeSetJSON('freelanceflow_settings', persisted); } catch{} }, [settings]);

  const refreshCloudStatus = useCallback(async ()=>{ setCloudInfo({ enabled:true, repo:'reARbitRA/konklancer2' }); return { enabled:true }; }, []);
  const refreshFeed = useCallback(async (): Promise<void> =>{
    try {
      const data = await loadInitialFeedUnified();
      const incoming: FreelanceJob[] = Array.isArray(data?.jobs) ? data.jobs.filter(isValidFreelanceJob) : [];
      setFeed({ source:'scanner', scannedAt: data?.scannedAt ?? null, scannedProjects: typeof data?.scannedProjects === 'number' ? data.scannedProjects : incoming.length });
      if (incoming.length>0) setJobs(prev=> mergeFeedJobs(prev, incoming, []));
    } catch (err){ console.warn('[feed] failed', err); setFeed(prev=>({...prev, source:'unknown' })); }
  }, []);

  useEffect(()=>{ refreshCloudStatus(); refreshFeed(); }, [refreshCloudStatus, refreshFeed]);

  const jobsRef = useRef(jobs); useEffect(()=>{ jobsRef.current=jobs; }, [jobs]);
  const addLog = (message:string, type:ActivityLogItem['type']='scan')=>{
    const newLog: ActivityLogItem = { id:`log-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, timestamp: new Date().toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit' }), type, message };
    setLogs(prev=> [newLog, ...prev.slice(0,49)]);
  };

  const handleSyncCloudFeed = useCallback(async ()=>{
    setCloudBusy(true);
    try {
      const result = await syncCloudFeedDirectFromGitHub(settings.githubToken);
      addLog(result.message, 'scan');
      if (result.jobs && result.jobs.length>0) {
        setJobs(prev=> mergeFeedJobs(prev, result.jobs, []));
        setFeed({ source:'scanner', scannedAt: result.scannedAt ?? new Date().toISOString(), scannedProjects: result.total ?? result.jobs.length });
      }
    } catch(err:any){ addLog(`همگام‌سازی ناموفق: ${err?.message ?? err}`, 'scan'); } finally{ setCloudBusy(false); }
  }, [settings.githubToken]);

  const handleQuickScan = useCallback(async ()=>{
    setIsScanning(true); setScanStatusText('شروع اسکن عمیق چندصفحه‌ای...');
    try {
      const out = await runDirectTabletLiveScan((msg)=>{ setScanStatusText(msg); addLog(msg,'scan'); });
      setJobs(prev=> mergeFeedJobs(prev, out.jobs, []));
      setFeed({ source:'scanner', scannedAt: out.scannedAt ?? new Date().toISOString(), scannedProjects: out.total });
      addLog(`اسکن تکمیل: ${out.added.toLocaleString('fa-IR')} مورد جدید (${out.summary})`, 'scan');
    } catch(err:any){ addLog(`خطا در اسکن: ${err?.message || err}`, 'scan'); } finally{ setIsScanning(false); setScanStatusText(null); }
  }, []);

  useEffect(()=>{
    if (isStandaloneClientMode() || isNativeAndroidApp()){ setSocketConnected(true); setSocketError(null); return; }
    const socket: Socket = io({ transports:['websocket','polling'], reconnection:true, reconnectionAttempts:3, timeout:6000 });
    socket.on('connect', ()=>{ setSocketConnected(true); setSocketError(null); setIsReconnecting(false); });
    socket.on('disconnect', ()=> setSocketConnected(false));
    socket.on('connect_error', ()=>{ setSocketConnected(false); setIsReconnecting(false); });
    socketRef.current=socket;
    return ()=>{ socket.disconnect(); };
  }, []);

  const handleManualReconnect = ()=>{ setIsReconnecting(true); socketRef.current?.connect(); };

  const handleFullJobUpdate = (updatedJob: FreelanceJob)=> setJobs(prev=> prev.map(j=> j.id===updatedJob.id ? updatedJob : j));
  const handleUpdateAnalysis = (jobId:string, analysis:AIAnalysis)=>{ setJobs(prev=> prev.map(j=> j.id===jobId ? { ...j, aiAnalysis: analysis } : j)); addLog(`تحلیل AI برای ${jobId} با امتیاز ${analysis.automatabilityScore}٪ ثبت شد.`, 'bid'); };
  const handleSaveProposalToJob = (jobId:string, proposal:string, price:number)=>{ setJobs(prev=> prev.map(j=> j.id===jobId ? { ...j, proposal, proposedPrice: price, status: j.status==='new' ? 'bidded' : j.status } : j)); addLog(`پیشنهاد ${price.toLocaleString('fa-IR')} تومان ثبت شد.`, 'bid'); };
  const handleUpdateJobFiles = (jobId:string, files:Record<string,string>)=>{
    setJobs(prev=> prev.map(j=>{ if(j.id===jobId){ const updated={ ...j, generatedFiles: files, solutionCode: files, status:'in_progress' as const }; setJobToInit(updated); return updated; } return j; }));
    addLog(`پکیج تحویلی پروژه ${jobId} ذخیره شد.`, 'code');
  };
  const handleCompleteJob = (jobId:string, repoUrl:string)=>{
    const todayIso=new Date().toISOString().split('T')[0];
    setJobs(prev=> prev.map(j=> j.id===jobId ? { ...j, repoUrl, status:'completed', completedAt: j.completedAt || todayIso } : j));
    addLog(`پروژه ${jobId} نهایی شد.`, 'payment');
  };
  const handleMoveJobStatus = (jobId:string, newStatus:FreelanceJob['status'])=>{
    const todayIso=new Date().toISOString().split('T')[0];
    const stamp = new Date().toISOString();
    const outcomeStatuses: FreelanceJob['status'][] = ['completed'];
    setJobs(prev=> prev.map(j=>{
      if (j.id !== jobId) return j;
      const next: FreelanceJob = { ...j, status: newStatus };
      if (newStatus==='completed' && !j.completedAt) next.completedAt = todayIso;
      // ثبت زمان ارسال برای یادآور ۴ ساعته (SPEC-002)
      if (newStatus==='bidded' && !j.bidAt) next.bidAt = stamp;
      if (outcomeStatuses.includes(newStatus) && !j.outcomeAt) next.outcomeAt = stamp;
      return next;
    }));
    // ثبت نتیجه در سرور: تسویه = برد (SPEC-005) — خطا مانع کار UI نمی‌شود
    if (newStatus === 'completed') {
      const done = jobsRef.current.find(j=> j.id === jobId);
      if (done?.bidId) {
        void updateBid(done.bidId, { status: 'won' }).catch(()=>{});
      }
    }
    // ثبت پیشنهاد در سرور (SPEC-005) — خطا مانع کار UI نمی‌شود
    if (newStatus === 'bidded') {
      const target = jobsRef.current.find(j=> j.id === jobId);
      if (target && !target.bidId) {
        void createBid({
          projectId: target.id,
          platform: target.platform,
          category: target.categoryKey || target.category,
          title: target.title,
          budgetBid: target.proposedPrice || target.budget || 0,
          budgetText: target.budgetFormatted,
          bidsAtSeen: target.proposalsCount,
        })
          .then((bid)=> setJobs(prev=> prev.map(j=> j.id===jobId ? { ...j, bidId: bid.id, bidAt: j.bidAt || bid.bidAt } : j)))
          .catch((err)=> addLog(`ثبت پیشنهاد در سرور ناموفق بود: ${err?.message ?? err}`, 'bid'));
      }
    }
  };
  // توکن API (SPEC-003 R5): هر تغییر در تنظیمات، در حافظه‌ی مرورگر هم می‌نشیند
  // تا سرویس‌های شبکه‌ای بدون خواندن کل تنظیمات آن را در هدر بفرستند.
  useEffect(() => { writeApiTokenToStorage(settings.apiToken || ''); }, [settings.apiToken]);

  // یادآور مرورگر برای پیشنهادهای بی‌نتیجه (SPEC-002 / AC-1):
  // هر دقیقه بررسی می‌شود؛ هر پیشنهاد حداکثر یک بار اعلان می‌گیرد.
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    const tick = () => {
      const due = dueBidReminders(jobsRef.current, new Date(), { alreadyNotified: readNotifiedIds() });
      if (due.length === 0) return;
      const shown = due.filter((reminder) => showReminderNotification(reminder)).map((reminder) => reminder.jobId);
      if (shown.length > 0) {
        rememberNotifiedIds([...readNotifiedIds(), ...shown]);
        addLog(`${shown.length} یادآور نتیجه‌ی پیشنهاد نمایش داده شد.`, 'bid');
      }
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.notificationsEnabled, jobs.length]);

  const handleUpdateJobRepoUrl = (jobId:string, repoUrl:string)=> setJobs(prev=> prev.map(j=> j.id===jobId ? { ...j, repoUrl } : j));
  const handleUpdatePriority = (jobId:string, newPriority:PriorityLevel)=> setJobs(prev=> prev.map(j=> j.id===jobId ? { ...j, priority: newPriority } : j));
  const handleAddNewManualJob = async (newJob: Partial<FreelanceJob>)=>{
    const fullJob = newJob as FreelanceJob;
    const categoryKey = detectCategory(fullJob.title, fullJob.description).key;
    const hasApiKey = Boolean(readStoredCustomLLM()?.apiKey?.trim());
    const categorizedTag = fullJob.categorizedTag || (hasApiKey ? await categorizeJobWithGemini(fullJob.title, fullJob.description) : categoryLabel(categoryKey));
    const priority: PriorityLevel = fullJob.priority || (fullJob.budget >=6000000?'High': fullJob.budget>=4000000?'Medium':'Low');
    const enrichedJob: FreelanceJob = enrichJob({ ...fullJob, isManual:true, pinned:true, categoryKey, category: categoryLabel(categoryKey), categorizedTag, priority, tags: Array.from(new Set([...(fullJob.tags||[]), categorizedTag])) });
    const existingVault = readPermanentManualVault().filter(v=> v.id!==enrichedJob.id);
    writePermanentManualVault([enrichedJob, ...existingVault]);
    setJobs(prev=> [enrichedJob, ...prev.filter(p=> p.id!==enrichedJob.id)]);
    addLog(`پروژه "${enrichedJob.title}" در گاوصندوق دائمی ثبت شد.`, 'scan');
  };
  const handleTogglePinJob = (jobId:string)=>{
    setJobs(prev=>{
      const next = prev.map(j=>{
        if(j.id!==jobId) return j;
        const willProtect = !(j.isManual || j.pinned);
        return { ...j, pinned: willProtect, isManual: willProtect ? j.isManual : false };
      });
      writePermanentManualVault(next.filter(j=> j.isManual || j.pinned));
      return next;
    });
  };
  const handleDeleteManualJob = (jobId:string)=>{
    writePermanentManualVault(readPermanentManualVault().filter(v=> v.id!==jobId));
    setJobs(prev=> prev.filter(j=> j.id!==jobId));
    addLog('پروژه از گاوصندوق حذف شد.', 'scan');
  };

  const completedJobs = jobs.filter(j=> j.status==='completed');
  const totalEarningsToday = completedJobs.reduce((a,j)=> a+(j.proposedPrice||j.budget||0),0);
  const activeJobsCount = jobs.filter(j=> j.status!=='completed' && j.status!=='new').length;

  useEffect(()=>{
    const onKeyDown = (e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey) && (e.key==='k'||e.key==='K')){ e.preventDefault(); setIsCommandPaletteOpen(v=>!v); }
    };
    window.addEventListener('keydown', onKeyDown); return ()=> window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Inner component to access navigate
  const InnerApp = ()=>{
    const navigate = useNavigate();
    const paletteActions: PaletteAction[] = useMemo(()=>[
      { id:'scan', label:'اجرای اسکن زنده', hint:'اسکن چندصفحه‌ای', icon: Radar, run: ()=> handleQuickScan() },
      { id:'settings', label:'تنظیمات گاوصندوق', hint:'مدیریت کلیدها', icon: Settings, run: ()=> setIsSettingsOpen(true) },
      { id:'tab-hunter', label:'رادار شکار', hint:'فهرست پروژه‌ها', icon: Radar, run: ()=> navigate('/hunt') },
      { id:'tab-coder', label:'استودیو تحویل', hint:'۳ مرحله‌ای', icon: Terminal, run: ()=> navigate('/studio') },
      { id:'tab-pipeline', label:'پایپ‌لاین', hint:'کانبان و درآمد', icon: Workflow, run: ()=> navigate('/pipeline') },
      { id:'tab-autopilot', label:'مرکز سایبورگ', hint:'اتوماسیون', icon: Sparkles, run: ()=> navigate('/ops') },
    ], [handleQuickScan, navigate]);

    return (
      <>
        {socketError && (
          <div className="bg-[#FF3B30] border-b-[3px] border-black text-white px-4 py-2 text-xs font-bold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><WifiOff className="w-4 h-4" /> {socketError}</div>
            <div className="flex items-center gap-2">
              <button onClick={handleManualReconnect} disabled={isReconnecting} className="px-3 py-1 bg-white text-black border-[2px] border-black font-black text-[11px] flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${isReconnecting?'animate-spin':''}`} /> تلاش مجدد</button>
              <button onClick={()=>setSocketError(null)} className="w-7 h-7 bg-black text-white border border-white flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        <Layout
          jobs={jobs}
          feed={feed}
          settings={settings}
          logs={logs}
          isScanning={isScanning}
          scanStatusText={scanStatusText}
          socketConnected={socketConnected}
          totalEarningsToday={totalEarningsToday}
          activeJobsCount={activeJobsCount}
          onOpenSettings={()=>setIsSettingsOpen(true)}
          onOpenCommandPalette={()=>setIsCommandPaletteOpen(true)}
          onQuickScan={handleQuickScan}
          onSyncCloudFeed={handleSyncCloudFeed}
          cloudBusy={cloudBusy}
          cloudEnabled={cloudInfo.enabled}
          handleSelectAnalysis={(job)=> setSelectedJobForAnalysis(job)}
          handleSelectProposal={(job)=> setSelectedJobForProposal(job)}
          handleSelectCoding={(job)=> setSelectedJobForCodingId(job.id)}
          handleAddManual={handleAddNewManualJob}
          handleTogglePin={handleTogglePinJob}
          handleDeleteManual={handleDeleteManualJob}
          handleMoveStatus={handleMoveJobStatus}
          handleUpdatePriority={handleUpdatePriority}
          handleUpdateSettings={(ns)=> setSettings({ ...settings, ...ns })}
          aiAvailable={aiAvailable}
          selectedJobForCoding={selectedJobForCoding}
          onUpdateJob={handleFullJobUpdate}
          onUpdateJobFiles={handleUpdateJobFiles}
          onOpenGitHubPush={(job,files)=> setGitHubPushState({job,files})}
          onUpdateJobRepoUrl={handleUpdateJobRepoUrl}
          githubToken={settings.githubToken}
          dailyEarningsGoal={settings.dailyEarningsGoal}
        />

        {jobToInit && (
          <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
            <div className="bg-white border-[3px] border-black shadow-[8px_8px_0px_0px_#000] max-w-2xl w-full p-4">
              <GitHubWorkflowManager job={jobToInit} githubToken={settings.githubToken} onRepoCreated={(repoUrl)=>{ setJobs(prev=> prev.map(j=> j.id===jobToInit.id ? { ...j, repoUrl } : j)); setJobToInit(null); }} autoStart={false} />
              <button onClick={()=>setJobToInit(null)} className="mt-3 brutal-btn w-full">بستن</button>
            </div>
          </div>
        )}

        {selectedJobForAnalysis && (
          <AIEvaluatorModal
            job={selectedJobForAnalysis}
            onClose={()=> setSelectedJobForAnalysis(null)}
            onProceedToProposal={setSelectedJobForProposal}
            onProceedToCoding={(job)=>{ setSelectedJobForCodingId(job.id); navigate('/studio'); }}
            onUpdateAnalysis={handleUpdateAnalysis}
          />
        )}
        {selectedJobForProposal && (
          <ProposalStudioModal
            job={selectedJobForProposal}
            onClose={()=> setSelectedJobForProposal(null)}
            onProceedToCoding={(job)=>{ setSelectedJobForCodingId(job.id); navigate('/studio'); }}
            onSaveProposalToJob={handleSaveProposalToJob}
          />
        )}
        {gitHubPushState.job && (
          <GitHubDispatcher job={gitHubPushState.job} files={gitHubPushState.files} githubToken={settings.githubToken} onClose={()=> setGitHubPushState({job:null, files:{}})} onCompleteJob={handleCompleteJob} />
        )}
        {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} settings={settings} onClose={()=> setIsSettingsOpen(false)} onSave={(ns)=> setSettings(ns)} />}
        <CommandPalette open={isCommandPaletteOpen} onClose={()=> setIsCommandPaletteOpen(false)} jobs={jobs} actions={paletteActions} onSelectJob={setSelectedJobForAnalysis} />
      </>
    );
  };

  return (
    <HashRouter>
      <InnerApp />
    </HashRouter>
  );
}
