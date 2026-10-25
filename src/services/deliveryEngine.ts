import { DeliverableBlueprintMode, FreelanceJob } from '../types';
import { callBrowserLLM, parseJsonLooseClient } from './browserLLM';

export interface BlueprintModeOption {
  id: Exclude<DeliverableBlueprintMode, 'auto'>;
  label: string;
  subtitle: string;
}

/**
 * استخراج قدرتمند چندفایله به سبک Claude Code و Artifacts رسمی Anthropic
 * پشتیبانی از هر دو فرمت:
 * ۱. بلوک‌های استاندارد فایل: ### FILE: filename.ext یا <artifact file="...">
 * ۲. فنس‌کد مستقیم: ```lang:filename.ext
 * ۳. فرمت شیء JSON سنتی: { "files": { "filename": "content" } }
 */
export function extractArtifactOrJsonFiles(rawText: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawText || !rawText.trim()) return result;

  // ۱. بررسی فرمت استاندارد Claude Artifacts و مارک‌داون فایل‌محور
  // الگو: ### FILE: filename.ext یا ### File: filename.ext یا <artifact file="filename.ext">
  const artifactRegex = /(?:###?\s*(?:FILE|File|فایل):\s*[`'"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9_]+)[`'"]?|<artifact[^>]*?(?:file|identifier)=["']([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9_]+)["'][^>]*?>)\s*(?:```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```|([\s\S]*?)(?=###?\s*(?:FILE|File|فایل):|<artifact|\Z))/gi;

  let match: RegExpExecArray | null;
  while ((match = artifactRegex.exec(rawText)) !== null) {
    const fileName = (match[1] || match[2] || '').trim();
    let content = match[3] !== undefined ? match[3] : match[4] || '';
    content = content.replace(/<\/artifact>\s*$/i, '').trim();
    if (fileName && content) {
      result[fileName] = content;
    }
  }

  // ۲. الگوی فنس‌کد مستقیم: ```lang:path/to/file.ext
  if (Object.keys(result).length === 0) {
    const fenceRegex = /```[a-zA-Z0-9_-]*[:\s]+(?:file=)?["']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9_]+)["']?\r?\n([\s\S]*?)\r?\n```/gi;
    while ((match = fenceRegex.exec(rawText)) !== null) {
      const fileName = match[1].trim();
      const content = match[2].trim();
      if (fileName && content) {
        result[fileName] = content;
      }
    }
  }

  // ۳. بررسی فال‌بک فرمت JSON سنتی
  if (Object.keys(result).length === 0) {
    const parsed = parseJsonLooseClient<{ files?: Record<string, string> }>(rawText);
    if (parsed?.files && typeof parsed.files === 'object') {
      for (const [k, v] of Object.entries(parsed.files)) {
        if (k && typeof v === 'string' && v.trim()) {
          result[k.trim()] = v;
        }
      }
    }
  }

  return result;
}

export const BLUEPRINT_MODES: BlueprintModeOption[] = [
  {
    id: 'deep_technical_spec',
    label: 'مستند جامع فنی و معماری مهندسی (SRS & Spec)',
    subtitle: 'معماری سیستم، دیاگرام جریان داده، جداول دیتابیس/API، شرح دقیق الگوریتم‌ها، موارد مرزی و چک‌لیست تحویل',
  },
  {
    id: 'software_mvp',
    label: 'پکیج کامل نرم‌افزار + سورس پروداکشن + مستند تحویل',
    subtitle: 'معماری مهندسی + کدهای اجرایی چندفایله کامل بدون Placeholder + تست خودکار + راهنمای استقرار کارفرما',
  },
  {
    id: 'ai_workflow_automation',
    label: 'میکروابزار، ورک‌فلو هوش مصنوعی، ربات و اتوماسیون',
    subtitle: 'خط لوله اجرایی AI / اسکرپر / بات + پرامپت‌های سیستمی مهندسی‌شده + کد کامل اجرایی + مستند بهره‌برداری',
  },
  {
    id: 'data_excel_financial',
    label: 'سیستم داده، اکسل/گوگل‌شیت پیشرفته و تحلیل مالی-آماری',
    subtitle: 'طراحی شیت‌ها و فرمول‌های دقیق آماده کپی + اسکریپت خودکارسازی Python/Apps Script + گزارش مدیریتی',
  },
  {
    id: 'feasibility_strategy_seo',
    label: 'طرح توجیهی فنی-اقتصادی / استراتژی سئو و رشد ۹۰ روزه',
    subtitle: 'گزارش جامع مدیریتی با جداول مالی/KPI، تحلیل بازار و رقبا، نقشه راه فازبندی و برنامه عملیاتی',
  },
  {
    id: 'bilingual_editorial_ux',
    label: 'بسته کپی‌رایتینگ UX/B2B، مقاله علمی و ترجمه تخصصی UK',
    subtitle: 'متن نهایی با استاندارد نشر بین‌المللی + جدول قبل/بعد + واژه‌نامه تخصصی + منطق تصمیم‌گیری محتوایی',
  },
];

