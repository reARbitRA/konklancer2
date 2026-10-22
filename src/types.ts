export type PlatformKey = 'all' | 'ponisha' | 'karlancer' | 'parskoders' | 'global';

// کلید دسته = کلیدهای shared/taxonomy.json (ترجمه، گرافیک، ویدیو، صدا، داده، کد و ...).
// 'all' یعنی «بدون محدودیت دسته».
export type CategoryKey = 'all' | (string & {});

export type PriorityLevel = 'High' | 'Medium' | 'Low';

// برچسب دسته‌بندی؛ حالا برچسب فارسی هر دسته‌ی تاکسونومی است، نه فقط چهار تگ کدنویسی.
export type JobCategoryTag = string;

export interface FreelanceJob {
  id: string;
  platform: string;
  platformKey: 'ponisha' | 'karlancer' | 'parskoders' | 'global';
  title: string;
  clientName: string;
  clientRating: number;
  clientReviews: number;
  budget: number;
  budgetFormatted: string;
  deadline: string;
  postedTime: string;
  category: string;
  categoryKey: CategoryKey;
  tags: string[];
  description: string;
  proposalsCount: number;
  avgBid: number;
  status: 'new' | 'bidded' | 'in_progress' | 'ready' | 'completed';
  priority?: PriorityLevel;
  categorizedTag?: JobCategoryTag;
  completedAt?: string; // ISO date e.g. '2026-10-09'
  // SPEC-004: فیلدهایی که از خروجی اسکنر می‌آیند
  url?: string; // لینک صفحه‌ی اصلی پروژه روی پلتفرم
  source?: string; // منبع اسکن (مثلاً 'parscoders' یا 'telegram:workarc')
  score?: number; // امتیاز پیش‌فیلتر قاعده‌محور (۰ تا ۱۰۰)
  scoreReasons?: string[]; // دلایل امتیاز، برای نمایش شفاف
  scrapedAt?: string; // زمان اسکن (ISO)
  aiAnalysis?: AIAnalysis;
  proposal?: string;
  proposedPrice?: number;
  generatedFiles?: Record<string, string>;
  repoUrl?: string;
}

export interface AIAnalysis {
  automatabilityScore: number;
  recommendedBid: number;
  recommendedBidFormatted: string;
  suggestedDuration: string;
  technicalStack: string[];
  feasibilityReason: string;
  riskLevel: 'low' | 'medium' | 'high';
  winProbability: string;
  suggestedKicker: string;
}

export interface ProposalResult {
  proposal: string;
  proposedPrice: number;
  proposedPriceFormatted: string;
  deliveryTime: string;
}

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  type: 'scan' | 'bid' | 'code' | 'github' | 'payment';
  message: string;
  meta?: string;
}

export interface ScannedModelItem {
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number;
  description?: string;
}

export interface CustomLLMConfig {
  enabled: boolean;
  provider: 'openrouter' | 'gemini' | 'groq' | 'openai' | 'ollama' | 'custom';
  endpoint: string;
  apiKey: string;
  selectedModel: string;
  availableModels?: ScannedModelItem[];
  lastPingMs?: number;
}

export interface UserSettings {
  githubToken: string;
  githubUseSSH: boolean;
  githubSSHKey: string;
  defaultDiscountRate: number; // e.g. 15 (%)
  autoBidThreshold: number; // e.g. 85 (%)
  cyborgMode: boolean;
  preferredTone: 'friendly_expert' | 'direct_urgent' | 'technical_detailed';
  dailyEarningsGoal: number; // Toman
  customLLM?: CustomLLMConfig;
}
