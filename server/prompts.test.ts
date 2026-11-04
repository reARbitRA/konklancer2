import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analysisPrompt, deliveryArtifactsPrompt, imagePromptBuilderPrompt, proposalPrompt,
  qaReviewPrompt, slidesPrompt, translationPrompt, triagePrompt,
} from '../shared/prompts';

const job = {
  title: 'طراحی داشبورد اکسل فروش',
  description: 'یک فایل اکسل با سه شیت و نمودار فروش ماهانه می‌خواهم. داده خام را بعداً می‌فرستم.',
  platform: 'ponisha', budget: 4_000_000, budgetFormatted: '۴٬۰۰۰٬۰۰۰ تومان', proposalsCount: 12,
};

test('analysis pack enforces the strict JSON contract with pricing and go/no-go', () => {
  const pack = analysisPrompt(job);
  assert.equal(pack.task, 'analysis');
  assert.equal(pack.json, true);
  for (const field of ['goNoGo', 'walkAway', 'aiDoablePercent', 'clarifyingQuestions', 'redFlags', 'suggestedKicker']) {
    assert.ok(pack.user.includes(field), `missing ${field}`);
  }
  assert.ok(pack.user.includes('داشبورد اکسل فروش'));
  assert.match(pack.system + pack.user, /اختراع نکن/);
});

test('proposal pack bans clichés and demands a concrete opening + one question', () => {
  const pack = proposalPrompt(job, { targetPrice: 3_800_000 });
  assert.equal(pack.task, 'proposal');
  assert.ok(pack.user.includes('تضمین ۱۰۰٪')); // present as a banned phrase
  assert.match(pack.user, /ممنوع/);
  assert.ok(pack.user.includes('clarifyingQuestion'));
  assert.ok(pack.user.includes('3800000'));
});

test('delivery artifacts pack enforces zero-stub multi-file protocol and handover', () => {
  const pack = deliveryArtifactsPrompt(job, { resolvedMode: 'data_excel_financial', modeSpec: 'SPEC-X', stage2Text: 'سند مرحله دو' });
  assert.ok(pack.user.includes('ZERO-STUB'));
  assert.ok(pack.user.includes('### FILE:'));
  assert.ok(pack.user.includes('99-Client-Handover-Guide.md'));
});

test('triage, slides, translation, image and QA packs carry their contracts', () => {
  const triage = triagePrompt(job, 'data\nother');
  assert.ok(triage.user.includes('aiDoablePercent') && triage.task === 'triage');
  const slides = slidesPrompt(job, { slides: 8 });
  assert.equal(slides.task, 'slides');
  assert.ok(slides.user.includes('speakerNotes') && slides.user.includes('8 اسلایدی'));
  const tr = translationPrompt({ text: 'Hello', targetLang: 'فارسی' });
  assert.ok(tr.user.includes('glossary') && tr.task === 'translation');
  const img = imagePromptBuilderPrompt({ brief: 'لوگوی کافی‌شاپ' });
  assert.ok(img.user.includes('promptEn') && img.user.includes('negativePrompt'));
  const qa = qaReviewPrompt({ job, checklistSource: 'چک‌لیست', filesDigest: 'فایل‌ها' });
  assert.ok(qa.user.includes('verdict') && qa.task === 'qa');
});
