import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  AlertTriangle, 
  RefreshCw, 
  X, 
  WifiOff, 
  CheckCircle2 
} from 'lucide-react';
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
import { INITIAL_JOBS } from './data/mockJobs';
import { FreelanceJob, AIAnalysis, ActivityLogItem, UserSettings, PriorityLevel } from './types';
import { categorizeJobWithGemini } from './utils/geminiCategorizer';
import { categoryLabel, detectCategory } from '../shared/taxonomy';
import { FeedStatusBar, FeedSource } from './components/FeedStatusBar';
import { isNativeAndroidApp, isStandaloneClientMode } from './services/browserLLM';
import {
  loadInitialFeedUnified,
  runDirectTabletLiveScan,
  syncCloudFeedDirectFromGitHub,
} from './services/standaloneFeed';

/**
 * Runtime Type Guard to strictly validate incoming Socket.io data
 * against the FreelanceJob interface before state mutation
 */
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

/** فیلدهای مشتق‌شده‌ی هر پروژه (اولویت و تگ دسته) را کامل می‌کند. */
function enrichJob(job: FreelanceJob): FreelanceJob {
  // دسته از تاکسونومی مشترک می‌آید (ترجمه، گرافیک، ویدیو، صدا، کد و ...) — نه فقط چهار تگ کدنویسی.
  const categoryKey =
    job.categoryKey && job.categoryKey !== 'all'
      ? job.categoryKey
      : detectCategory(job.title, job.description).key;
  return {
    ...job,
    categoryKey,
    category: job.category || categoryLabel(categoryKey),
    priority: job.priority || (job.budget >= 6000000 ? 'High' : job.budget >= 4000000 ? 'Medium' : 'Low'),
    categorizedTag: job.categorizedTag || categoryLabel(categoryKey),
  };
}

/**
 * فید تازه را با پروژه‌های محلی کاربر ادغام می‌کند.
 * وضعیت/تحلیل/پروپوزالِ پروژه‌های شناخته‌شده دست‌نخورده می‌ماند (SPEC-005 / localStorage).
 */
