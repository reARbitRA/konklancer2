import profile from './highIntent.json';
function normalize(raw: string): string {
  return raw.toLowerCase().replace(/[يئ]/g, 'ی').replace(/ك/g, 'ک').replace(/[أإآ]/g, 'ا').replace(/[\u200c\u200f\u200e\u00a0]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function isHighIntentLead(title: string, summary = ''): boolean {
  const text = normalize(`${title} ${summary}`);
  return !profile.exclude.some(term => text.includes(term)) && profile.requests.some(term => text.includes(term)) && profile.targets.some(term => normalize(title).includes(term));
}
