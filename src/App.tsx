import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { RefreshCw, X, WifiOff } from 'lucide-react';
import { Header } from './components/Header';
import { JobHunter } from './components/JobHunter';
import { CodeWorkspace } from './components/CodeWorkspace';
import { PipelineBoard } from './components/PipelineBoard';
import { AutoPilotPanel } from './components/AutoPilotPanel';
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
import { isNativeAndroidApp, isStandaloneClientMode } from './services/browserLLM';
import {
  loadInitialFeedUnified,
  runDirectTabletLiveScan,
  syncCloudFeedDirectFromGitHub,
} from './services/standaloneFeed';

const MANUAL_VAULT_STORAGE_KEY = 'konklancer_manual_jobs_v2';

function readPermanentManualVault(): FreelanceJob[] {
  try {
    const raw = localStorage.getItem(MANUAL_VAULT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePermanentManualVault(list: FreelanceJob[]): void {
  try {
    localStorage.setItem(MANUAL_VAULT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage errors
  }
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

/** همیشه دسته‌بندی وزن‌دار جدید و تناسب کاری را دقیق محاسبه می‌کند */
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

/**
 * ادغام تضمین‌شده بدون پاک‌شدن پروژه‌های دستی و سنجاق‌شده:
 * ۱. تمام پروژه‌های گاوصندوق دائمی (konklancer_manual_jobs_v2 + isManual + pinned) همیشه در صدر حفظ می‌شوند.
 * ۲. پروژه‌های دارای تحلیل، پروپوزال، فایل تحویلی یا وضعیت تغییریافته دست‌نخورده می‌مانند.
 */
export function mergeFeedJobs(
  current: FreelanceJob[],
  incoming: FreelanceJob[],
  seed: FreelanceJob[] = [],
): FreelanceJob[] {
  const permanentMap = new Map<string, FreelanceJob>();
  const userTouchedMap = new Map<string, FreelanceJob>();

  for (const vJob of readPermanentManualVault()) {
    permanentMap.set(vJob.id, enrichJob({ ...vJob, pinned: true }));
  }

  for (const job of current) {
    if (job.isManual || job.pinned || job.id.startsWith('custom-') || job.id.startsWith('manual-')) {
      permanentMap.set(job.id, enrichJob({ ...job, pinned: true }));
      continue;
    }
    const isTouched =
      job.status !== 'new' ||
      Boolean(job.aiAnalysis) ||
      Boolean(job.proposal) ||
      Boolean(job.generatedFiles) ||
      Boolean(job.solutionCode);
    if (isTouched) {
      userTouchedMap.set(job.id, job);
    }
  }

  // همگام‌سازی خودکار گاوصندوق دائمی روی دیسک
  if (permanentMap.size > 0) {
    writePermanentManualVault([...permanentMap.values()]);
  }

  const incomingIds = new Set(incoming.map((j) => j.id));
  const mergedIncoming: FreelanceJob[] = [];

  for (const job of incoming) {
    if (permanentMap.has(job.id)) continue; // نسخه دائمی در صدر قرار می‌گیرد
    const prev = userTouchedMap.get(job.id);
    if (!prev) {
      mergedIncoming.push(enrichJob(job));
    } else {
      mergedIncoming.push(
        enrichJob({
          ...job,
          status: prev.status,
          aiAnalysis: prev.aiAnalysis,
          proposal: prev.proposal,
          proposedPrice: prev.proposedPrice,
          generatedFiles: prev.generatedFiles,
          solutionCode: prev.solutionCode,
          executiveSummary: prev.executiveSummary,
          blueprintMode: prev.blueprintMode,
          repoUrl: prev.repoUrl,
          completedAt: prev.completedAt,
          priority: prev.priority ?? job.priority,
        }),
      );
    }
  }

  const preservedOffFeed = [...userTouchedMap.values()].filter(
    (j) => !incomingIds.has(j.id) && !permanentMap.has(j.id),
  );
  const usedIds = new Set([...permanentMap.keys(), ...incomingIds, ...userTouchedMap.keys()]);
  const seeded = seed.filter((j) => !usedIds.has(j.id)).map(enrichJob);

  return [...permanentMap.values(), ...mergedIncoming, ...preservedOffFeed, ...seeded];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'hunter' | 'coder' | 'pipeline' | 'autopilot'>('hunter');

  const [jobs, setJobs] = useState<FreelanceJob[]>(() => {
    const manualVault = readPermanentManualVault().map(enrichJob);
    const saved = localStorage.getItem('freelanceflow_jobs');
    if (!saved) return manualVault;
    try {
      const parsed: FreelanceJob[] = JSON.parse(saved);
      const list = Array.isArray(parsed) ? parsed.map(enrichJob) : [];
      return mergeFeedJobs(manualVault, list, []);
    } catch {
      return manualVault;
    }
  });

  const [feed, setFeed] = useState<{ source: FeedSource; scannedAt: string | null; scannedProjects: number }>({
    source: 'unknown',
    scannedAt: null,
    scannedProjects: 0,
  });

  const [aiAvailable, setAiAvailable] = useState<boolean>(() => hasConfiguredBrowserKey());

  const [settings, setSettings] = useState<UserSettings>(() => {
    const defaults: UserSettings = {
      githubToken: '',
      githubUseSSH: false,
      githubSSHKey: '',
      defaultDiscountRate: 18,
      autoBidThreshold: 85,
      cyborgMode: true,
      preferredTone: 'friendly_expert',
      dailyEarningsGoal: 5000000,
    };
    let parsed: Partial<UserSettings> = {};
    let standaloneCustomLLM: UserSettings['customLLM'] | undefined;
    try {
      const saved =
        localStorage.getItem('konklancer_settings') ||
        localStorage.getItem('freelanceflow_settings');
      if (saved) parsed = JSON.parse(saved);
      const savedCustom = localStorage.getItem('freelanceflow_custom_llm');
      if (savedCustom) standaloneCustomLLM = JSON.parse(savedCustom);
    } catch {
      // ignore invalid json
    }
    const { githubToken: legacyToken, ...rest } = parsed as any;
    const sessionToken = sessionStorage.getItem('freelanceflow_github_token') || '';
    if (legacyToken && !sessionToken) {
      sessionStorage.setItem('freelanceflow_github_token', legacyToken);
    }
    return {
      ...defaults,
      ...rest,
      ...(rest.customLLM || standaloneCustomLLM ? { customLLM: rest.customLLM || standaloneCustomLLM } : {}),
      githubToken: sessionToken || legacyToken || '',
    };
  });

  useEffect(() => {
    const unsub = subscribeVaultChanges(() => {
      setAiAvailable(hasConfiguredBrowserKey());
    });
    return unsub;
  }, []);

  const [logs, setLogs] = useState<ActivityLogItem[]>([
    {
      id: 'log-1',
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      type: 'scan',
      message: 'موتور v3 کونک‌لنسر (اسکن عمیق چندصفحه‌ای + گاوصندوق دائمی + استودیو ۳ مرحله‌ای تحویل) آماده است.',
    },
  ]);

  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<FreelanceJob | null>(null);
  const [selectedJobForProposal, setSelectedJobForProposal] = useState<FreelanceJob | null>(null);
  const [selectedJobForCodingId, setSelectedJobForCodingId] = useState<string | null>(null);
  const [gitHubPushState, setGitHubPushState] = useState<{
    job: FreelanceJob | null;
    files: Record<string, string>;
  }>({ job: null, files: {} });
  const [jobToInit, setJobToInit] = useState<FreelanceJob | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusText, setScanStatusText] = useState<string | null>(null);
  const [cloudInfo, setCloudInfo] = useState<{ enabled: boolean; repo?: string; status?: any }>({ enabled: true });
  const [cloudBusy, setCloudBusy] = useState(false);

  const selectedJobForCoding = jobs.find((j) => j.id === selectedJobForCodingId) || null;

  useEffect(() => {
    try {
      localStorage.setItem('freelanceflow_jobs', JSON.stringify(jobs));
    } catch {
      // ignore storage errors on restricted local protocols
    }
  }, [jobs]);

  useEffect(() => {
    try {
      const { githubToken, ...persisted } = settings;
      if (githubToken) {
        sessionStorage.setItem('freelanceflow_github_token', githubToken);
      }
      const serialized = JSON.stringify(persisted);
      localStorage.setItem('konklancer_settings', serialized);
      localStorage.setItem('freelanceflow_settings', serialized);
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  const refreshCloudStatus = useCallback(async () => {
    setCloudInfo({ enabled: true, repo: 'reARbitRA/konklancer2' });
    return { enabled: true };
  }, []);

  const refreshFeed = useCallback(async (): Promise<void> => {
    try {
      const data = await loadInitialFeedUnified();
      const incoming: FreelanceJob[] = Array.isArray(data?.jobs)
        ? data.jobs.filter(isValidFreelanceJob)
        : [];
      setFeed({
        source: 'scanner',
        scannedAt: data?.scannedAt ?? null,
        scannedProjects: typeof data?.scannedProjects === 'number' ? data.scannedProjects : incoming.length,
      });
      if (incoming.length > 0) {
        setJobs((prev) => mergeFeedJobs(prev, incoming, []));
      }
    } catch (err) {
      console.warn('[feed] بارگذاری فید ناموفق بود:', err);
      setFeed((prev) => ({ ...prev, source: 'unknown' }));
    }
  }, []);

  useEffect(() => {
    refreshCloudStatus();
    refreshFeed();
  }, [refreshCloudStatus, refreshFeed]);

  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const addLog = (message: string, type: ActivityLogItem['type'] = 'scan') => {
    const newLog: ActivityLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  const handleSyncCloudFeed = useCallback(async () => {
    setCloudBusy(true);
    try {
      const result = await syncCloudFeedDirectFromGitHub(settings.githubToken);
      addLog(result.message, 'scan');
      if (result.jobs && result.jobs.length > 0) {
        setJobs((prev) => mergeFeedJobs(prev, result.jobs, []));
        setFeed({
          source: 'scanner',
          scannedAt: result.scannedAt ?? new Date().toISOString(),
          scannedProjects: result.total ?? result.jobs.length,
        });
      }
    } catch (err: any) {
      addLog(`همگام‌سازی فید ناموفق بود: ${err?.message ?? err}`, 'scan');
    } finally {
      setCloudBusy(false);
    }
  }, [settings.githubToken]);

  const handleQuickScan = useCallback(async () => {
    setIsScanning(true);
    setScanStatusText('شروع اسکن عمیق چندصفحه‌ای...');
    try {
      const out = await runDirectTabletLiveScan((msg) => {
        setScanStatusText(msg);
        addLog(msg, 'scan');
      });
      setJobs((prev) => mergeFeedJobs(prev, out.jobs, []));
      setFeed({
        source: 'scanner',
        scannedAt: out.scannedAt ?? new Date().toISOString(),
        scannedProjects: out.total,
      });
      addLog(`اسکن عمیق تکمیل شد: ${out.added.toLocaleString('fa-IR')} مورد جدید (${out.summary})`, 'scan');
    } catch (err: any) {
      addLog(`خطا در اسکن عمیق: ${err?.message || err}`, 'scan');
    } finally {
      setIsScanning(false);
      setScanStatusText(null);
    }
  }, []);

  // Robust Socket.io Client Setup (skipped cleanly in standalone HTML / Android APK mode)
  useEffect(() => {
    if (isStandaloneClientMode()) {
      setSocketConnected(true);
      setSocketError(null);
      return;
    }
    const socket: Socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 8000,
    });
    socket.on('connect', () => {
      setSocketConnected(true);
      setSocketError(null);
      setIsReconnecting(false);
      addLog('اتصال زنده وب‌سوکت Socket.io برقرار شد.', 'scan');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      setSocketConnected(false);
      setIsReconnecting(false);
      setSocketError(null);
    });

    socket.on('error', () => {
      setSocketConnected(false);
      setSocketError(null);
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      setIsReconnecting(true);
      addLog(`در حال تلاش مجدد برای اتصال به بریج (تلاش شماره ${attemptNumber})...`, 'scan');
    });

    socket.on('reconnect_failed', () => {
      setIsReconnecting(false);
    });
    socketRef.current = socket;
    return () => {
      socket.disconnect();
    };
  }, []);

  const handleManualReconnect = () => {
    setIsReconnecting(true);
    addLog('تلاش دستی برای برقراری مجدد ارتباط با سوکت...');
    if (socketRef.current) {
      socketRef.current.connect();
    }
  };

  // Unified live scan across Cloud Relay + Native Android HTTP in every mode
  const handleQuickScan = async () => {
    setIsScanning(true);
    try {
      const out = await runDirectTabletLiveScan((msg) => addLog(msg, 'scan'));
      setJobs((prev) => mergeFeedJobs(prev, out.jobs, []));
      setFeed({
        source: 'scanner',
        scannedAt: out.scannedAt ?? new Date().toISOString(),
        scannedProjects: out.total,
      });
      addLog(`اسکن زنده تکمیل شد: ${out.added} پروژه جدید (${out.summary})`, 'scan');
    } catch (err: any) {
      addLog(`خطا در اسکن زنده: ${err?.message || err}`, 'scan');
    } finally {
      setIsScanning(false);
    }
  };

  // Updaters
  const handleFullJobUpdate = (updatedJob: FreelanceJob) => {
    setJobs((prev) => prev.map((j) => (j.id === updatedJob.id ? updatedJob : j)));
  };

  const handleUpdateAnalysis = (jobId: string, analysis: AIAnalysis) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, aiAnalysis: analysis } : j)));
    addLog(`تحلیل هوش مصنوعی برای پروژه "${jobId}" با امتیاز ${analysis.automatabilityScore}٪ ثبت شد.`, 'bid');
  };

  const handleSaveProposalToJob = (jobId: string, proposal: string, price: number) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              proposal,
              proposedPrice: price,
              status: j.status === 'new' ? 'bidded' : j.status,
            }
          : j,
      ),
    );
    addLog(`پیشنهاد قیمت ${price.toLocaleString('fa-IR')} تومان در پایپ‌لاین ثبت گردید.`, 'bid');
  };

  const handleUpdateJobFiles = (jobId: string, files: Record<string, string>) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === jobId) {
          const updatedJob = { ...j, generatedFiles: files, solutionCode: files, status: 'in_progress' as const };
          setJobToInit(updatedJob);
          return updatedJob;
        }
        return j;
      }),
    );
    addLog(`پکیج مستندات فنی و فایل‌های تحویلی پروژه "${jobId}" تولید و ذخیره شد.`, 'code');
  };

  const handleCompleteJob = (jobId: string, repoUrl: string) => {
    const todayIso = new Date().toISOString().split('T')[0];
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              repoUrl,
              status: 'completed',
              completedAt: j.completedAt || todayIso,
            }
          : j,
      ),
    );
    addLog(`پروژه "${jobId}" نهایی شد.`, 'payment');
  };

  const handleMoveJobStatus = (jobId: string, newStatus: FreelanceJob['status']) => {
    const todayIso = new Date().toISOString().split('T')[0];
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: newStatus,
              ...(newStatus === 'completed' && !j.completedAt ? { completedAt: todayIso } : {}),
            }
          : j,
      ),
    );
  };

  const handleUpdateJobRepoUrl = (jobId: string, repoUrl: string) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, repoUrl } : j)));
  };

  const handleUpdatePriority = (jobId: string, newPriority: PriorityLevel) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, priority: newPriority } : j)));
  };

  const handleAddNewManualJob = async (newJob: Partial<FreelanceJob>) => {
    const fullJob = newJob as FreelanceJob;
    const categoryKey = detectCategory(fullJob.title, fullJob.description).key;
    const categorizedTag =
      fullJob.categorizedTag ||
      categoryLabel(await categorizeJobWithGemini(fullJob.title, fullJob.description));
    const priority: PriorityLevel =
      fullJob.priority ||
      (fullJob.budget >= 6000000 ? 'High' : fullJob.budget >= 4000000 ? 'Medium' : 'Low');

    const enrichedJob: FreelanceJob = enrichJob({
      ...fullJob,
      isManual: true,
      pinned: true,
      categoryKey,
      category: categoryLabel(categoryKey),
      categorizedTag,
      priority,
      tags: Array.from(new Set([...(fullJob.tags || []), categorizedTag])),
    });

    const existingVault = readPermanentManualVault().filter((v) => v.id !== enrichedJob.id);
    writePermanentManualVault([enrichedJob, ...existingVault]);

    setJobs((prev) => [enrichedJob, ...prev.filter((p) => p.id !== enrichedJob.id)]);
    addLog(`پروژه "${enrichedJob.title}" در گاوصندوق دائمی ثبت شد و هرگز در اسکن‌ها پاک نخواهد شد.`, 'scan');
  };

  const handleTogglePinJob = (jobId: string) => {
    setJobs((prev) => {
      const next = prev.map((j) => {
        if (j.id !== jobId) return j;
        const willProtect = !(j.isManual || j.pinned);
        return { ...j, pinned: willProtect, isManual: willProtect ? j.isManual : false };
      });
      const protectedJobs = next.filter((j) => j.isManual || j.pinned);
      writePermanentManualVault(protectedJobs);
      return next;
    });
  };

  const handleDeleteManualJob = (jobId: string) => {
    const remainingVault = readPermanentManualVault().filter((v) => v.id !== jobId);
    writePermanentManualVault(remainingVault);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    addLog('پروژه از گاوصندوق دائمی حذف شد.', 'scan');
  };

  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const totalEarningsToday = completedJobs.reduce(
    (acc, j) => acc + (j.proposedPrice || j.budget || 0),
    0,
  );
  const activeJobsCount = jobs.filter((j) => j.status !== 'completed' && j.status !== 'new').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onQuickScan={handleQuickScan}
        isScanning={isScanning}
        scanStatusText={scanStatusText}
        totalEarningsToday={totalEarningsToday}
        activeJobsCount={activeJobsCount}
        socketConnected={socketConnected}
      />

      {socketError && (
        <div className="bg-red-950/80 border-b border-red-800/80 text-red-200 px-4 py-2.5 text-xs">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
              <span className="font-medium">{socketError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-900/60 text-red-100 border border-red-700/60 rounded text-[11px]"
              >
                <RefreshCw className={`h-3 w-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>تلاش مجدد</span>
              </button>
              <button onClick={() => setSocketError(null)} className="text-red-400 hover:text-red-200 p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
        {activeTab === 'hunter' && (
          <FeedStatusBar
            source={feed.source}
            scannedAt={feed.scannedAt}
            scannedProjects={feed.scannedProjects}
            jobCount={jobs.filter((j) => j.isManual || j.pinned || j.relevanceTier !== 'junk').length}
            isScanning={isScanning}
            onScan={handleQuickScan}
            cloudEnabled={cloudInfo.enabled}
            cloudBusy={cloudBusy || isScanning}
            onCloudScan={handleQuickScan}
            onSyncFeed={handleSyncCloudFeed}
          />
        )}

        {activeTab === 'hunter' && (
          <JobHunter
            jobs={jobs}
            onSelectJobForAnalysis={(job) => setSelectedJobForAnalysis(job)}
            onSelectJobForProposal={(job) => setSelectedJobForProposal(job)}
            onSelectJobForCoding={(job) => {
              setSelectedJobForCodingId(job.id);
              setActiveTab('coder');
            }}
            onAddNewManualJob={handleAddNewManualJob}
            onTogglePinJob={handleTogglePinJob}
            onDeleteManualJob={handleDeleteManualJob}
          />
        )}

        {activeTab === 'coder' && (
          <CodeWorkspace
            job={selectedJobForCoding}
            aiAvailable={aiAvailable}
            onOpenSettings={() => setIsSettingsOpen(true)}
            githubToken={settings.githubToken}
            onUpdateJob={handleFullJobUpdate}
            onOpenGitHubPush={(job, files) => {
              setGitHubPushState({ job, files });
            }}
            onUpdateJobFiles={handleUpdateJobFiles}
            onUpdateJobRepoUrl={handleUpdateJobRepoUrl}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineBoard
            jobs={jobs}
            onSelectJobForAnalysis={(job) => setSelectedJobForAnalysis(job)}
            onSelectJobForProposal={(job) => setSelectedJobForProposal(job)}
            onSelectJobForCoding={(job) => {
              setSelectedJobForCodingId(job.id);
              setActiveTab('coder');
            }}
            onMoveJobStatus={handleMoveJobStatus}
            onUpdatePriority={handleUpdatePriority}
            dailyEarningsGoal={settings.dailyEarningsGoal}
          />
        )}

        {jobToInit && (
          <GitHubWorkflowManager
            job={jobToInit}
            githubToken={settings.githubToken}
            onRepoCreated={(repoUrl) => {
              setJobs((prev) => prev.map((j) => (j.id === jobToInit.id ? { ...j, repoUrl } : j)));
              setJobToInit(null);
            }}
            autoStart={false}
          />
        )}

        {activeTab === 'autopilot' && (
          <AutoPilotPanel
            logs={logs}
            settings={settings}
            jobs={jobs}
            onUpdateSettings={(newSettings) => setSettings({ ...settings, ...newSettings })}
            onTriggerManualScan={handleQuickScan}
            isScanning={isScanning}
          />
        )}
      </main>

      {selectedJobForAnalysis && (
        <AIEvaluatorModal
          job={selectedJobForAnalysis}
          onClose={() => setSelectedJobForAnalysis(null)}
          onProceedToProposal={(job) => setSelectedJobForProposal(job)}
          onProceedToCoding={(job) => {
            setSelectedJobForCodingId(job.id);
            setActiveTab('coder');
          }}
          onUpdateAnalysis={handleUpdateAnalysis}
        />
      )}

      {selectedJobForProposal && (
        <ProposalStudioModal
          job={selectedJobForProposal}
          onClose={() => setSelectedJobForProposal(null)}
          onProceedToCoding={(job) => {
            setSelectedJobForCodingId(job.id);
            setActiveTab('coder');
          }}
          onSaveProposalToJob={handleSaveProposalToJob}
        />
      )}

      {gitHubPushState.job && (
        <GitHubDispatcher
          job={gitHubPushState.job}
          files={gitHubPushState.files}
          githubToken={settings.githubToken}
          onClose={() => setGitHubPushState({ job: null, files: {} })}
          onCompleteJob={handleCompleteJob}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          settings={settings}
          onClose={() => setIsSettingsOpen(false)}
          onSave={(newSettings) => setSettings(newSettings)}
        />
      )}
    </div>
  );
}
