import { getCustomLLMHeaders, getCustomLLMPayload } from './customLLMClient';

// AI categoriser: calls the backend, which calls the configured LLM / Konkred gateway (SPEC-006).
export async function categorizeJobWithGemini(
  title: string,
  description: string,
  tags: string[] = [],
): Promise<string> {
  try {
    const res = await fetch('/api/ai/categorize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCustomLLMHeaders(),
      },
      body: JSON.stringify({
        title,
        description,
        tags,
        ...getCustomLLMPayload(),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.category) return tags[0] || 'other';
    return data.category;
  } catch (err) {
    console.warn('AI Categorization failed:', err);
    return tags[0] || 'other';
  }
}
