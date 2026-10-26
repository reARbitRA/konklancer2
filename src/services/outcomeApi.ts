/**
 * کلاینت ثبت پیشنهاد و آمار نتیجه‌ها (SPEC-005).
 * توکن API اختیاری است؛ اگر در تنظیمات ثبت شده باشد با هدر x-api-token می‌رود.
 */
export type BidStatus = 'sent' | 'won' | 'lost' | 'no_reply' | 'withdrawn';

export interface BidRecord {
  id: string;
  projectId: string;
  platform: string;
  category: string;
  title: string;
  budgetBid: number;
  bidAt: string;
  status: BidStatus;
  outcomeAt: string | null;
  notes: string;
}

export interface StatsBucket {
  key: string;
  label: string;
  total: number;
  sent: number;
  won: number;
  lost: number;
  noReply: number;
  withdrawn: number;
  closed: number;
  winRate: number | null;
  replyRate: number | null;
  insufficientSample: boolean;
  sampleNote: string;
}

export interface BidStats {
  generatedAt: string;
  minSample: number;
  overall: StatsBucket;
  byPlatform: StatsBucket[];
  byCategory: StatsBucket[];
  byBudgetBand: StatsBucket[];
  recent: BidRecord[];
  calibration: { baseRate: number | null; usable: boolean; closed: number };
}

/** ارقام فارسی برای نمایش هم‌سو با بقیه‌ی UI. */
export const toPersianDigits = (value: string | number): string =>
  String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** درصد امن: null → «—» */
export const formatPercent = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? '—' : `${toPersianDigits(Math.round(value * 100))}٪`;

import { API_TOKEN_STORAGE_KEY, apiFetch, apiHeaders, readApiToken, writeApiToken } from '../utils/apiFetch';

export { API_TOKEN_STORAGE_KEY };
export const readApiTokenFromStorage = readApiToken;
export const writeApiTokenToStorage = writeApiToken;

function headers(): Record<string, string> {
  return apiHeaders({ 'content-type': 'application/json' });
}

async function parse<T>(response: Response): Promise<T> {
  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.success === false) {
    const message = payload?.error || `HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload?.code);
  }
  return payload as T;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface NewBidPayload {
  projectId: string;
  platform?: string;
  category?: string;
  title?: string;
  budgetBid?: number;
  status?: BidStatus;
  notes?: string;
  bidsAtSeen?: number;
  budgetText?: string;
}

export async function createBid(payload: NewBidPayload): Promise<BidRecord> {
  const response = await apiFetch('/api/bids', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
  const data = await parse<{ bid: BidRecord }>(response);
  return data.bid;
}

export async function updateBid(id: string, patch: { status?: BidStatus; notes?: string }): Promise<BidRecord> {
  const response = await apiFetch(`/api/bids/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify(patch),
  });
  const data = await parse<{ bid: BidRecord }>(response);
  return data.bid;
}

export async function listBids(filter: { status?: BidStatus; projectId?: string } = {}): Promise<BidRecord[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.projectId) params.set('projectId', filter.projectId);
  const query = params.toString();
  const response = await apiFetch(`/api/bids${query ? `?${query}` : ''}`, { headers: headers() });
  const data = await parse<{ bids: BidRecord[] }>(response);
  return data.bids;
}

export async function deleteBid(id: string): Promise<void> {
  const response = await apiFetch(`/api/bids/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
  await parse<{ success: boolean }>(response);
}

export async function fetchStats(): Promise<BidStats> {
  const response = await apiFetch('/api/stats', { headers: headers() });
  const data = await parse<{ stats: BidStats }>(response);
  return data.stats;
}

export interface AlertsStatus {
  enabled: boolean;
  threshold: number;
  reason: string | null;
  sentCount: number;
}

export async function fetchAlertsStatus(): Promise<AlertsStatus> {
  const response = await apiFetch('/api/alerts/status', { headers: headers() });
  const data = await parse<{ alerts: AlertsStatus }>(response);
  return data.alerts;
}

export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  sent: 'ارسال‌شده',
  won: 'برنده',
  lost: 'باخت',
  no_reply: 'بی‌پاسخ',
  withdrawn: 'انصراف',
};
