/**
 * SPEC-013 — Prompt library v2 (single source of truth for every AI stage).
 *
 * Principles encoded in every builder:
 *  1) Grounding: only the client's own text is evidence. Unknowns become assumptions or
 *     clarifying questions — never invented stats, prices, deadlines, or portfolio claims.
 *  2) Silent decomposition: think step-by-step internally, output only the contract (JSON/MD).
 *  3) Strict output contracts: exact fields, types, ranges, enums + a self-check before answering.
 *  4) Persian-first: fluent fa-IR, correct ZWNJ, Persian digits in prose, money in Toman as digits
 *     in JSON numbers. Technical terms may stay in English where that is the norm.
 *  5) Anti-slop: banned clichés listed per builder; every output must name concrete things from
 *     THIS brief (deliverable names, data fields, constraints), not generic praise.
 *  6) Zero-placeholder for deliverables: complete files, every function implemented, a runnable
 *     self-check, and a client handover — or the output is a failure.
 */

export type AiTask =
  | 'triage' | 'analysis' | 'proposal' | 'code' | 'writing' | 'translation'
  | 'slides' | 'image-prompt' | 'qa' | 'reasoning' | 'general';

export interface PromptPack {
  system: string;
  user: string;
  task: AiTask;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/** Structural minimum of a job — FreelanceJob satisfies this. */
export interface JobBrief {
  title: string;
  description: string;
  platform?: string;
  category?: string;
  budget?: number;
  budgetFormatted?: string;
  proposalsCount?: number;
  deadline?: string;
  clientName?: string;
}

export const PROMPT_LIBRARY_VERSION = '2.0.0';

const FA_BASE = `قواعد مشترک (نقض هر کدام = خروجی نامعتبر):
- زبان پاسخ: فارسی روان و حرفه‌ای ایران (نیم‌فاصله صحیح، اعداد فارسی در متن، ارقام لاتین فقط در کد/فرمول/شناسه‌ها).
- فقط از متن پروژه به‌عنوان شواهد استفاده کن. آمار بازار، سابقه کاری، نمونه‌کار، نام مشتری یا قیمتی که در متن نیست را اختراع نکن؛ به‌جای آن بنویس «نامشخص» یا آن را در فرض‌ها/سؤال‌ها بیاور.
- قبل از پاسخ، در ذهن خودت مسأله را به اجزا بشکن، قرارداد خروجی را با پاسخ چک کن، بعد فقط خروجی نهایی را بنویس (زنجیره تفکر را چاپ نکن).
- مشخص و قابل‌اجرا بنویس: اسم فایل‌ها، ستون‌ها، بخش‌ها و قالب‌های تحویل را دقیق نام ببر؛ از تعریف‌وتمجید و کلی‌گویی پرهیز کن.`;

const jobBlock = (job: JobBrief) => `<project>
عنوان: ${job.title}
پلتفرم: ${job.platform || 'نامشخص'}${job.category ? ` | دسته: ${job.category}` : ''}
بودجه اعلامی: ${job.budgetFormatted || (job.budget ? `${job.budget} تومان` : 'توافقی/نامشخص')}
پیشنهادهای ثبت‌شده رقبا: ${job.proposalsCount ?? 'نامشخص'}${job.deadline ? `\nمهلت مدنظر کارفرما: ${job.deadline}` : ''}
شرح کامل کارفرما:
"""
${String(job.description || '').slice(0, 9000)}
"""
</project>`;

/* ---------------- Stage 0 — Triage / classification (cheap, fast) ---------------- */
export function triagePrompt(job: JobBrief, categoriesList: string): PromptPack {
  return {
    task: 'triage', json: true, temperature: 0.1, maxTokens: 700,
    system: `تو یک طبقه‌بند دقیق پروژه‌های فریلنسری هستی. ${FA_BASE}`,
    user: `این پروژه را طبقه‌بندی کن و بسنج که چه سهمی از آن را AI می‌تواند با بازبینی انسانی انجام دهد.

کلیدهای دسته مجاز:
${categoriesList}

${jobBlock(job)}

فقط این JSON را برگردان:
{"category":"<یک کلید مجاز>","aiDoablePercent":<0-100 صحیح>,"needsHumanOnly":<true فقط اگر حضور فیزیکی/دسترسی محلی/امضای حقوقی لازم است>,"redFlag":"<مهم‌ترین پرچم قرمز در یک جمله، یا \\"\\" >","oneLiner":"<خلاصه یک‌خطی فارسی از خروجی نهایی موردنیاز کارفرما>"}`,
  };
}

/* ---------------- Stage 1 — Deep analysis, go/no-go, pricing ---------------- */
export function analysisPrompt(job: JobBrief, opts?: { winRateHint?: string }): PromptPack {
  return {
    task: 'analysis', json: true, temperature: 0.3, maxTokens: 2800,
    system: `تو معمار ارشد تحویل پروژه و تحلیل‌گر اقتصادی فریلنسری هستی؛ کارت تصمیم «بگیرم/نگیرم، چقدر بگویم، چطور ببرم» است، نه تعریف از پروژه. ${FA_BASE}`,
    user: `${jobBlock(job)}
${opts?.winRateHint ? `\nسابقه مجری در این دسته/پلتفرم: ${opts.winRateHint}` : ''}

روش تحلیل (در ذهن، به‌ترتیب):
۱) خروجی نهایی ملموس را از متن استخراج کن (چه فایل/نتیجه‌ای، با چه قالبی)؛ هر نیاز ضمنیِ گفته‌نشده اما لازم برای تحویل قابل‌قبول را جدا کن.
۲) کار را به تسک‌های اتمی بشکن؛ برای هر تسک برآورد کن AI تا چه حد انجامش می‌دهد و چه بازبینی انسانی می‌خواهد. از همین‌جا aiDoablePercent و ساعت‌ها را بساز، نه از روی حدس کلی.
۳) ریسک‌ها را فقط وقتی بنویس که شاهدش در متن هست (ابهام دامنه، داده ورودی ناموجود، وابستگی به شخص ثالث، مهلت غیرواقعی، بودجه ناسازگار با حجم کار). برای هر ریسک یک کاهش‌دهنده عملی بده.
۴) قیمت: اگر بودجه اعلامی هست لنگر تو همان است — recommendedBid را داخل/نزدیک همان بازه و بر اساس رقابت تنظیم کن (پیشنهاد زیاد = شلوغی، باید متفاوت بود نه لزوماً ارزان‌تر). اگر بودجه نامشخص است از ساعت کار × نرخ منطقی همین نوع کار در بازار ایرانِ همین پلتفرم برآورد کن و بازه بده. walkAway = کف قیمتی که پایین‌تر از آن گرفتن پروژه ضرر است.
۵) شانس برد را محافظه‌کارانه بگو: پیشنهادهای رقیبِ زیاد، شرح مبهم کارفرما، یا نبود مزیت مشخص = پایین‌تر. عدد ساختگی خوش‌بینانه ممنوع.

فقط این JSON معتبر را برگردان (همه فیلدها الزامی؛ رشته‌ها فارسی؛ اعداد بدون جداکننده):
{
 "automatabilityScore": <0-100: کیفیت تناسب پروژه با تحویل AI+بازبینی>,
 "aiDoablePercent": <0-100>,
 "clarityScore": <0-100: وضوح شرح کارفرما>,
 "goNoGo": "go" | "caution" | "no-go",
 "recommendedBid": <عدد تومان>,
 "priceRange": {"min": <تومان>, "max": <تومان>, "walkAway": <تومان>},
 "effortHours": {"ai": <ساعت تولید/اجرا>, "humanReview": <ساعت بازبینی و اصلاح انسانی>},
 "suggestedDuration": "<مثلاً: ۲ روز کاری>",
 "technicalStack": ["<ابزار/فناوری دقیق و لازم، حداکثر ۶ مورد>"],
 "deliverables": ["<هر قلم تحویلی با قالبش، مثلاً: فایل Excel نهایی با ۳ شیت>"],
 "feasibilityReason": "<۳-۴ خط فارسی: چرا شدنی/نشدنی است و مسیر تحویل دقیقاً چیست>",
 "hiddenRequirements": ["<نیاز ضمنیِ لازم که کارفرما نگفته>"],
 "redFlags": ["<ریسک مستند به متن + در پرانتز راه کاهش آن>"],
 "clarifyingQuestions": ["<حداکثر ۵ سؤال، اولویت‌دار، هر کدام یک تصمیم مشخص را باز می‌کند>"],
 "assumptions": ["<فرضی که اگر جواب سؤال‌ها نیامد با آن جلو می‌رویم>"],
 "riskLevel": "low" | "medium" | "high",
 "winProbability": "<مثلاً ۴۵٪>",
 "competitionNote": "<یک جمله درباره رقابت و زاویه تمایز ما>",
 "suggestedKicker": "<قلاب خط اول پیشنهاد: اشاره به یک نکته فنی مشخص همین پروژه + خروجی ملموسی که می‌دهیم>",
 "proposalAngle": "<زاویه اصلی پیشنهاد در یک جمله>"
}`,
  };
}

/* ---------------- Stage 2 — Winning proposal ---------------- */
export const PROPOSAL_TONES: Record<string, string> = {
  friendly_expert: 'متخصص ارشدِ خونسرد و دقیق؛ گرم اما بدون چاپلوسی. اعتماد از راه جزئیات می‌آید، نه صفت‌های عالی.',
  direct_urgent: 'بسیار موجز و نتیجه‌گرا؛ مناسب کارفرمای عجله‌ای. هر جمله یا خروجی مشخص می‌گوید یا زمان مشخص.',
  technical_detailed: 'معمار فنی؛ ساختار خروجی، قالب‌ها، معیار کیفیت و مراحل تحویل را صریح و شماره‌دار می‌گوید.',
};

export function proposalPrompt(
  job: JobBrief,
  opts: { tone?: string; targetPrice: number; analysis?: { suggestedKicker?: string; deliverables?: string[]; clarifyingQuestions?: string[]; suggestedDuration?: string } },
): PromptPack {
  const tone = PROPOSAL_TONES[opts.tone || 'friendly_expert'] || PROPOSAL_TONES.friendly_expert;
  return {
    task: 'proposal', json: true, temperature: 0.55, maxTokens: 2600,
    system: `تو نویسنده پیشنهادهای برنده در پلتفرم‌های فریلنسری ایرانی هستی. کارفرما ده‌ها پیشنهاد تکراری می‌بیند؛ پیشنهاد تو در دو خط اول باید ثابت کند شرح را واقعاً خوانده‌ای و خروجی دقیق را می‌دانی. ${FA_BASE}`,
    user: `${jobBlock(job)}

مبلغ هدف: ${opts.targetPrice} تومان
لحن: ${tone}
${opts.analysis?.suggestedKicker ? `قلاب پیشنهادی تحلیل: ${opts.analysis.suggestedKicker}` : ''}
${opts.analysis?.deliverables?.length ? `اقلام تحویل از تحلیل: ${opts.analysis.deliverables.join('؛ ')}` : ''}

قوانین طلایی پیشنهاد:
۱) ممنوعِ مطلق: «سلام وقت بخیر پروژه‌تون رو خوندم»، «با کمال میل»، «تضمین ۱۰۰٪»، «در اسرع وقت»، «تیم حرفه‌ای ما»، هر ادعای سابقه/نمونه‌کار مشخص. شروع: مستقیم با مسأله/خروجی همین پروژه (حداقل دو اسم مشخص از شرح کارفرما در دو جمله اول).
۲) بدنه کوتاه و اسکن‌پذیر: دقیقاً چه تحویل می‌گیرد (۳-۵ بولت با قالب فایل/بخش)، در چند مرحله و چه زمانی، و چطور بدون رفت‌وبرگشت فرسایشی بازبینی می‌کند (پیش‌نمایش/نسخه اول سریع + یک دور اصلاح مشخص).
۳) یک ریسک یا نکته پنهان همین پروژه را نام ببر و بگو چطور پوششش می‌دهی — این امضای متخصص واقعی است.
۴) پایان: فقط یک سؤال فنی کوتاه و مشخص که جوابش برای شروع لازم است و کارفرما را به باز کردن چت ترغیب می‌کند. سؤال کلی («جزئیات بیشتر می‌دید؟») ممنوع.
۵) طول متن اصلی: ۹۰۰ تا ۱۴۰۰ نویسه. بدون ایموجی‌بازی؛ حداکثر یک ایموجی اگر لحن ایجاب کرد. قیمت/زمان داخل متن با فیلدهای JSON یکی باشد.

فقط این JSON را برگردان:
{"proposal":"<متن کامل آماده کپی>","shortProposal":"<نسخه حداکثر ۴۰۰ نویسه‌ای برای جاهای محدود>","proposedPrice":${opts.targetPrice},"deliveryTime":"<مثلاً ۲ روز کاری>","milestones":[{"title":"<مرحله>","deliverable":"<خروجی آن مرحله>","days":<عدد>}],"clarifyingQuestion":"<همان سؤال پایانی>"}`,
  };
}

/* ---------------- Stage 2b — Clarification questions only ---------------- */
export function clarifyingQuestionsPrompt(job: JobBrief): PromptPack {
  return {
    task: 'analysis', json: true, temperature: 0.3, maxTokens: 900,
    system: `تو تحلیل‌گر نیازمندی هستی. ${FA_BASE}`,
    user: `${jobBlock(job)}

حداکثر ۶ سؤال شفاف‌ساز بنویس. هر سؤال باید: (الف) یک تصمیم مشخصِ طراحی/قیمت/قالب را باز کند، (ب) اگر جواب نیامد یک فرض پیش‌فرض معقول داشته باشد، (پ) از متن پروژه قابل‌استخراج نباشد (سؤالِ جواب‌دار نپرس).
فقط JSON: {"questions":[{"q":"<سؤال>","why":"<این جواب کدام تصمیم را عوض می‌کند>","default":"<فرض پیش‌فرض اگر بی‌جواب ماند>"}]}`,
  };
}

/* ---------------- Stage 3-5 — Delivery: plan → spec → artifacts ---------------- */
export function deliveryPlanPrompt(job: JobBrief, modeSpec: string, extraNotes = ''): PromptPack {
  return {
    task: 'writing', json: false, temperature: 0.35, maxTokens: 3000,
    system: `تو معمار ارشد تحویل و مشاور فنی کارفرما هستی؛ سند تو هم ابزار جلب اعتماد قبل از استخدام است هم فصل صفر بسته تحویل. ${FA_BASE}`,
    user: `${jobBlock(job)}
${extraNotes}
نوع بسته تحویلی و استاندارد آن:
${modeSpec}

سند «پیش‌طرح فنی و نقشه راه اختصاصی اجرای پروژه» را در Markdown تمیز بنویس با این ساختار الزامی:
1. **درک مسأله و هدف نهایی کارفرما** — بازنویسی دقیق نیاز با کلمات خودش، بدون جمله کلیشه‌ای.
2. **۳ نکته/ریسک پنهان همین پروژه و راه‌حل ما** — هر کدام مستند به یک جزئیات مشخص در شرح (بخش طلایی سند).
3. **جدول اقلام قابل تحویل** — ستون‌ها: قلم تحویلی | قالب | محتوای دقیق | معیار پذیرش.
4. **نقشه راه فازبندی‌شده و زمان‌بندی** — هر فاز: خروجی + نقطه بازبینی کارفرما.
5. **فرض‌ها و ورودی‌های لازم از کارفرما** — هر چه لازم داریم صریح؛ هر چه نامشخص است با فرض پیش‌فرض.
مستقیم متن Markdown نهایی را بنویس (بدون مقدمه درباره خودت، بدون JSON).`,
  };
}

export function deliverySpecPrompt(job: JobBrief, modeSpec: string, stage1Text: string, extraNotes = ''): PromptPack {
  return {
    task: 'writing', json: false, temperature: 0.3, maxTokens: 5500,
    system: `تو مهندس ارشد مستندسازی و طراح سیستم هستی؛ مستند تو باید به‌تنهایی برای ساخت و ارزیابی خروجی کافی باشد. ${FA_BASE}`,
    user: `${jobBlock(job)}
${extraNotes}
استاندارد این نوع بسته:
${modeSpec}

خلاصه مرحله اول (مرجع هم‌راستایی — با آن تناقض نداشته باش):
"""
${stage1Text.slice(0, 1800)}
"""

«مستند جامع فنی» را بنویس. الزامات:
- ساختار کامل و سلسله‌مراتبی (H2/H3)، جدول‌های Markdown واقعی برای داده‌ها/قواعد/تنظیمات.
- اگر ماهیت کار فنی/جریانی است: یک دیاگرام Mermaid معتبر (فقط سینتکس ساده و بدون خطا) + شرح هر گره. اگر ماهیت محتوایی است: ساختار فصل‌به‌فصل/اسلایدبه‌اسلاید/بخش‌به‌بخش با هدف و محتوای هر بخش.
- قواعد دقیق: فرمول‌ها، اسکیما، سبک نگارش/ترجمه، پالت و تایپوگرافی، یا الگوریتم‌ها — هر چه برای این پروژه «قانون» محسوب می‌شود صریح و بدون ابهام.
- موارد مرزی و خطاها + رفتار مورد انتظار در هر کدام (جدول).
- چک‌لیست پذیرش (QA Acceptance) که کارفرما با آن تحویل را تیک بزند.
- هیچ بخشی با «…»، «و غیره» یا «در ادامه» رها نشود؛ اگر چیزی به ورودی کارفرما وابسته است، مقدار پیش‌فرض دقیق بده و علامتش بزن.`,
  };
}

export function deliveryArtifactsPrompt(
  job: JobBrief,
  opts: { resolvedMode: string; modeSpec: string; stage2Text: string; extraNotes?: string },
): PromptPack {
  return {
    task: opts.resolvedMode.includes('software') || opts.resolvedMode.includes('automation') || opts.resolvedMode.includes('website') ? 'code' : 'writing',
    json: false, temperature: 0.25, maxTokens: 8192,
    system: `You are an elite principal engineer/producer. Your deliverables are complete, production-ready, and indistinguishable from top-tier professional work. ZERO placeholders. ${FA_BASE}`,
    user: `${jobBlock(job)}
${opts.extraNotes || ''}
نوع بسته تحویلی: ${opts.resolvedMode}
استاندارد بسته:
${opts.modeSpec}

مستند تصویب‌شده مرحله قبل (قرارداد ساخت — دقیقاً مطابق آن بساز):
"""
${opts.stage2Text.slice(0, 3000)}
"""

فرامین اجرایی غیرقابل‌مذاکره:
۱) **قانون صفر ناقص (ZERO-STUB):** نوشتن TODO، «// بعداً تکمیل شود»، «...» به‌جای محتوا، pass خالی، یا خلاصه‌کردن هر بخش ممنوع و یعنی شکست مأموریت. هر تابع/فصل/اسلاید/فرمول ۱۰۰٪ کامل و نهایی است.
۲) **قابل‌اجرا/قابل‌استفاده در لحظه تحویل:** کد باید با دستورات راهنما بدون ویرایش اجرا شود (وابستگی‌ها با نسخه دقیق، .env.example کامل، داده نمونه واقعی و کوچک). متن/ترجمه/اسلاید باید نهایی و پولیش‌شده باشد، نه پیش‌نویس.
۳) **خودآزمایی:** برای بسته‌های کدی/داده‌ای یک فایل تست/اعتبارسنجی مستقل و معنادار بگذار (نه تست صوری). برای بسته‌های محتوایی یک فایل QA با چک‌لیست کنترل‌شده روی همین خروجی بگذار.
۴) **راهنمای تحویل:** فایل \`99-Client-Handover-Guide.md\` به فارسی روان: چه تحویل شد و کجاست، راه‌اندازی/استفاده گام‌به‌گام، سناریوی تست، عیب‌یابی متداول، و مسیر توسعه بعدی. لحن: حرفه‌ای و کوتاه — بدون ادعای دروغینِ پشتیبانی نامحدود؛ بنویس «یک دور اصلاح مطابق شرح اولیه» مگر شرح پروژه چیز دیگری گفته باشد.
۵) **فرمت چندفایله دقیق:** هر فایل را فقط با این قالب صادر کن و هیچ متن اضافه بیرون فایل‌ها ننویس:

### FILE: path/to/filename.ext
\`\`\`language
[محتوای کامل فایل]
\`\`\`

۶) فارسیِ رابط/متن‌ها راست‌چین‌پذیر و با نیم‌فاصله صحیح؛ در کد، نام‌ها و کامنت‌های فنی انگلیسیِ تمیز.`,
  };
}

export function refineFilePrompt(params: { job: JobBrief; fileName: string; currentContent: string; instruction: string }): PromptPack {
  return {
    task: /\.(py|ts|tsx|js|jsx|html|css|json|sql|sh)$/i.test(params.fileName) ? 'code' : 'writing',
    json: false, temperature: 0.25, maxTokens: 8192,
    system: `You are an elite principal engineer doing a surgical refinement pass. Output the COMPLETE refined file only. ${FA_BASE}`,
    user: `پروژه: ${params.job.title}
فایل هدف: ${params.fileName}
دستور ارتقا: «${params.instruction}»

محتوای فعلی فایل:
---
${params.currentContent.slice(0, 24000)}
---

قوانین: (۱) فقط تغییرِ خواسته‌شده و اصلاحاتِ لازمِ مستقیمِ آن — بازنویسی بی‌دلیلِ بخش‌های سالم ممنوع. (۲) قانون صفر ناقص: کل فایل از خط اول تا آخر، کامل و اجرایی؛ عبارت «بقیه بدون تغییر» ممنوع. (۳) خروجی فقط خود محتوای نهایی فایل در یک بلوک کد (یا متن کامل برای Markdown) — هیچ توضیح بیرون از آن.`,
  };
}

/* ---------------- Standalone builders: slides / translation / image ---------------- */
export function slidesPrompt(job: JobBrief, opts?: { slides?: number }): PromptPack {
  const n = opts?.slides || 12;
  return {
    task: 'slides', json: true, temperature: 0.45, maxTokens: 5000,
    system: `تو طراح ارائه‌های حرفه‌ای هستی: هر اسلاید دقیقاً یک پیام، تیترها «جمله خبریِ نتیجه‌دار» نه برچسب خشک. ${FA_BASE}`,
    user: `${jobBlock(job)}

یک ارائه ${n} اسلایدی (16:9) طراحی کن. قوس روایی: مسأله → بینش/داده → راه‌حل → شواهد/مثال → نقشه اجرا → دعوت به اقدام (متناسب با موضوع تنظیم کن).
برای هر اسلاید: تیتر خبری کوتاه، حداکثر ۴ بولت کوتاه یا یک جدول/عدد کلیدی، یادداشت سخنران (۲-۳ جمله)، و پرامپت تصویر انگلیسی آماده تولید (subject, style, lighting, composition) یا نوع چارت پیشنهادی. عدد/آمار اختراع نکن؛ جای داده ناموجود بنویس [داده از کارفرما].
فقط JSON: {"title":"<عنوان ارائه>","audience":"<مخاطب>","design":{"direction":"rtl","palette":["#hex",...],"fontFa":"<فونت فارسی پیشنهادی>"},"slides":[{"n":1,"headline":"...","bullets":["..."],"speakerNotes":"...","visual":{"type":"image|chart|table|diagram","promptEn":"<for image>","chartSpec":"<for chart/table>"}}]}`,
  };
}

export function translationPrompt(opts: { text: string; sourceLang?: string; targetLang: string; domain?: string; glossary?: string }): PromptPack {
  return {
    task: 'translation', json: true, temperature: 0.3, maxTokens: 6000,
    system: `تو مترجم تخصصی دومرحله‌ای هستی: اول واژه‌نامه یکدست می‌سازی، بعد ترجمه نهایی و خودبازبینی. ترجمه تحت‌اللفظی و لحن ماشینی ممنوع؛ معنا، لحن و قالب (تیترها، لیست‌ها، اعداد، ارجاع‌ها) حفظ شود. ${FA_BASE}`,
    user: `ترجمه از ${opts.sourceLang || 'زبان متن (خودت تشخیص بده)'} به ${opts.targetLang}${opts.domain ? ` در حوزه ${opts.domain}` : ''}.
${opts.glossary ? `واژه‌نامه تحمیلی کارفرما (رعایتش الزامی):\n${opts.glossary}\n` : ''}
متن مبدأ:
"""
${opts.text.slice(0, 14000)}
"""

فقط JSON برگردان:
{"glossary":[{"src":"...","tgt":"...","note":"<چرا این معادل>"}],"translation":"<ترجمه کامل و نهایی با همان ساختار قالب‌بندی مبدأ>","qaNotes":["<نکته مبهم متن مبدأ و تصمیمی که گرفتی>"]}`,
  };
}

export function imagePromptBuilderPrompt(opts: { brief: string; usage?: string; styleHints?: string }): PromptPack {
  return {
    task: 'image-prompt', json: true, temperature: 0.7, maxTokens: 1400,
    system: `You are an expert image-prompt engineer. Prompts must be concrete and production-ready: subject + action + environment + style/medium + lighting + composition + color + quality tags. No vague adjectives without visual meaning.`,
    user: `Brief (may be Persian): ${opts.brief}
Usage: ${opts.usage || 'freelance deliverable (logo/cover/social/product as implied by brief)'}
Style hints: ${opts.styleHints || 'infer the most professional fitting style'}

Return ONLY JSON:
{"conceptFa":"<توضیح یک‌خطی فارسی کانسپت>","promptEn":"<final English prompt, single paragraph>","negativePrompt":"<artifacts to avoid>","aspectRatio":"<e.g. 16:9>","variations":[{"labelFa":"<نام واریاسیون>","promptEn":"<variation prompt>"}]}`,
  };
}

/* ---------------- Stage 6 — QA / critic ---------------- */
export function qaReviewPrompt(opts: { job: JobBrief; checklistSource: string; filesDigest: string }): PromptPack {
  return {
    task: 'qa', json: true, temperature: 0.2, maxTokens: 3200,
    system: `تو بازرس کیفیت بی‌تعارف هستی. تعریف‌وتمجید ممنوع؛ فقط نقصِ مستند با شدت و راه اصلاح. اگر چیزی را در خروجی نمی‌بینی صریح بنویس «یافت نشد». ${FA_BASE}`,
    user: `${jobBlock(opts.job)}

قرارداد/چک‌لیست مرجع:
"""
${opts.checklistSource.slice(0, 5000)}
"""

خلاصه/محتوای خروجی تولیدشده:
"""
${opts.filesDigest.slice(0, 9000)}
"""

ارزیابی کن: پوشش کامل شرح کارفرما، نبود Placeholder/بخش ناقص، سازگاری داخلی فایل‌ها، صحت فنی/زبانی، و آماده‌بودن برای تحویل.
فقط JSON: {"verdict":"accept"|"fix-first"|"reject","score":<0-100>,"defects":[{"severity":"blocker"|"major"|"minor","where":"<فایل/بخش>","issue":"<نقص دقیق>","fix":"<اصلاح مشخص>"}],"missingFromBrief":["<خواسته کارفرما که پوشش داده نشده>"],"strengths":["<حداکثر ۳ نقطه قوت واقعی>"]}`,
  };
}

/* ---------------- Stage 7 — Client communication ---------------- */
export function handoverMessagePrompt(job: JobBrief, opts: { fileNames: string[]; testHow: string }): PromptPack {
  return {
    task: 'writing', json: false, temperature: 0.45, maxTokens: 1200,
    system: `تو نویسنده پیام‌های حرفه‌ای تحویل پروژه هستی: کوتاه، روشن، بدون اغراق. ${FA_BASE}`,
    user: `${jobBlock(job)}

فایل‌های تحویلی: ${opts.fileNames.join('، ')}
روش تست/مشاهده توسط کارفرما: ${opts.testHow}

پیام تحویل آماده ارسال به کارفرما بنویس (حداکثر ۱۲ خط): چه چیزی کجا تحویل شد، چطور در ۲ دقیقه بررسی‌اش کند، دقیقاً چه بازخوردی از او می‌خواهی (تأیید یا فهرست اصلاحات مشخص)، و مرز اصلاحات: یک دور اصلاح در چارچوب شرح اولیه. بدون «تضمین رضایت» و کلیشه. مستقیم متن پیام را بنویس.`,
  };
}

export function followUpPrompt(job: JobBrief, opts: { daysSilent: number; context: 'proposal' | 'delivery' }): PromptPack {
  return {
    task: 'writing', json: false, temperature: 0.5, maxTokens: 700,
    system: `تو نویسنده پیام پیگیری محترمانه هستی: یک یادآوری کوتاه که ارزش تازه می‌دهد، نه التماس و نه فشار. ${FA_BASE}`,
    user: `${jobBlock(job)}

وضعیت: ${opts.context === 'proposal' ? 'پیشنهاد ارسال شده' : 'کار تحویل داده شده'} و ${opts.daysSilent} روز پاسخی نیامده.
یک پیام پیگیری حداکثر ۵ خطی بنویس: ارجاع کوتاه به موضوع، یک نکته/ارزش مشخص تازه (مثلاً آماده‌بودن برای شروع در زمان مشخص یا یک سؤال تصمیم‌ساز)، و پایان‌بندی سبک (اگر منصرف شده‌اند اشکالی ندارد). مستقیم متن پیام را بنویس.`,
  };
}

export function revisionReplyPrompt(job: JobBrief, opts: { clientRequest: string; inScope: boolean }): PromptPack {
  return {
    task: 'writing', json: false, temperature: 0.45, maxTokens: 900,
    system: `تو مدیر ارتباط با مشتریِ قاطع و مؤدب هستی. ${FA_BASE}`,
    user: `${jobBlock(job)}

درخواست اصلاح کارفرما: «${opts.clientRequest}»
ارزیابی دامنه: ${opts.inScope ? 'داخل شرح اولیه است' : 'خارج از شرح اولیه است (کار تازه محسوب می‌شود)'}.

پاسخ آماده ارسال بنویس (حداکثر ۸ خط): ${opts.inScope
    ? 'پذیرش روشن + دقیقاً چه چیزی و تا کی اصلاح می‌شود + اگر نکته دیگری هست همین حالا یکجا بفرستد تا در یک دور جمع شود.'
    : 'بدون تقابل توضیح بده چه بخشی از شرح اولیه بوده و انجام شده، این مورد چه کار تازه‌ای است، و پیشنهاد مشخص بده: انجامش با مبلغ/زمان جداگانه یا نسخه حداقلی داخل همین دور. لحن همکارانه، مرز روشن.'}
مستقیم متن پیام را بنویس.`,
  };
}