export function detectOptimalBlueprintMode(job: FreelanceJob): Exclude<DeliverableBlueprintMode, 'auto'> {
  const txt = `${job.title} ${job.description} ${job.categoryKey}`.toLowerCase();
  if (/مستند|داکیومنت|شرح مراحل|پروپوزال|srs|documentation|architecture|معماری/.test(txt)) {
    return 'deep_technical_spec';
  }
  if (/طرح توجیهی|بیزینس پلن|سئو|seo|کمپین|رشد|مارکتینگ|استراتژی/.test(txt)) {
    return 'feasibility_strategy_seo';
  }
  if (/اکسل|excel|گوگل شیت|google sheets|فرمول|داشبورد|آمار|مالی|تحلیل داده|بودجه/.test(txt)) {
    return 'data_excel_financial';
  }
  if (/کپی|نویسنده|ux|ترجمه|پارافریز|مقاله|محتوا|کتاب|ویراستار|copywrit|translat/.test(txt)) {
    return 'bilingual_editorial_ux';
  }
  if (job.categoryKey === 'ai' || job.categoryKey === 'automation' || /ربات|اسکریپت|اسکرپ|ایجنت|ورک‌فلو|ورک فلو|پرامپت/.test(txt)) {
    return 'ai_workflow_automation';
  }
  return 'software_mvp';
}

export interface DeliveryProgressState {
  stage: 1 | 2 | 3;
  totalStages: 3;
  label: string;
}

