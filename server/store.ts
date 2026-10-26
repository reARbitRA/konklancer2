/**
 * SQLite persistence for bid outcomes (SPEC-005).
 *
 * Uses Node's built-in `node:sqlite` so no native dependency is required.
 * The database lives at `data/konklancer.db` (git-ignored); tests can point
 * `KONKLANCER_DB_PATH` at `:memory:`.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export type BidStatus = 'sent' | 'won' | 'lost' | 'no_reply' | 'withdrawn';
export const BID_STATUSES: BidStatus[] = ['sent', 'won', 'lost', 'no_reply', 'withdrawn'];

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

export interface NewBidInput {
  projectId: string;
  platform?: string;
  category?: string;
  title?: string;
  budgetBid?: number;
  status?: BidStatus;
  bidAt?: string;
  notes?: string;
}

type Row = {
  id: string;
  project_id: string;
  platform: string | null;
  category: string | null;
  title: string | null;
  budget_bid: number | null;
  bid_at: string;
  status: string;
  outcome_at: string | null;
  notes: string | null;
};

const toRecord = (row: Row): BidRecord => ({
  id: row.id,
  projectId: row.project_id,
  platform: row.platform ?? '',
  category: row.category ?? '',
  title: row.title ?? '',
  budgetBid: Number(row.budget_bid ?? 0),
  bidAt: row.bid_at,
  status: (BID_STATUSES.includes(row.status as BidStatus) ? row.status : 'sent') as BidStatus,
  outcomeAt: row.outcome_at,
  notes: row.notes ?? '',
});

export class BidStore {
  private db: DatabaseSync;

  constructor(dbPath: string = defaultDbPath()) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bids (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        platform TEXT,
        category TEXT,
        title TEXT,
        budget_bid REAL,
        bid_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent',
        outcome_at TEXT,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS projects_seen (
        project_id TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        bids_at_seen INTEGER,
        budget_text TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);
      CREATE INDEX IF NOT EXISTS idx_bids_project ON bids(project_id);
    `);
  }

  /** ثبت یک پیشنهاد ارسالی توسط کاربر (هیچ ارسال خودکاری وجود ندارد). */
  recordBid(input: NewBidInput): BidRecord {
    const projectId = String(input.projectId ?? '').trim();
    if (!projectId) throw new BidStoreError('projectId الزامی است.', 'INVALID_PROJECT');
    const status = input.status && BID_STATUSES.includes(input.status) ? input.status : 'sent';
    const bidAt = normalizeIso(input.bidAt) ?? new Date().toISOString();
    const id = randomUUID();
    const outcomeAt = status === 'sent' ? null : new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO bids (id, project_id, platform, category, title, budget_bid, bid_at, status, outcome_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        projectId,
        String(input.platform ?? '').slice(0, 80),
        String(input.category ?? '').slice(0, 120),
        String(input.title ?? '').slice(0, 300),
        Number.isFinite(Number(input.budgetBid)) ? Number(input.budgetBid) : 0,
        bidAt,
        status,
        outcomeAt,
        String(input.notes ?? '').slice(0, 2000),
      );
    return this.getBid(id) as BidRecord;
  }

  getBid(id: string): BidRecord | null {
    const row = this.db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as Row | undefined;
    return row ? toRecord(row) : null;
  }

  listBids(filter: { status?: BidStatus; projectId?: string; limit?: number } = {}): BidRecord[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.projectId) {
      clauses.push('project_id = ?');
      params.push(filter.projectId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(filter.limit ?? 500), 1), 5000);
    const rows = this.db
      .prepare(`SELECT * FROM bids ${where} ORDER BY bid_at DESC LIMIT ${limit}`)
      .all(...params) as Row[];
    return rows.map(toRecord);
  }

  /** تغییر وضعیت نتیجه‌ی یک پیشنهاد. */
  updateBid(id: string, patch: { status?: BidStatus; notes?: string; budgetBid?: number }): BidRecord | null {
    const existing = this.getBid(id);
    if (!existing) return null;
    const status = patch.status && BID_STATUSES.includes(patch.status) ? patch.status : existing.status;
    const outcomeAt = status === 'sent' ? null : existing.outcomeAt ?? new Date().toISOString();
    const notes = patch.notes === undefined ? existing.notes : String(patch.notes).slice(0, 2000);
    const budgetBid = patch.budgetBid === undefined ? existing.budgetBid : Number(patch.budgetBid) || 0;
    this.db
      .prepare('UPDATE bids SET status = ?, outcome_at = ?, notes = ?, budget_bid = ? WHERE id = ?')
      .run(status, outcomeAt, notes, budgetBid, id);
    return this.getBid(id);
  }

  deleteBid(id: string): boolean {
    const result = this.db.prepare('DELETE FROM bids WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  /** ثبت اولین مشاهده‌ی یک پروژه (برای مقایسه‌ی تعداد پیشنهاد در زمان مشاهده). */
  upsertProjectSeen(projectId: string, bidsAtSeen: number | null, budgetText: string): void {
    const id = String(projectId ?? '').trim();
    if (!id) return;
    this.db
      .prepare(
        `INSERT INTO projects_seen (project_id, first_seen, bids_at_seen, budget_text)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           bids_at_seen = COALESCE(projects_seen.bids_at_seen, excluded.bids_at_seen),
           budget_text = CASE WHEN projects_seen.budget_text = '' THEN excluded.budget_text ELSE projects_seen.budget_text END`,
      )
      .run(id, new Date().toISOString(), bidsAtSeen, String(budgetText ?? '').slice(0, 200));
  }

  /** تنظیمات ساده‌ی سرور (مثلاً وضعیت زمان‌بند اسکن). */
  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, String(value));
  }

  countProjectsSeen(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM projects_seen').get() as { c: number };
    return Number(row?.c ?? 0);
  }

  close(): void {
    this.db.close();
  }
}

export class BidStoreError extends Error {
  code: string;
  constructor(message: string, code = 'BID_STORE') {
    super(message);
    this.name = 'BidStoreError';
    this.code = code;
  }
}

export function defaultDbPath(): string {
  const override = process.env.KONKLANCER_DB_PATH;
  if (override && override.trim()) return override.trim();
  return path.join(process.cwd(), 'data', 'konklancer.db');
}

function normalizeIso(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

let sharedStore: BidStore | null = null;

/** یک نمونه‌ی مشترک برای سرور (تست‌ها نمونه‌ی خودشان را می‌سازند). */
export function getBidStore(): BidStore {
  if (!sharedStore) sharedStore = new BidStore();
  return sharedStore;
}

export function resetSharedStoreForTests(): void {
  sharedStore = null;
}
