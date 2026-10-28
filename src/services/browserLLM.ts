import { Capacitor } from '@capacitor/core';
import { AIAnalysis, FreelanceJob } from '../types';
import { categoryPromptList } from '../../shared/taxonomy';
import { readApiToken } from '../utils/apiFetch';
import { requestKonkredGateway, type GatewayTaskType } from './cloudRelay';

export interface DiscoveredClientModel {
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number;
  description?: string;
}

export function hasConfiguredBrowserKey(): boolean {
  // This legacy name is retained for the app shell; only the gateway relay token
  // is required in the client. Provider keys never belong in this browser vault.
  return Boolean(readApiToken());
}

export function isNativeAndroidApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isStandaloneClientMode(): boolean {
  if (isNativeAndroidApp()) return true;
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  if (protocol === 'file:' || protocol === 'content:' || !window.location.host) return true;
  const hostname = window.location.hostname || '';
  if (hostname.endsWith('.github.io') || hostname.endsWith('.pages.dev') || hostname.endsWith('.netlify.app')) return true;
  return Boolean((window as any).__KONKLANCER_STANDALONE__);
}

export function parseJsonLooseClient<T = unknown>(raw: string): T | null {
  const cleaned = (raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  for (const candidate of [cleaned, extractBalancedBlock(cleaned)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function extractBalancedBlock(text: string): string | null {
  const startObject = text.indexOf('{');
  const startArray = text.indexOf('[');
  const start = startObject === -1 ? startArray : startArray === -1 ? startObject : Math.min(startObject, startArray);
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth += 1;
    else if (char === close && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

export async function callBrowserLLM(options: {
  prompt: string;
  systemPrompt?: string;
  taskType?: GatewayTaskType;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  cacheKey?: string;
}): Promise<{ text: string; model: string; provider: string; cached: boolean }> {
  return requestKonkredGateway({
    taskType: options.taskType || 'general',
    prompt: options.prompt,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    ...(options.json !== undefined ? { json: options.json } : {}),
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.cacheKey ? { cacheKey: options.cacheKey } : {}),
  });
}

export async function testConnectionDirect(): Promise<{
  success: boolean;
  latencyMs: number;
  model: string;
  provider: string;
  reply: string;
}> {
  const start = Date.now();
  const result = await callBrowserLLM({
    taskType: 'general',
    prompt: 'فقط بنویس: اتصال برقرار شد',
    maxTokens: 256,
    temperature: 0.1,
  });
  return {
    success: true,
    latencyMs: Date.now() - start,
    model: result.model,
    provider: result.provider,
    reply: result.text,
  };
}

export async function analyzeJobDirect(job: FreelanceJob): Promise<AIAnalysis & { model: string }> {
  const prompt = `شما معمار ارشد سیستم‌های نرم‌افزاری، هوش مصنوعی و اتوماسیون تجاری هستید.
پروژه فریلنسری زیر از پلتفرم "${job.platform || 'فریلنسری'}" را به شکل عمیق، واقع‌بینانه و مهندسی تحلیل کنید:
عنوان: ${job.title}
دسته تشخیص‌داده‌شده: ${job.category}
توضیحات کامل کارفرما: ${job.description}
بودجه اعلامی کارفرما: ${job.budgetFormatted || job.budget || 'توافقی / نامشخص'}
تعداد پیشنهادهای فعلی رقبا: ${job.proposalsCount}

خروجی را دقیقاً در قالب JSON معتبر زیر برگردانید:
{
  "automatabilityScore": 92,
  "recommendedBid": 4200000,
  "suggestedDuration": "۶ ساعت کاری (تحویل ۲ روزه)",
  "technicalStack": ["Python 3.11", "FastAPI", "Structured Markdown Spec"],
  "feasibilityReason": "تحلیل دقیق ۳ خطی به زبان فارسی درباره معماری تحویل سریع با بالاترین کیفیت و کمترین نیاز به جلسات رفت‌وبرگشتی با کارفرما",
  "riskLevel": "low",
  "winProbability": "۸۵٪",
  "suggestedKicker": "قلاب فنی دقیق برای خط اول پیشنهاد (اشاره به یک ریسک یا نکته فنی ظریف در همین پروژه که نشان دهد شما معمار واقعی کار هستید)"
}`;

  const result = await callBrowserLLM({
    taskType: 'general',
    prompt,
    json: true,
    maxTokens: 1_500,
    cacheKey: `analyze:${job.id}`,
  });
  const parsed = parseJsonLooseClient<any>(result.text) ?? {};
  const recommendedBid = Number(parsed.recommendedBid) || (job.budget ? Math.round(job.budget * 0.85) : 3_500_000);

  return {
    model: result.model,
    automatabilityScore: Number(parsed.automatabilityScore) || 90,
    recommendedBid,
    recommendedBidFormatted: `${recommendedBid.toLocaleString('fa-IR')} تومان`,
    suggestedDuration: parsed.suggestedDuration || '۱ الی ۲ روز کاری',
    technicalStack: Array.isArray(parsed.technicalStack) ? parsed.technicalStack : ['AI Architecture', 'Automation'],
    feasibilityReason: parsed.feasibilityReason || 'پروژه کاملاً دیجیتال بوده و با معماری ماژولار و مستندات مهندسی قابل تحویل یک‌ضرب است.',
    riskLevel: parsed.riskLevel === 'high' || parsed.riskLevel === 'medium' ? parsed.riskLevel : 'low',
    winProbability: parsed.winProbability || '۸۵٪',
    suggestedKicker: parsed.suggestedKicker || 'ارسال پیش‌طرح معماری و ساختار دقیق خروجی همزمان با ثبت پیشنهاد',
  };
}

export async function generateProposalDirect(
  job: FreelanceJob,
  tone: string,
  budget: number,
): Promise<{ proposal: string; proposedPrice: number; deliveryTime: string; model: string }> {
  const targetPrice = budget || (job.budget ? Math.round(job.budget * 0.85) : 3_500_000);
  const toneInstructionsMap: Record<string, string> = {
    friendly_expert: 'لحن: متخصص ارشد با تجربه کاری بین‌المللی، خوش‌فکر، شفاف، بدون اغراق و کاملاً مسلط به کار.',
    direct_urgent: 'لحن: بسیار موجز، نتیجه‌گرا و متمرکز بر تحویل سریع نسخه نهایی و تست‌شده.',
    technical_detailed: 'لحن: معمار فنی دقیق؛ ذکر صریح ساختار خروجی، استاندارد کیفیت و مستندات تحویل.',
  };

  const prompt = `شما یک مجری طراز اول در کارلانسر و پونیشا هستید که با ارسال پیشنهادهای فنی دقیق و غیرکلیشه‌ای، بالاترین نرخ برد پروژه را دارد.
عنوان پروژه: ${job.title}
شرح پروژه: ${job.description}
مبلغ پیشنهادی هدف: ${targetPrice} تومان
${toneInstructionsMap[tone] || toneInstructionsMap.friendly_expert}

قوانین طلایی:
۱. هرگز از جملات کلیشه‌ای مثل «سلام وقت بخیر پروژه شما را خواندم»، «با کمال میل»، «تضمین ۱۰۰٪» یا «در اسرع وقت» استفاده نکنید.
۲. در همان جمله اول مستقیماً سراغ اصل مسأله کارفرما بروید و بگویید دقیقاً چه ساختار/راه‌حلی برایش پیاده می‌کنید.
۳. در ۲-۳ بولت کوتاه بگویید دقیقاً چه فایل‌ها و مستندات تمیز و آماده‌ای تحویل می‌گیرد (تا خیالش راحت شود کار بدون رفت‌وبرگشت فرسایشی جمع می‌شود).
۴. در پایان یک سؤال فنی هوشمندانه و کوتاه بپرسید که کارفرما را ترغیب کند همین الان چت را با شما باز کند.

خروجی را فقط به صورت JSON برگردانید:
{
  "proposal": "متن کامل، خوش‌فرم و آماده کپی پروپوزال فارسی",
  "proposedPrice": ${targetPrice},
  "deliveryTime": "۲ روز کاری"
}`;

  const result = await callBrowserLLM({ taskType: 'general', prompt, json: true, maxTokens: 1_600 });
  const parsed = parseJsonLooseClient<any>(result.text) ?? {};
  return {
    model: result.model,
    proposal: parsed.proposal || result.text,
    proposedPrice: Number(parsed.proposedPrice) || targetPrice,
    deliveryTime: parsed.deliveryTime || '۲ روز کاری',
  };
}

export async function generateSolutionDirect(job: FreelanceJob): Promise<{ files: Record<string, string>; model: string }> {
  const { generateEnterpriseDeliverablePackage } = await import('./deliveryEngine');
  const result = await generateEnterpriseDeliverablePackage(job);
  return { files: result.files, model: result.model };
}

export async function categorizeJobDirect(
  title: string,
  description: string,
  tags: string[] = [],
): Promise<string> {
  if (!readApiToken()) return tags[0] || 'other';
  const prompt = `از بین کلیدهای زیر دقیق‌ترین دسته را برای این پروژه انتخاب کن:\n${categoryPromptList()}\nعنوان: ${title}\nتوضیح: ${description}\nفقط JSON برگردان: {"category":"key"}`;
  const result = await callBrowserLLM({
    taskType: 'extraction',
    prompt,
    json: true,
    maxTokens: 256,
    temperature: 0.1,
    cacheKey: `categorize:${title}:${description}`,
  });
  const parsed = parseJsonLooseClient<any>(result.text);
  return parsed?.category || tags[0] || 'other';
}
