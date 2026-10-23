import { normalizePersianText } from './taxonomy';

export type RelevanceTier = 'prime' | 'digital' | 'junk';

export interface RelevanceVerdict {
  tier: RelevanceTier;
  relevanceScore: number; // 0..100
  reason: string;
}

interface RulePattern {
  label: string;
  terms: string[];
}

/**
 * الگوهای قطعی پروژه‌های نامربوط، تبلیغاتی، منقضی، حضوری، تماس تلفنی، ساختمانی/تأسیساتی
 * یا نرم‌افزارهای شبیه‌سازی سنگین صنعتی/آزمایشگاهی که ربطی به تحویل دیجیتال و هوش مصنوعی ندارند.
 */
const JUNK_RULES: RulePattern[] = [
  {
    label: 'آگهی تبلیغاتی یا اطلاعیه داخلی کانال',
    terms: [
      'فیلتر شکن',
      'فیلترشکن',
      'کانفیگ ایپی ثابت',
      'اپدیت هفتگی ربات',
      'نسخه دسکتاپ ارک رام',
      'هر گونه مشکلی در رابط کاربری ربات',
      'برگ برنده ای که میتونه رزومه',
      'ورورد به ربات',
      'مهلت تمام شده',
      'واگذار شده به',
    ],
  },
  {
    label: 'کار حضوری یا مقیم در محل شرکت',
    terms: [
      'حضوری در تهران',
      'حضوری در مشهد',
      'حضوری در اصفهان',
      'حضوری در کرج',
      'حضوری در تبریز',
      'استخدام حضوری',
      'بازاریاب حضوری',
      'ویزیتور حضوری',
      'فقط حضوری',
      'محل کار حوالی',
    ],
  },
  {
    label: 'فروش تلفنی، کال‌سنتر و تماس مستقیم با مشتری (درگیری انسانی بالا)',
    terms: [
      'فروش تلفنی',
      'بازاریابی تلفنی',
      'کارشناس فروش تلفنی',
      'تماس تلفنی با لیدها',
      'تماس تلفنی با مشتریان',
      'telephone_marketing',
      'تله مارکتینگ',
      'اپراتور تلفن',
    ],
  },
  {
    label: 'خرید و فروش اکانت / اسپم / ثبت‌نام انبوه دستی',
    terms: [
      'خرید حساب لینکدین',
      'خرید اکانت',
      'ساخت جیمیل',
      'اکانت وریفای شده',
      'ربات کامنت گذار اسپم',
      'تکمیل پرسشنامه',
    ],
  },
  {
    label: 'اجرای ساختمانی، تأسیساتی، کارگاهی یا سخت‌افزاری فیزیکی',
    terms: [
      'ایزوگام',
      'قیرگونی',
      'لوله کشی فاضلاب',
      'سیم کشی ساختمان',
      'نصب دوربین مداربسته',
      'جوشکاری',
      'نجاری',
      'کابینت سازی',
      'طراحی شفت',
      'اسیاب چکشی',
      'برد الکترونیکی',
      'کنترلر لامپ',
      'ساخت دستگاه nfc',
      'اردوینو',
      'arduino',
    ],
  },
  {
    label: 'نقشه‌کشی معماری/عمران یا شبیه‌سازی آزمایشگاهی سنگین غیرمرتبط',
    terms: [
      'وال سکشن',
      'مبحث ۱۹',
      'مبحث 19',
      'پوینت کلود',
      'مدلسازی رویت',
      'مدل سازی پروژه بیمارستانی',
      'طراحی فنی معماری ساختمان',
      'مدیریت ساخت',
      'سیماتیک',
      'simatic',
      'plc',
      'کامسول',
      'comsol',
      'سیلواکو',
      'silvaco',
      'star ccm',
      'star-ccm',
      'اباکوس',
      'abaqus',
      'کتیا',
      'catia',
      'solidworks',
      'سالیدورک',
      'fluent',
      'فلوئنت',
      'ونسیم',
      'vensim',
      'موهو',
      'کارتون انیماتور',
      'فایل تذهیب',
      'نرم افزار کورل',
    ],
  },
];

/**
 * سیگنال‌های طلایی برای تحویل سریع تک‌نفره با کمک هوش مصنوعی، کدنویسی، اتوماسیون، داده و زبان انگلیسی تخصصی
 */
