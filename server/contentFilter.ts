// SPEC-003 R3: rule-based block list checked before any AI call.
// Blocks requests whose text asks for captcha/anti-bot bypass, harvesting of
// personal contact data, or forging identity/official documents.
// Pure function, no I/O. Patterns are intentionally narrow to avoid blocking
// ordinary data-entry work (e.g. "validate mobile number format" stays allowed).

export interface ContentFilterResult {
  blocked: boolean;
  reason?: string;
}

const RULES: { reason: string; pattern: RegExp }[] = [
  {
    reason: 'دور زدن کپچا یا سیستم‌های ضدربات',
    pattern: /(کپچا|کیپچا|captcha|recaptcha|hcaptcha|دور\s*زدن\s*(کپچا|ضدربات|بلاک|شناسایی|ربات)|bypass\s*(the\s*)?(captcha|anti[-\s]?bot|cloudflare|datadome|rate[-\s]?limit))/i,
  },
  {
    reason: 'استخراج شماره تماس یا داده شخصی افراد',
    pattern: /(استخراج|جمع[\s‌]*آوری|برداشت|harvest|scrape|extract)\S*\s*(شماره|موبایل|تلفن|ایمیل|آدرس\s*منزل|phone|mobile|email)/i,
  },
  {
    reason: 'جعل هویت یا مدارک رسمی',
    pattern: /(جعل|فیک|فورج|forge|fake)\S*\s*(مدرک|مدارک|هویت|کارت\s*ملی|پاسپورت|passport|diploma|id\s*card|document)/i,
  },
];

export function checkContent(...parts: Array<string | undefined | null>): ContentFilterResult {
  const text = parts.filter(Boolean).join('\n');
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { blocked: true, reason: rule.reason };
    }
  }
  return { blocked: false };
}
