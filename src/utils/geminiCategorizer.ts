import { categorizeJobDirect } from '../services/browserLLM';

export async function categorizeJobWithGemini(
  title: string,
  description: string,
  tags: string[] = [],
): Promise<string> {
  try {
    return await categorizeJobDirect(title, description, tags);
  } catch (err) {
    console.warn('AI Categorization fallback:', err);
    return tags[0] || 'other';
  }
}