function mergeFeedJobs(
  current: FreelanceJob[],
  incoming: FreelanceJob[],
  seed: FreelanceJob[] = [],
): FreelanceJob[] {
  const userTouchedMap = new Map<string, FreelanceJob>();
  const customOnly: FreelanceJob[] = [];

  for (const job of current) {
    const isTouched =
      job.status !== 'new' ||
      Boolean(job.aiAnalysis) ||
      Boolean(job.proposal) ||
      Boolean(job.generatedFiles) ||
      job.id.startsWith('custom-');
    if (isTouched) {
      userTouchedMap.set(job.id, job);
      if (job.id.startsWith('custom-')) customOnly.push(job);
    }
  }

  const incomingIds = new Set(incoming.map((j) => j.id));
  const mergedIncoming = incoming.map((job) => {
    const prev = userTouchedMap.get(job.id);
    if (!prev) return enrichJob(job);
    return enrichJob({
      ...job,
      status: prev.status,
      aiAnalysis: prev.aiAnalysis,
      proposal: prev.proposal,
      proposedPrice: prev.proposedPrice,
      generatedFiles: prev.generatedFiles,
      repoUrl: prev.repoUrl,
      completedAt: prev.completedAt,
      priority: prev.priority ?? job.priority,
    });
  });

  const preservedOffFeed = [...userTouchedMap.values()].filter(
    (j) => !incomingIds.has(j.id) && !j.id.startsWith('custom-'),
  );
  const usedIds = new Set([...incomingIds, ...userTouchedMap.keys()]);
  const seeded = seed.filter((j) => !usedIds.has(j.id)).map(enrichJob);

  return [...customOnly, ...mergedIncoming, ...preservedOffFeed, ...seeded];
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'hunter' | 'coder' | 'pipeline' | 'autopilot'>('hunter');

  // Core Data
  // پروژه‌ها از فید واقعی (/api/jobs) می‌آیند؛ از localStorage فقط برای نگه‌داشتن
  // وضعیت/تحلیل/پروپوزالِ خودِ کاربر استفاده می‌شود. داده‌ی ساختگی فقط در حالت دمو می‌آید.
  const [jobs, setJobs] = useState<FreelanceJob[]>(() => {
    const saved = localStorage.getItem('freelanceflow_jobs');
    if (!saved) return [];
    try {
      const parsed: FreelanceJob[] = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.map(enrichJob) : [];
    } catch (e) {
      console.error('Failed to parse jobs from localStorage:', e);
      return [];
    }
  });

  // SPEC-004: منبع فید و زمان آخرین اسکن
  const [feed, setFeed] = useState<{ source: FeedSource; scannedAt: string | null; scannedProjects: number }>({
    source: 'unknown',
    scannedAt: null,
    scannedProjects: 0,
  });

  const [settings, setSettings] = useState<UserSettings>(() => {
    const defaults = {
      githubToken: '',
      defaultDiscountRate: 18,
      autoBidThreshold: 85,
      cyborgMode: true,
      preferredTone: 'friendly_expert',
      dailyEarningsGoal: 5000000,
    };
    // SPEC-003 R2: the GitHub token lives only in sessionStorage; customLLM & strategy settings persist cleanly.
    let parsed: Partial<UserSettings> = {};
    let standaloneCustomLLM: UserSettings['customLLM'] | undefined;
    try {
      const saved =
        localStorage.getItem('konklancer_settings') ||
        localStorage.getItem('freelanceflow_settings');
      if (saved) parsed = JSON.parse(saved);
      const savedCustom = localStorage.getItem('freelanceflow_custom_llm');
      if (savedCustom) standaloneCustomLLM = JSON.parse(savedCustom);
    } catch (e) {
      console.error('Failed to parse settings from localStorage:', e);
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

  const [logs, setLogs] = useState<ActivityLogItem[]>([
    {
      id: 'log-1',
      timestamp: '۱۰:۴۲',
      type: 'scan',
      message: 'موتور رصد به پلتفرم‌های پونیشا، کارلانسر و پارسکدرز متصل شد.',
    },
  ]);

  // Socket.io Real-Time Client State
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  // Selected Jobs for Modals & Workspaces
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<FreelanceJob | null>(null);
  const [selectedJobForProposal, setSelectedJobForProposal] = useState<FreelanceJob | null>(null);
  const [selectedJobForCoding, setSelectedJobForCoding] = useState<FreelanceJob | null>(null);
  const [gitHubPushState, setGitHubPushState] = useState<{
    job: FreelanceJob | null;
    files: Record<string, string>;
  }>({ job: null, files: {} });
  const [jobToInit, setJobToInit] = useState<FreelanceJob | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  // فید ابری: اسکنر واقعی روی رانرهای گیت‌هاب اجرا می‌شود (سایت‌ها از این سرور قابل دسترسی نیستند)
  const [cloudInfo, setCloudInfo] = useState<{ enabled: boolean; repo?: string; status?: any }>({ enabled: false });
  const [cloudBusy, setCloudBusy] = useState(false);

  // Sync state to localStorage (keeping githubToken exclusively in sessionStorage per SPEC-003 R2)
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
      if (settings.customLLM) {
        localStorage.setItem('freelanceflow_custom_llm', JSON.stringify(settings.customLLM));
      }
    } catch (err) {
      console.warn('[settings] ذخیره تنظیمات ناموفق بود:', err);
    }
  }, [settings]);

  // SPEC-004: خواندن فید از سرور (خروجی اسکنر) به‌جای داده‌ی ساختگی.
  const refreshCloudStatus = useCallback(async () => {
    if (isNativeAndroidApp()) {
      setCloudInfo({ enabled: true, repo: 'reARbitRA/konklancer2' });
      return { enabled: true };
    }
    try {
      const res = await fetch('/api/bridge/cloud');
      const data = await res.json();
      setCloudInfo({ enabled: Boolean(data?.enabled && data?.hasToken !== false), repo: data?.repo, status: data?.status });
      return data;
    } catch {
      setCloudInfo({ enabled: true });
      return null;
    }
  }, []);

  // همگام‌سازی فید محلی با آخرین فید ابری / محلی تبلت
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

  useEffect(() => {
    const interval = setInterval(() => {
      const biddedJobs = jobsRef.current.filter(j => j.status === 'bidded');
      if (biddedJobs.length > 0 && Notification.permission === 'granted') {
        new Notification('یادآوری بررسی وضعیت پروژه‌ها', {
          body: `شما ${biddedJobs.length} پروژه در وضعیت «ارسال پیشنهاد» دارید. برای بررسی بازخوردها اقدام کنید.`,
        });
      }
    }, 4 * 60 * 60 * 1000); // 4 hours

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Sound feedback using Web Audio API
  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // AudioContext may be restricted by browser policy
    }
  };

  const addLog = (message: string, type: ActivityLogItem['type'] = 'scan') => {
    const newLog: ActivityLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  // --- فید ابری / اسکن مستقیم بومی روی تبلت اندروید ---
  const handleSyncCloudFeed = useCallback(async () => {
    setCloudBusy(true);
    try {
      const result = await syncCloudFeedDirectFromGitHub(settings.githubToken);
      addLog(result.message, 'scan');
      if (result.jobs && result.jobs.length > 0) {
        setJobs((prev) => mergeFeedJobs(prev, result.jobs!, []));
        setFeed({
          source: 'scanner',
          scannedAt: result.scannedAt ?? new Date().toISOString(),
          scannedProjects: result.total ?? result.jobs.length,
        });
      } else {
        await refreshFeed();
      }
      await refreshCloudStatus();
    } catch (err: any) {
      addLog(`همگام‌سازی فید ناموفق بود: ${err?.message ?? err}`, 'scan');
    } finally {
      setCloudBusy(false);
    }
  }, [settings.githubToken, refreshFeed, refreshCloudStatus]);

  // درخواست اسکن ابری یا اسکن زنده مستقیم روی تبلت اندروید
  const handleCloudScan = useCallback(async () => {
    if (isNativeAndroidApp()) {
      setCloudBusy(true);
      addLog('شروع اسکن زنده مستقیم از تبلت روی پارس‌کدرز، پونیشا، کارلانسر و تلگرام...', 'scan');
      try {
        const out = await runDirectTabletLiveScan((msg) => addLog(msg, 'scan'));
        setJobs((prev) => mergeFeedJobs(prev, out.jobs, []));
        setFeed({
          source: 'scanner',
          scannedAt: out.scannedAt ?? new Date().toISOString(),
          scannedProjects: out.total,
        });
        addLog(`اسکن مستقیم تبلت کامل شد: ${out.added} پروژه جدید (${out.summary})`, 'scan');
      } catch (err: any) {
        addLog(`خطا در اسکن مستقیم تبلت: ${err?.message ?? err}`, 'scan');
      } finally {
        setCloudBusy(false);
      }
      return;
    }

    setCloudBusy(true);
    addLog('درخواست اسکن ابری ثبت شد؛ رانر گیت‌هاب در حال اجرای اسکنر واقعی است...', 'scan');
    try {
      const res = await fetch('/api/bridge/cloud-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      addLog(String(data?.message ?? data?.error ?? 'درخواست اسکن ابری ثبت شد.'), 'scan');
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        const status = await refreshCloudStatus();
        if (status?.status?.phase === 'finished') {
          addLog(`اسکن ابری تمام شد (${status.status.projects_this_run ?? 0} پروژه در این اجرا).`, 'scan');
          await handleSyncCloudFeed();
          return;
        }
      }
      addLog('زمان پیگیری اسکن ابری تمام شد؛ بعداً دکمه‌ی «همگام‌سازی» را بزنید.', 'scan');
    } catch (err: any) {
      addLog(`اسکن ابری ناموفق بود: ${err?.message ?? err}`, 'scan');
    } finally {
      setCloudBusy(false);
    }
  }, [refreshCloudStatus, handleSyncCloudFeed]);

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
      setSocketError('تلاش‌های متعدد برای برقراری ارتباط با بریج با شکست مواجه شد. لطفاً اتصال اینترنت را بررسی و دکمه تلاش مجدد را فشار دهید.');
    });

    // Handle real-time push of newly discovered jobs with runtime schema validation and Gemini categorization
    socket.on('job:new', async (incomingData: unknown) => {
      // Validate incoming data against FreelanceJob interface
      if (!isValidFreelanceJob(incomingData)) {
        console.warn('[Socket.io Bridge] Received malformed job payload failing FreelanceJob validation:', incomingData);
        addLog('یک داده آگهی نامعتبر دریافت و به دلیل عدم تطابق با شمای پروژه رد شد.', 'scan');
        return;
      }

      // دسته‌بندی خودکار هنگام دریافت (تاکسونومی مشترک؛ سرور و UI یک کلید می‌دهند)
      const categoryKey =
        incomingData.categoryKey && incomingData.categoryKey !== 'all'
          ? incomingData.categoryKey
          : detectCategory(incomingData.title, incomingData.description).key;
      let categorizedTag = incomingData.categorizedTag || categoryLabel(categoryKey);
      if (!incomingData.categorizedTag) {
        categorizedTag = categoryLabel(
          await categorizeJobWithGemini(incomingData.title, incomingData.description),
        );
      }

      const priority: PriorityLevel = incomingData.priority || 
        (incomingData.budget >= 6000000 ? 'High' : incomingData.budget >= 4000000 ? 'Medium' : 'Low');

      const enrichedJob: FreelanceJob = {
        ...incomingData,
        categoryKey,
        category: incomingData.category || categoryLabel(categoryKey),
        categorizedTag,
        priority,
        tags: incomingData.tags.includes(categorizedTag) 
          ? incomingData.tags 
          : [...incomingData.tags, categorizedTag]
      };

      setJobs((prev) => {
        // Idempotency check: Guard against duplicates
        if (prev.some((j) => j.id === enrichedJob.id)) {
          return prev;
        }
        playChime();
        
        // Trigger browser notification for high-priority jobs
        if (enrichedJob.priority === 'High' && Notification.permission === 'granted') {
          new Notification(`پروژه اولویت بالا: ${enrichedJob.platform}`, {
            body: enrichedJob.title,
            icon: '/favicon.ico', // Ensure this exists or use a generic icon
          });
        }
        
        return [enrichedJob, ...prev];
      });

      addLog(
        `[پوش زنده Socket.io] پروژه جدید از ${enrichedJob.platform} با تگ هوشمند ${categorizedTag} و اولویت ${priority} دریافت شد: "${enrichedJob.title}" (${enrichedJob.budgetFormatted})`,
        'scan'
      );
    });

    // نتیجه‌ی اسکن واقعی (SPEC-004) که سرور پس از پایان کار می‌فرستد
    socket.on('scan:done', (payload: { added?: number; total?: number; scannedAt?: string | null }) => {
      setIsScanning(false);
      const added = payload?.added ?? 0;
      const total = payload?.total ?? 0;
      setFeed((prev) => ({
        ...prev,
        source: total > 0 ? 'scanner' : prev.source,
        scannedAt: payload?.scannedAt ?? prev.scannedAt,
        scannedProjects: total || prev.scannedProjects,
      }));
      addLog(`اسکن تمام شد: ${added} پروژه‌ی جدید (${total} پروژه در فید).`, 'scan');
      refreshFeed();
    });

    // Handle incoming bridge logs
    socket.on('bridge:log', (logPayload: { message: string; type?: ActivityLogItem['type'] }) => {
      if (logPayload?.message) {
        addLog(logPayload.message, logPayload.type || 'scan');
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [refreshFeed]);

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
  const handleUpdateAnalysis = (jobId: string, analysis: AIAnalysis) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, aiAnalysis: analysis } : j))
    );
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
          : j
      )
    );
    addLog(`پیشنهاد قیمت ${price.toLocaleString('fa-IR')} تومان در پایپ‌لاین ثبت گردید.`, 'bid');
  };

  const handleUpdateJobFiles = (jobId: string, files: Record<string, string>) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === jobId) {
          const updatedJob = { ...j, generatedFiles: files, status: 'in_progress' as const };
          setJobToInit(updatedJob);
          return updatedJob;
        }
        return j;
      })
    );
    addLog(`سورس کامل پروژه "${jobId}" با ایجنت کدنویسی تولید و اعتبارسنجی شد.`, 'code');
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
          : j
      )
    );
    playChime();
    addLog(`پروژه "${jobId}" در گیت‌هاب منتشر شد و درآمد آن تسویه گردید!`, 'payment');
  };

  const handleMoveJobStatus = (jobId: string, newStatus: FreelanceJob['status']) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const job = jobsRef.current.find(j => j.id === jobId);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: newStatus,
              ...(newStatus === 'completed' && !j.completedAt ? { completedAt: todayIso } : {}),
            }
          : j
      )
    );
    if (job && newStatus === 'in_progress') {
        setJobToInit({...job, status: 'in_progress'});
    }
    addLog(`وضعیت پروژه "${jobId}" به "${newStatus}" تغییر یافت.`, 'scan');
  };

  const handleUpdateJobRepoUrl = (jobId: string, repoUrl: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, repoUrl } : j))
    );
    addLog(`مخزن گیت‌هاب برای پروژه "${jobId}" با موفقیت ایجاد شد: ${repoUrl}`, 'github');
  };

  const handleUpdatePriority = (jobId: string, newPriority: PriorityLevel) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, priority: newPriority } : j))
    );
    addLog(`اولویت تسک "${jobId}" به ${newPriority} تغییر یافت.`, 'scan');
  };

  const handleAddNewManualJob = async (newJob: Partial<FreelanceJob>) => {
    const fullJob = newJob as FreelanceJob;
    // Categorize using Gemini API upon receipt
    const categoryKey =
      fullJob.categoryKey && fullJob.categoryKey !== 'all'
        ? fullJob.categoryKey
        : detectCategory(fullJob.title, fullJob.description).key;
    const categorizedTag =
      fullJob.categorizedTag ||
      categoryLabel(await categorizeJobWithGemini(fullJob.title, fullJob.description));
    const priority: PriorityLevel =
      fullJob.priority ||
      (fullJob.budget >= 6000000 ? 'High' : fullJob.budget >= 4000000 ? 'Medium' : 'Low');

    const enrichedJob: FreelanceJob = {
      ...fullJob,
      categoryKey,
      category: fullJob.category || categoryLabel(categoryKey),
      categorizedTag,
      priority,
      tags:
        fullJob.tags && fullJob.tags.includes(categorizedTag)
          ? fullJob.tags
          : [...(fullJob.tags || []), categorizedTag],
    };

    setJobs((prev) => [enrichedJob, ...prev]);
    setSelectedJobForAnalysis(enrichedJob);
    addLog(
      `پروژه دستی "${enrichedJob.title}" با تگ هوشمند ${categorizedTag} و اولویت ${priority} افزوده شد.`,
      'scan'
    );
  };

  // Revenue metrics
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const totalEarningsToday = completedJobs.reduce(
    (acc, j) => acc + (j.proposedPrice || j.budget || 0),
    0
  );
  const activeJobsCount = jobs.filter((j) => j.status !== 'completed').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onQuickScan={handleQuickScan}
        isScanning={isScanning}
        totalEarningsToday={totalEarningsToday}
        activeJobsCount={activeJobsCount}
        socketConnected={socketConnected}
      />

      {/* Persistent Socket.io Connection Error Notification Banner */}
      {socketError && (
        <div className="bg-red-950/80 border-b border-red-800/80 text-red-200 px-4 py-2.5 text-xs transition-all animate-in slide-in-from-top duration-200">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
              <span className="font-medium">
                {socketError}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-900/60 hover:bg-red-850 text-red-100 border border-red-700/60 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>{isReconnecting ? 'در حال اتصال مجدد...' : 'تلاش مجدد برای اتصال (Reconnect)'}</span>
              </button>

              <button
                onClick={() => setSocketError(null)}
                className="text-red-400 hover:text-red-200 p-1"
                title="بستن پیام"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
        {activeTab === 'hunter' && (
          <FeedStatusBar
            source={feed.source}
            scannedAt={feed.scannedAt}
            scannedProjects={feed.scannedProjects}
            jobCount={jobs.length}
            isScanning={isScanning}
            onScan={handleQuickScan}
            cloudEnabled={cloudInfo.enabled}
            cloudBusy={cloudBusy}
            onCloudScan={handleCloudScan}
            onSyncFeed={handleSyncCloudFeed}
          />
        )}
        {activeTab === 'hunter' && (
          <JobHunter
            jobs={jobs}
            onSelectJobForAnalysis={(job) => setSelectedJobForAnalysis(job)}
            onSelectJobForProposal={(job) => setSelectedJobForProposal(job)}
            onSelectJobForCoding={(job) => {
              setSelectedJobForCoding(job);
              setActiveTab('coder');
            }}
            onAddNewManualJob={handleAddNewManualJob}
          />
        )}

        {activeTab === 'coder' && (
          <CodeWorkspace
            job={selectedJobForCoding}
            githubToken={settings.githubToken}
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
              setSelectedJobForCoding(job);
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
              setJobs(prev => prev.map(j => j.id === jobToInit.id ? { ...j, repoUrl } : j));
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

      {/* Modal: AI Feasibility & Price Evaluator */}
      {selectedJobForAnalysis && (
        <AIEvaluatorModal
          job={selectedJobForAnalysis}
          onClose={() => setSelectedJobForAnalysis(null)}
          onProceedToProposal={(job) => {
            setSelectedJobForProposal(job);
          }}
          onProceedToCoding={(job) => {
            setSelectedJobForCoding(job);
            setActiveTab('coder');
          }}
          onUpdateAnalysis={handleUpdateAnalysis}
        />
      )}

      {/* Modal: Proposal Studio */}
      {selectedJobForProposal && (
        <ProposalStudioModal
          job={selectedJobForProposal}
          onClose={() => setSelectedJobForProposal(null)}
          onProceedToCoding={(job) => {
            setSelectedJobForCoding(job);
            setActiveTab('coder');
          }}
          onSaveProposalToJob={handleSaveProposalToJob}
        />
      )}

      {/* Modal: GitHub Dispatcher & Employer Delivery */}
      {gitHubPushState.job && (
        <GitHubDispatcher
          job={gitHubPushState.job}
          files={gitHubPushState.files}
          githubToken={settings.githubToken}
          onClose={() => setGitHubPushState({ job: null, files: {} })}
          onCompleteJob={handleCompleteJob}
        />
      )}

      {/* Modal: Settings */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onClose={() => setIsSettingsOpen(false)}
          onSave={(newSettings) => setSettings(newSettings)}
        />
      )}
    </div>
  );
}