const PRIME_SIGNALS: string[] = [
  'پایتون',
  'python',
  'جاوا اسکریپت',
  'javascript',
  'typescript',
  'react',
  'next.js',
  'nextjs',
  'node',
  'fastapi',
  'django',
  'laravel',
  'php',
  'api',
  'وب سایت',
  'وبسایت',
  'اپلیکیشن تحت وب',
  'وب اپلیکیشن',
  'پلتفرم',
  'مارکت پلیس',
  'سامانه هوشمند',
  'وردپرس',
  'ووکامرس',
  'هوش مصنوعی',
  'ایجنت',
  'ورک فلو',
  'پرامپت',
  'چت بات',
  'ربات تلگرام',
  'مینی اپ',
  'اسکریپت',
  'اسکرپینگ',
  'اتوماسیون',
  'خودکارسازی',
  'اکسل',
  'excel',
  'گوگل شیت',
  'google sheets',
  'فرمول نویسی',
  'داشبورد',
  'تحلیل اماری',
  'تحلیل مالی',
  'تحلیل داده',
  'مستندات فنی',
  'مستندسازی',
  'طرح توجیهی',
  'بیزینس پلن',
  'پروپوزال',
  'کپی رایتر',
  'کپی رایتینگ',
  'نویسنده ux',
  'بازنویسی متن',
  'مقاله علمی',
  'مقاله انگلیسی',
  'ترجمه انگلیسی',
  'ترجمه تخصصی',
  'ترجمه کتاب',
  'پارافریز',
  'سئو فنی',
  'سئو سایت',
  'seo',
  'استراتژی محتوا',
];

const PRIME_CATEGORIES = new Set([
  'ai',
  'automation',
  'dev',
  'data',
  'docs',
  'writing',
  'translation',
  'marketing',
  'uiux',
]);

export function evaluateProjectRelevance(
  title: string,
  description: string,
  categoryKey: string,
  tags: string[] = [],
): RelevanceVerdict {
  const fullNorm = normalizePersianText(`${title} ${description} ${tags.join(' ')}`);
  const titleNorm = normalizePersianText(title);

  if (!titleNorm || titleNorm.length < 4) {
    return { tier: 'junk', relevanceScore: 0, reason: 'عنوان ناقص یا خالی' };
  }

  // ۱. بررسی قوانین حذف قطعی (آگهی‌های نامربوط، حضوری، تلفنی، صنعتی/ساختمانی، تبلیغاتی)
  for (const rule of JUNK_RULES) {
    for (const term of rule.terms) {
      const normTerm = normalizePersianText(term);
      if (normTerm && fullNorm.includes(normTerm)) {
        return {
          tier: 'junk',
          relevanceScore: 8,
          reason: `حذف خودکار: ${rule.label} («${term}»)`,
        };
      }
    }
  }

  // ۲. شمارش سیگنال‌های طلایی (قابل تحویل سریع با هوش مصنوعی، کد، داده، مستندات و انگلیسی تخصصی)
  let primeHits = 0;
  const matchedSignals: string[] = [];
  for (const sig of PRIME_SIGNALS) {
    const normSig = normalizePersianText(sig);
    if (titleNorm.includes(normSig)) {
      primeHits += 2;
      if (matchedSignals.length < 3) matchedSignals.push(sig);
    } else if (fullNorm.includes(normSig)) {
      primeHits += 1;
      if (matchedSignals.length < 3) matchedSignals.push(sig);
    }
  }

  if (PRIME_CATEGORIES.has(categoryKey) && primeHits >= 1) {
    const score = Math.min(99, 68 + primeHits * 6);
    return {
      tier: 'prime',
      relevanceScore: score,
      reason: matchedSignals.length
        ? `تناسب بالا برای تحویل با AI (${matchedSignals.join('، ')})`
        : 'پروژه دیجیتال قابل تحویل مستقیم با ابزارهای هوش مصنوعی',
    };
  }

  if (PRIME_CATEGORIES.has(categoryKey)) {
    return {
      tier: 'prime',
      relevanceScore: 65,
      reason: 'منطبق با دسته‌های تخصصی نرم‌افزار، مستندات، داده و محتوا',
    };
  }

  if (categoryKey === 'other' && primeHits === 0) {
    return {
      tier: 'junk',
      relevanceScore: 20,
      reason: 'خارج از حوزه‌های تخصصی نرم‌افزار، هوش مصنوعی، داده و مستندات',
    };
  }

  return {
    tier: 'digital',
    relevanceScore: 52,
    reason: 'پروژه دیجیتال عمومی (گرافیک / ویدیو / رسانه)',
  };
}