const MODE_ARCHITECT_INSTRUCTIONS: Record<Exclude<DeliverableBlueprintMode, 'auto'>, string> = {
  deep_technical_spec: `خروجی اصلی باید یک «مستند جامع مهندسی و معماری فنی (Enterprise Technical Specification & Architecture Walkthrough)» در بالاترین سطح استاندارد جهانی باشد:
- خلاصه مدیریتی (Executive Summary) و تعریف دقیق دامنه و اهداف فنی پروژه
- معماری کلان و دیاگرام‌های دقیق جریان داده و توالی عملیات (با بلوک کد Mermaid استاندارد + شرح کامل هر گره)
- کالبدشکافی گام‌به‌گام ماژول‌ها، توابع، الگوریتم‌ها، روابط ریاضی/منطقی و ساختار داده‌ها
- جداول کامل Markdown برای Data Dictionary، اندپوینت‌ها/ورودی-خروجی‌ها، تنظیمات محیطی و وابستگی‌ها
- ماتریس مدیریت خطاها، موارد مرزی (Edge Cases)، امنیت، مقیاس‌پذیری و بهینه‌سازی عملکرد
- به همراه اسکریپت/ماژول نمونه مرجع کاملاً اجرایی و راهنمای گام‌به‌گام بهره‌برداری کارفرما.`,

  software_mvp: `خروجی باید یک پکیج نرم‌افزاری کاملاً ماژولار، تمیز، بدون هیچ عبارت ناقص (# TODO یا placeholder) و آماده اجرا و تحویل به کارفرما باشد:
- معماری دقیق سیستم، ساختار پوشه‌ها، مدل داده، امنیت و مدیریت خطا
- فایل‌های کامل و اجرایی سورس‌کد با تایپ‌بندی، کامنت‌گذاری مهندسی و داده‌های نمونه واقعی برای تست فوری کارفرما
- اسکریپت تست خودکار واقعی و معنادار
- مستند کامل نصب، اجرا، عیب‌یابی و تحویل رسمی به زبان فارسی روان و حرفه‌ای.`,

  ai_workflow_automation: `خروجی باید یک «میکروابزار / خط لوله اتوماسیون هوشمند (Production AI Workflow & Automation Engine)» واقعی و قابل اجرا باشد:
- معماری دقیق ورک‌فلو، زنجیره پردازش، مدیریت خطا/Retry، کشینگ و کنترل هزینه توکن
- پرامپت‌های سیستمی مهندسی‌شده (Structured Output / JSON Schema) کاملاً کالیبره‌شده برای دامنه کارفرما
- کد کامل و اجرایی پایتون یا TypeScript به همراه فایل تنظیمات .env.example و داده ورودی نمونه
- مستند رسمی تحویل و راهنمای استفاده ساده برای کارفرمای غیرفنی.`,

  data_excel_financial: `خروجی باید یک «سیستم کامل مهندسی داده، اکسل/گوگل‌شیت پیشرفته و گزارش تحلیلی» باشد که کارفرما مستقیماً از آن استفاده کند:
- طراحی دقیق ساختار شیت‌ها (ستون‌به‌ستون با نام انگلیسی/فارسی، نوع داده، Validation و Conditional Formatting)
- فرمول‌های کامل و دقیق آماده کپی‌پیست (XLOOKUP, INDEX/MATCH, SUMIFS, QUERY, ARRAYFORMULA, LET) هم با جداکننده کاما (,) و هم سمی‌کالن (;)
- اسکریپت خودکارسازی کامل (Google Apps Script / VBA / Python Pandas) برای تولید خودکار فایل نهایی .xlsx و گزارش‌ها
- فایل CSV نمونه استاندارد + داشبورد شاخص‌های کلیدی (KPI) و تفسیر مدیریتی نتایج.`,

  feasibility_strategy_seo: `خروجی باید یک «گزارش جامع مشاوره‌ای، طرح توجیهی فنی-اقتصادی یا استراتژی عملیاتی ۹۰ روزه» در سطح شرکت‌های مشاوره مدیریت تراز اول باشد:
- خلاصه مدیریتی کوبنده و تحلیل دقیق وضعیت موجود، بازار هدف، پرسونای مشتری و شکاف رقابتی
- جداول کامل برآورد هزینه‌ها، درآمدها، نقطه سربه‌سر (Break-Even)، ROI و شاخص‌های کلیدی عملکرد (KPIs)
- نقشه راه اجرایی فازبندی‌شده (هفته‌به‌هفته / ماه‌به‌ماه) با چک‌لیست اقدامات دقیق فنی و اجرایی
- ماتریس ریسک‌ها و راهکارهای کنترلی + پیوست قالب‌های عملیاتی آماده اجرا.`,

  bilingual_editorial_ux: `خروجی باید یک «بسته تحویل محتوایی، UX Writing یا ترجمه/نگارش علمی سطح بین‌المللی (Native UK English & Persian)» باشد:
- متن کامل، نهایی، روان، دقیق و پولیش‌شده متناسب با لحن برند/ژورنال علمی کارفرما
- جدول تحلیلی «قبل و بعد / منطق تصمیم‌گیری UX و کپی‌رایتینگ» که نشان دهد چرا هر بخش به این شکل طراحی شده است
- واژه‌نامه یکپارچه اصطلاحات تخصصی (Terminology & Style Guide) برای حفظ یکدستی کل برند/مقاله
- نسخه جایگزین (A/B Variant) برای تیترها، CTAها یا چکیده مدیریتی.`,
};

/**
 * موتور ۳ مرحله‌ای «شاه‌ماهی اپ» برای تولید بسته تحویل فوق‌حرفه‌ای، عمیق و کامل کارفرما
 */
