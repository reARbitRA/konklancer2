/**
 * مسیرهای HTTP پیشنهادها و آمار (SPEC-005).
 * برای اینکه بدون بالا آوردن کل Vite/Socket سرور قابل تست باشند، اینجا
 * جدا شده‌اند و وابستگی‌هایشان تزریق می‌شود.
 */
import type { Express, Request, Response } from 'express';
import { BID_STATUSES, BidStoreError, type BidStatus } from './store';
import { computeBidStats } from './bidStats';
import { readAlertConfig } from './notifier';

export interface BidRouteDeps {
  store: {
    recordBid: (input: any) => any;
    listBids: (filter: { status?: BidStatus; projectId?: string; limit?: number }) => any[];
    updateBid: (id: string, patch: { status?: BidStatus; notes?: string; budgetBid?: number }) => any;
    deleteBid: (id: string) => boolean;
    upsertProjectSeen: (projectId: string, bidsAtSeen: number | null, budgetText: string) => void;
  };
  log?: (message: string, type?: 'scan' | 'bid' | 'code' | 'github' | 'payment') => void;
  emit?: (event: string, payload: unknown) => void;
  alertSentCount?: () => number;
  env?: NodeJS.ProcessEnv;
}

export const parseBidStatus = (value: unknown): BidStatus | undefined => {
  const status = String(value ?? '').trim() as BidStatus;
  return BID_STATUSES.includes(status) ? status : undefined;
};

export function registerBidRoutes(app: Express, deps: BidRouteDeps): void {
  const env = deps.env ?? process.env;
  const log = deps.log ?? (() => {});
  const emit = deps.emit ?? (() => {});

  app.post('/api/bids', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      if (!body.projectId) {
        return res.status(400).json({ success: false, code: 'INVALID_PROJECT', error: 'projectId الزامی است.' });
      }
      const bid = deps.store.recordBid({
        projectId: String(body.projectId),
        platform: body.platform,
        category: body.category,
        title: body.title,
        budgetBid: body.budgetBid,
        status: parseBidStatus(body.status),
        bidAt: body.bidAt,
        notes: body.notes,
      });
      deps.store.upsertProjectSeen(
        String(body.projectId),
        Number.isFinite(Number(body.bidsAtSeen)) ? Number(body.bidsAtSeen) : null,
        String(body.budgetText ?? ''),
      );
      log(`پیشنهاد برای پروژه ${bid.projectId} ثبت شد (وضعیت: ${bid.status}).`, 'bid');
      emit('bid:created', bid);
      return res.status(201).json({ success: true, bid });
    } catch (err: any) {
      if (err instanceof BidStoreError) {
        return res.status(400).json({ success: false, code: err.code, error: err.message });
      }
      return res.status(500).json({ success: false, code: 'BID_WRITE_FAILED', error: err?.message ?? 'خطا در ثبت پیشنهاد' });
    }
  });

  app.get('/api/bids', (req: Request, res: Response) => {
    try {
      const status = parseBidStatus(req.query.status);
      const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const limit = Number(req.query.limit ?? 500);
      const bids = deps.store.listBids({ status, projectId, limit: Number.isFinite(limit) ? limit : 500 });
      return res.json({ success: true, count: bids.length, bids });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message ?? 'خطا در خواندن پیشنهادها' });
    }
  });

  app.patch('/api/bids/:id', (req: Request, res: Response) => {
    try {
      const status = parseBidStatus(req.body?.status);
      if (req.body?.status !== undefined && !status) {
        return res
          .status(400)
          .json({ success: false, code: 'INVALID_STATUS', error: `وضعیت باید یکی از ${BID_STATUSES.join(', ')} باشد.` });
      }
      const updated = deps.store.updateBid(req.params.id, {
        status,
        notes: req.body?.notes,
        budgetBid: req.body?.budgetBid,
      });
      if (!updated) return res.status(404).json({ success: false, code: 'BID_NOT_FOUND', error: 'پیشنهادی با این شناسه نیست.' });
      log(`نتیجه‌ی پیشنهاد ${updated.projectId} به «${updated.status}» تغییر کرد.`, 'payment');
      emit('bid:updated', updated);
      return res.json({ success: true, bid: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message ?? 'خطا در به‌روزرسانی پیشنهاد' });
    }
  });

  app.delete('/api/bids/:id', (req: Request, res: Response) => {
    const removed = deps.store.deleteBid(req.params.id);
    if (!removed) return res.status(404).json({ success: false, code: 'BID_NOT_FOUND', error: 'پیشنهادی با این شناسه نیست.' });
    return res.json({ success: true });
  });

  app.get('/api/stats', (req: Request, res: Response) => {
    try {
      const minSample = Number(req.query.minSample ?? 30);
      const bids = deps.store.listBids({ limit: 5000 });
      const stats = computeBidStats(bids, { minSample: Number.isFinite(minSample) ? minSample : 30 });
      return res.json({ success: true, stats });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message ?? 'خطا در محاسبه‌ی آمار' });
    }
  });

  app.get('/api/alerts/status', (_req: Request, res: Response) => {
    const config = readAlertConfig(env);
    res.json({
      success: true,
      alerts: {
        enabled: config.enabled,
        threshold: config.threshold,
        reason: config.reason,
        sentCount: deps.alertSentCount ? deps.alertSentCount() : 0,
      },
    });
  });
}
