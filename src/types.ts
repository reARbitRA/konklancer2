export type PlatformKey = 'all' | 'ponisha' | 'karlancer' | 'parskoders' | 'global';

export type CategoryKey = 'all' | (string & {});

export type PriorityLevel = 'High' | 'Medium' | 'Low';

export type JobCategoryTag = string;

export type RelevanceTier = 'prime' | 'digital' | 'junk';

export type LLMProviderId = 'openrouter' | 'gemini' | 'groq' | 'openai' | 'ollama' | 'custom';

export type DeliverableBlueprintMode =
  | 'auto'
  | 'deep_technical_spec'
  | 'software_mvp'
  | 'ai_workflow_automation'
  | 'data_excel_financial'
  | 'feasibility_strategy_seo'
  | 'bilingual_editorial_ux';

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
  completedAt?: string;
  /** زمان ثبت پیشنهاد (برای یادآور ۴ ساعته — SPEC-002) */
  bidAt?: string;
  /** زمان ثبت نتیجه‌ی پیشنهاد (won/lost/no_reply) */
  outcomeAt?: string;
  /** شناسه‌ی پیشنهاد در جدول bids سرور (SPEC-005) */
  bidId?: string;
  url?: string;
  source?: string;
  score?: number;
  scoreReasons?: string[];
  scrapedAt?: string;
  isManual?: boolean;
  pinned?: boolean;
  relevanceTier?: RelevanceTier;
  relevanceScore?: number;
  relevanceReason?: string;
  aiAnalysis?: AIAnalysis;
  proposal?: string;
  proposedPrice?: number;
  generatedFiles?: Record<string, string>;
  solutionCode?: Record<string, string>;
  executiveSummary?: string;
  blueprintMode?: DeliverableBlueprintMode;
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
  provider: LLMProviderId;
  endpoint: string;
  apiKey: string;
  selectedModel: string;
  availableModels?: ScannedModelItem[];
  lastPingMs?: number;
}

export interface SavedApiKeyProfile {
  id: string;
  label: string;
  provider: LLMProviderId;
  endpoint: string;
  apiKey: string;
  selectedModel: string;
  availableModels?: ScannedModelItem[];
  lastPingMs?: number;
  lastError?: string;
  enabled: boolean;
}

export interface UserSettings {
  githubToken: string;
  githubUseSSH?: boolean;
  githubSSHKey?: string;
  defaultDiscountRate: number;
  autoBidThreshold: number;
  cyborgMode: boolean;
  preferredTone: 'friendly_expert' | 'direct_urgent' | 'technical_detailed';
  dailyEarningsGoal: number;
  customLLM?: CustomLLMConfig;
  apiKeyProfiles?: SavedApiKeyProfile[];
  activeProfileId?: string;
  autoFailoverKeys?: boolean;
  /** یادآور مرورگر برای پیشنهادهای بی‌نتیجه (SPEC-002) */
  notificationsEnabled?: boolean;
  /** توکن اختیاری API سرور (SPEC-003 R5) — در صورت تنظیم KONKLANCER_API_TOKEN */
  apiToken?: string;
}