export async function generateEnterpriseDeliverablePackage(
  job: FreelanceJob,
  options?: {
    mode?: DeliverableBlueprintMode;
    customBrief?: string;
    onProgress?: (state: DeliveryProgressState) => void;
    partialFilesCallback?: (files: Record<string, string>) => void;
  },
): Promise<{
  files: Record<string, string>;
  resolvedMode: Exclude<DeliverableBlueprintMode, 'auto'>;
  model: string;
}> {
  const resolvedMode =
    options?.mode && options.mode !== 'auto' ? options.mode : detectOptimalBlueprintMode(job);
  const modeSpec = MODE_ARCHITECT_INSTRUCTIONS[resolvedMode];
  const extraNotes = options?.customBrief?.trim()
    ? `\nدستورات و نکات تکمیلی اختصاصی مجری برای این کارفرما:\n${options.customBrief.trim()}\n`
    : '';

  const files: Record<string, string> = {};
  let activeModel = '';

  // ==================== STAGE 1: PRE-AWARD CLIENT PROOF + ARCHITECTURE OVERVIEW ====================
  options?.onProgress?.({
    stage: 1,
    totalStages: 3,
    label: 'مرحله ۱ از ۳: طراحی «پیش‌طرح فنی برنده پیشنهاد» و کالبدشکافی دقیق نیازمندی‌های کارفرما...',
  });

  const stage1Prompt = `شما معمار ارشد فنی و مشاور برجسته تحویل پروژه‌های سطح اول هستید.
مشخصات پروژه کارفرما:
- عنوان پروژه: ${job.title}
- پلتفرم: ${job.platform} | بودجه اعلامی: ${job.budgetFormatted}
- شرح کامل کارفرما:
${job.description}
${extraNotes}

یک سند کوتاه، فوق‌العاده حرفه‌ای، دقیق و خیره‌کننده با عنوان «پیش‌طرح فنی و نقشه راه اختصاصی اجرای پروژه» به زبان فارسی روان و مهندسی بنویسید که مجری بتواند:
هم قبل از استخدام برای جلب اعتماد ۱۰۰٪ کارفرما برایش بفرستد، و هم به عنوان «فصل صفرم (Executive Summary)» بسته تحویل نهایی باشد.

ساختار الزامی این سند Markdown:
1. **درک دقیق مسأله و هدف کلیدی کسب‌وکار کارفرما** (بدون هیچ جمله کلیشه‌ای؛ مستقیماً روی نیاز همین پروژه دست بگذارید)
2. **۳ ریسک/نکته فنی پنهان در این پروژه و راه‌حل مهندسی ما برای هر کدام** (بخش طلایی که کارفرما را شگفت‌زده می‌کند)
3. **معماری پیشنهادی و ساختار دقیق اقلام قابل تحویل (Deliverables Table)** در قالب جدول Markdown تمیز
4. **زمان‌بندی فازبندی‌شده و معیارهای تضمین کیفیت و تحویل بدون رفت‌وبرگشت**

متن را مستقیم با فرمت Markdown تمیز، خوش‌فرم و کامل بنویسید (بدون بلاک JSON).`;

  const res1 = await callBrowserLLM({
    prompt: stage1Prompt,
    maxTokens: 3000,
    temperature: 0.35,
  });
  activeModel = res1.model;
  files['00-Executive-Pitch-and-Roadmap.md'] = res1.text;
  options?.partialFilesCallback?.({ ...files });

  // ==================== STAGE 2: DEEP MASTER TECHNICAL SPECIFICATION (SRS & ARCHITECTURE) ====================
  options?.onProgress?.({
    stage: 2,
    totalStages: 3,
    label: 'مرحله ۲ از ۳: تدوین «مستند جامع معماری، طراحی سیستم، جداول فنی و جزئیات پیاده‌سازی»...',
  });

  const stage2Prompt = `بر اساس پروژه زیر و خلاصه معماری مرحله قبل، اکنون **مستند جامع و کامل فنی و مهندسی (Master Technical Specification & Deep Engineering Guide)** را با بالاترین عمق و کیفیت ممکن بنویسید.

عنوان پروژه: ${job.title}
شرح کارفرما: ${job.description}
${extraNotes}
راهنمای تخصصی این نوع پروژه:
${modeSpec}

خلاصه مرحله اول جهت هم‌راستایی کامل:
${res1.text.slice(0, 1800)}

الزامات سخت‌گیرانه کیفیت:
- این مستند باید به قدری کامل، دقیق، پرجزئیات و ساختاریافته باشد که کارفرما با دیدن آن احساس کند با یک تیم مهندسی تراز اول طرف است.
- حتماً شامل **دیاگرام معماری / جریان کار با کد Mermaid معتبر** (\`\`\`mermaid ... \`\`\`)، **جداول کامل Markdown**، **فرمول‌ها/قواعد منطقی یا اسکیمای دقیق داده‌ها**، **شرح گام‌به‌گام تمام بخش‌ها**، **موارد مرزی (Edge Cases) و مدیریت خطا**، و **چک‌لیست کنترل کیفیت (QA Acceptance Checklist)** باشد.
- هیچ بخشی را خلاصه یا با عبارت «الی آخر / ...» رها نکنید. مستقیماً متن کامل Markdown را تولید کنید.`;

  const res2 = await callBrowserLLM({
    prompt: stage2Prompt,
    maxTokens: 5500,
    temperature: 0.3,
  });
  activeModel = res2.model;
  files['01-Master-Technical-Specification.md'] = res2.text;
  options?.partialFilesCallback?.({ ...files });

  // ==================== STAGE 3: COMPLETE PRODUCTION ARTIFACTS & CLIENT HANDOVER GUIDE ====================
  options?.onProgress?.({
    stage: 3,
    totalStages: 3,
    label: 'مرحله ۳ از ۳: تولید فایل‌های اجرایی کامل پروداکشن به سبک کلاود و «راهنمای رسمی تحویل»...',
  });

  const stage3Prompt = `<role_and_authority>
You are an Elite Staff Principal Systems Architect and Lead Production Engineer.
Your code is indistinguishable from top 1% senior engineering staff at Google, Stripe, and Anthropic.
You produce complete, resilient, enterprise-grade, battle-tested software packages ready for immediate deployment.
</role_and_authority>

<task_context>
عنوان پروژه: ${job.title}
پلتفرم: ${job.platform} | بودجه کارفرما: ${job.budgetFormatted}
شرح کارفرما:
${job.description}
نوع بسته تحویلی: ${resolvedMode}
${extraNotes}

مستند معماری تصویب‌شده در مرحله قبل:
${res2.text.slice(0, 3000)}
</task_context>

<anthropic_execution_mandates>
۱. تفکر معماری قبل از کدنویسی (<thinking>):
ابتدا درون بلوک <thinking> نیازمندی‌های دقیق، قراردادهای ورودی-خروجی، جریان خطا، و وابستگی‌ها را تحلیل کنید.

۲. قانون سفت‌وسخت عدم استفاده از هرگونه Placeholder یا کد ناقص (ZERO-STUB MANDATE):
- نوشتن هرگونه عبارتی نظیر \`// TODO\`, \`// implement here\`, \`pass\`, \`# add logic later\`, \`...\` یا \`// rest of code remains the same\` یک نقض بحرانی است.
- تمام توابع، اعتبارسنجی‌ها، ریجکس‌ها، کلاس‌ها، روت‌ها و هندلرهای خطا باید ۱۰۰٪ به صورت کامل، عملیاتی و بدون نقص پیاده‌سازی شوند.
- بسته‌های پایتون یا Node باید دارای فایل کامل \`requirements.txt\` (با ورژن‌های دقیق پین‌شده) یا \`package.json\` باشند.
- فایل تنظیمات نمونه (\`.env.example\` یا \`config.py\`) باید تمام متغیرهای محیطی با توضیحات کامل را در بر داشته باشد.

۳. فایل تست خودکار و اعتبارسنجی (Self-Verification Suite):
حتماً یک فایل تست خودکار مستقل و قابل اجرا (مثلاً \`test_verification.py\` یا \`verify_pipeline.py\`) قرار دهید که کارفرما بتواند فوراً صحت کارکرد سیستم را بسنجد.

۴. سند جامع و شکیل تحویل به کارفرما (\`99-Client-Handover-Guide.md\`):
یک راهنمای گام‌به‌گام تحویل با بالاترین شأن مهندسی و احترام به کارفرما به زبان فارسی فصیح شامل:
- خلاصه اجرایی و ویژگی‌های کلیدی تحویل‌شده
- پیش‌نیازها و دستورات تک‌خطی راه‌اندازی (Setup & Quickstart)
- سناریوهای تست و راستی‌آزمایی
- راهنمای عیب‌یابی موارد مرزی (Troubleshooting & FAQ)
- تعهد پشتیبانی و ارتقای آتی.

۵. فرمت خروجی چندفایله (Claude Artifacts Format):
برای حفظ بی‌نقص کاراکترها و فرمت فایل‌ها، هر فایل را دقیقاً با ساختار زیر صادر کنید:

### FILE: path/to/filename.ext
\`\`\`language
[کد یا متن ۱۰۰٪ کامل، بدون خلاصه و آماده اجرا]
\`\`\`
</anthropic_execution_mandates>`;

  const res3 = await callBrowserLLM({
    prompt: stage3Prompt,
    json: false,
    maxTokens: 8192,
    temperature: 0.2,
  });
  activeModel = res3.model;

  const extractedFiles = extractArtifactOrJsonFiles(res3.text);
  if (Object.keys(extractedFiles).length > 0) {
    for (const [k, v] of Object.entries(extractedFiles)) {
      if (k && typeof v === 'string' && v.trim()) {
        files[k] = v;
      }
    }
  } else {
    files['02-Complete-Deliverable-Implementation.md'] = res3.text;
  }

  options?.partialFilesCallback?.({ ...files });
  return { files, resolvedMode, model: activeModel };
}

/**
 * بازطراحی، تعمیق یا افزودن بخش دلخواه روی فایل فعلی یا کل بسته با دستور مستقیم کاربر
 */
export async function refineSingleDeliverableFile(params: {
  job: FreelanceJob;
  fileName: string;
  currentContent: string;
  instruction: string;
}): Promise<{ updatedContent: string; model: string }> {
  const prompt = `<role>
You are an Elite Staff Principal Engineer and Lead Code Reviewer.
Your task is to refine, upgrade, or extend the specified file strictly adhering to the highest standards of code completeness, defensive programming, and architecture.
</role>

<context>
پروژه: ${params.job.title}
نام فایل هدف: ${params.fileName}
دستور ارتقای کاربر:
«${params.instruction}»

محتوای فعلی فایل:
---
${params.currentContent}
---
</context>

<rules>
۱. قانون ممنوعیت خلاصه یا کوتاه‌سازی: تحت هیچ شرایطی از عباراتی نظیر "// کدهای قبلی بدون تغییر می‌مانند" یا "// TODO" استفاده نکنید. کل فایل باید از خط اول تا خط آخر به صورت ۱۰۰٪ کامل و اجرایی تولید شود.
۲. فرمت خروجی: فقط و فقط خود محتوای نهایی فایل را در یک بلوک کد مناسب صادر کنید (یا متن کامل اگر فایل مارک‌داون است).
</rules>`;

  const res = await callBrowserLLM({
    prompt,
    maxTokens: 8192,
    temperature: 0.2,
  });
  return { updatedContent: res.text, model: res.model };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** تبدیل تمیز Markdown + بلوک‌های کد و جداول به HTML رسمی قابل چاپ A4 / PDF / Word برای ارائه شیک به کارفرما */
export function renderMarkdownToRichHtml(md: string): string {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let tableBuf: string[] = [];

  const flushTable = () => {
    if (tableBuf.length === 0) return;
    const rows = tableBuf
      .map((r) =>
        r
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim()),
      )
      .filter((cells) => !cells.every((c) => /^[-:\s]+$/.test(c)));
    if (rows.length > 0) {
      out.push('<div class="table-wrap"><table><thead><tr>');
      rows[0].forEach((h) => out.push(`<th>${formatInline(h)}</th>`));
      out.push('</tr></thead><tbody>');
      rows.slice(1).forEach((r) => {
        out.push('<tr>');
        r.forEach((c) => out.push(`<td>${formatInline(c)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table></div>');
    }
    tableBuf = [];
  };

  function formatInline(txt: string): string {
    return escapeHtml(txt)
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushTable();
      if (!inCode) {
        inCode = true;
        codeLang = line.trim().slice(3).trim() || 'code';
        codeBuf = [];
      } else {
        out.push(
          `<div class="code-card"><div class="code-header">${escapeHtml(codeLang.toUpperCase())}</div><pre dir="ltr"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre></div>`,
        );
        inCode = false;
        codeLang = '';
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      tableBuf.push(line);
      continue;
    } else {
      flushTable();
    }

    const trimmed = line.trim();
    if (!trimmed) {
      out.push('<div class="spacer"></div>');
    } else if (trimmed.startsWith('#### ')) {
      out.push(`<h4>${formatInline(trimmed.slice(5))}</h4>`);
    } else if (trimmed.startsWith('### ')) {
      out.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      out.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      out.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
    } else if (/^[-*•]\s+/.test(trimmed)) {
      out.push(`<div class="bullet-item"><span class="dot">◆</span><div>${formatInline(trimmed.replace(/^[-*•]\s+/, ''))}</div></div>`);
    } else if (/^[\d۰-۹]+[.)]\s+/.test(trimmed)) {
      const m = trimmed.match(/^([\d۰-۹]+[.)])\s+(.*)$/);
      out.push(`<div class="bullet-item"><span class="num">${escapeHtml(m?.[1] || '•')}</span><div>${formatInline(m?.[2] || trimmed)}</div></div>`);
    } else if (trimmed.startsWith('>')) {
      out.push(`<blockquote>${formatInline(trimmed.slice(1).trim())}</blockquote>`);
    } else if (/^---+$/.test(trimmed)) {
      out.push('<hr />');
    } else {
      out.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  flushTable();
  if (inCode && codeBuf.length > 0) {
    out.push(`<div class="code-card"><pre dir="ltr"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre></div>`);
  }

  return out.join('\n');
}

/** تولید سند رسمی و شیک قابل ارائه مستقیم به کارفرما (چاپ PDF A4 یا ذخیره Word .doc) */
export function buildExecutiveClientDocumentHtml(
  job: FreelanceJob,
  files: Record<string, string>,
  selectedOnlyFile?: string,
): string {
  const entries = selectedOnlyFile && files[selectedOnlyFile]
    ? [[selectedOnlyFile, files[selectedOnlyFile]] as const]
    : Object.entries(files);

  const dateFa = new Date().toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const sectionsHtml = entries
    .map(([fileName, content], idx) => {
      const isMarkdown = fileName.endsWith('.md') || fileName.endsWith('.txt');
      const bodyHtml = isMarkdown
        ? renderMarkdownToRichHtml(content)
        : `<div class="code-card"><div class="code-header">${escapeHtml(fileName)}</div><pre dir="ltr"><code>${escapeHtml(content)}</code></pre></div>`;

      return `
        <section class="doc-section">
          <div class="section-ribbon">
            <span class="badge-num">بخش ${(idx + 1).toLocaleString('fa-IR')}</span>
            <span class="file-title">${escapeHtml(fileName)}</span>
          </div>
          ${bodyHtml}
        </section>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>مستند رسمی تحویل پروژه — ${escapeHtml(job.title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: 'Vazirmatn', Tahoma, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 32px 20px;
      line-height: 1.9;
    }
    .container {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      padding: 44px 48px;
      box-shadow: 0 12px 36px rgba(15, 23, 42, 0.06);
    }
    .cover-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #f8fafc;
      padding: 32px 36px;
      border-radius: 14px;
      margin-bottom: 36px;
      border-right: 6px solid #10b981;
    }
    .cover-kicker {
      font-size: 12px;
      color: #34d399;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .cover-title {
      font-size: 23px;
      font-weight: 800;
      margin: 0 0 18px 0;
      line-height: 1.5;
      color: #ffffff;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid rgba(148, 163, 184, 0.25);
      font-size: 12px;
      color: #cbd5e1;
    }
    .meta-grid strong { color: #ffffff; display: block; font-size: 13px; margin-top: 2px; }
    .print-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding: 12px 18px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 12px;
      font-size: 13px;
      color: #065f46;
    }
    .print-btn {
      background: #059669;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    }
    .doc-section {
      margin-bottom: 42px;
      padding-bottom: 28px;
      border-bottom: 2px dashed #e2e8f0;
    }
    .section-ribbon {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f1f5f9;
      border-right: 4px solid #0284c7;
      padding: 10px 16px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .badge-num {
      background: #0284c7;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 10px;
      border-radius: 99px;
    }
    .file-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      direction: ltr;
    }
    h1 { font-size: 20px; color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 8px; margin-top: 26px; }
    h2 { font-size: 17px; color: #0369a1; margin-top: 24px; }
    h3 { font-size: 15px; color: #1e293b; margin-top: 18px; }
    h4 { font-size: 14px; color: #334155; margin-top: 14px; }
    p { margin: 8px 0; font-size: 14px; color: #1e293b; text-align: justify; }
    .bullet-item { display: flex; gap: 10px; align-items: flex-start; margin: 6px 0; font-size: 14px; color: #1e293b; }
    .bullet-item .dot { color: #10b981; font-size: 11px; margin-top: 5px; }
    .bullet-item .num { color: #0284c7; font-weight: 700; min-width: 24px; }
    blockquote {
      background: #f0f9ff;
      border-right: 4px solid #0284c7;
      margin: 14px 0;
      padding: 12px 16px;
      border-radius: 8px;
      color: #0c4a6e;
      font-size: 13.5px;
    }
    .inline-code {
      font-family: 'JetBrains Mono', monospace;
      background: #f1f5f9;
      color: #be123c;
      padding: 1px 6px;
      border-radius: 5px;
      font-size: 12.5px;
      direction: ltr;
      unicode-bidi: embed;
    }
    .code-card {
      margin: 16px 0;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid #1e293b;
      background: #0f172a;
    }
    .code-header {
      background: #1e293b;
      color: #38bdf8;
      padding: 6px 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      text-align: left;
      direction: ltr;
    }
    pre {
      margin: 0;
      padding: 16px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12.5px;
      line-height: 1.65;
      color: #e2e8f0;
      text-align: left;
      direction: ltr;
    }
    .table-wrap { overflow-x: auto; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #0f172a; color: #ffffff; padding: 10px 12px; text-align: right; border: 1px solid #334155; }
    td { padding: 9px 12px; border: 1px solid #cbd5e1; color: #1e293b; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .spacer { height: 6px; }
    @media print {
      body { background: #fff; padding: 0; }
      .container { box-shadow: none; border: none; padding: 12px; max-width: 100%; }
      .print-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="print-bar">
      <span>امکان ذخیره مستقیم به صورت <strong>PDF</strong> از طریق دکمه چاپ مرورگر فراهم است.</span>
      <button class="print-btn" onclick="window.print()">چاپ / ذخیره به صورت PDF</button>
    </div>
    <div class="cover-header">
      <div class="cover-kicker">بسته مستندات مهندسی، طراحی معماری و تحویل نهایی پروژه</div>
      <h1 class="cover-title" style="border:none;padding:0;margin:0 0 16px 0;color:#fff;">${escapeHtml(job.title)}</h1>
      <div class="meta-grid">
        <div>پلتفرم مرجع<strong>${escapeHtml(job.platform)}</strong></div>
        <div>دسته‌بندی تخصصی<strong>${escapeHtml(job.category)}</strong></div>
        <div>برآورد / بودجه پروژه<strong>${escapeHtml(job.budgetFormatted)}</strong></div>
        <div>تاریخ تدوین مستند<strong>${escapeHtml(dateFa)}</strong></div>
      </div>
    </div>
    ${sectionsHtml}
  </div>
</body>
</html>`;
}
