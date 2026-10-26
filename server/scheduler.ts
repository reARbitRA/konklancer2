/**
 * زمان‌بند اسکن دوره‌ای (SPEC-004 / SPEC-007 §2.2).
 *
 * قبلاً فقط یک `setInterval` در زمان بوت بود و کنترل‌های «توقف موتور» و
 * «فواصل رصد» در UI هیچ اثری نداشتند. این ماژول وضعیت را نگه می‌دارد،
 * با تیک‌های قابل‌تست کار می‌کند و می‌تواند در حافظه‌ی پایدار ذخیره شود.
 */

export interface SchedulerState {
  enabled: boolean;
  intervalMinutes: number;
}

export interface SchedulerDeps {
  scan: () => Promise<unknown>;
  now?: () => number;
  log?: (message: string) => void;
  /** ذخیره‌ی وضعیت (اختیاری) تا بعد از ری‌استارت هم بماند. */
  persist?: (state: SchedulerState) => void;
  initial?: Partial<SchedulerState>;
  /** حداکثر تیک‌های هم‌زمان؛ از اسکن تودرتو جلوگیری می‌کند. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 240;
export const DEFAULT_INTERVAL_MINUTES = 30;

export function clampInterval(minutes: number): number {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(value)));
}

export class ScanScheduler {
  private state: SchedulerState;
  private timer: unknown = null;
  private running = false;
  private lastRunAt: string | null = null;
  private lastResult: 'ok' | 'error' | null = null;
  private lastError: string | null = null;
  private scans = 0;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private deps: SchedulerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.setTimer = deps.setTimer ?? ((fn, ms) => setInterval(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearInterval(handle as NodeJS.Timeout));
    this.state = {
      enabled: deps.initial?.enabled ?? false,
      intervalMinutes: clampInterval(deps.initial?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES),
    };
    if (this.state.enabled) this.applyTimer();
  }

  getState(): SchedulerState & {
    running: boolean;
    lastRunAt: string | null;
    lastResult: 'ok' | 'error' | null;
    lastError: string | null;
    scans: number;
    nextRunInMs: number | null;
  } {
    return {
      ...this.state,
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
      lastError: this.lastError,
      scans: this.scans,
      nextRunInMs: this.state.enabled ? this.state.intervalMinutes * 60_000 : null,
    };
  }

  /** تغییر تنظیمات از UI. مقدار نامعتبر → خطا. */
  configure(patch: Partial<SchedulerState>): SchedulerState {
    if (patch.intervalMinutes !== undefined) {
      const raw = Number(patch.intervalMinutes);
      if (!Number.isFinite(raw) || raw < MIN_INTERVAL_MINUTES || raw > MAX_INTERVAL_MINUTES) {
        throw new Error(`فاصله باید بین ${MIN_INTERVAL_MINUTES} و ${MAX_INTERVAL_MINUTES} دقیقه باشد.`);
      }
      this.state.intervalMinutes = clampInterval(raw);
    }
    if (patch.enabled !== undefined) this.state.enabled = Boolean(patch.enabled);
    this.applyTimer();
    this.deps.persist?.({ ...this.state });
    this.deps.log?.(
      this.state.enabled
        ? `زمان‌بند اسکن فعال شد (هر ${this.state.intervalMinutes} دقیقه).`
        : 'زمان‌بند اسکن متوقف شد.',
    );
    return { ...this.state };
  }

  private applyTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (!this.state.enabled) return;
    this.timer = this.setTimer(() => {
      void this.tick();
    }, this.state.intervalMinutes * 60_000);
  }

  /** یک تیک؛ در تست‌ها مستقیم صدا زده می‌شود. */
  async tick(force = false): Promise<'skipped' | 'ok' | 'error'> {
    if (!force && !this.state.enabled) return 'skipped';
    if (this.running) return 'skipped';
    this.running = true;
    try {
      await this.deps.scan();
      this.scans += 1;
      this.lastRunAt = new Date(this.now()).toISOString();
      this.lastResult = 'ok';
      this.lastError = null;
      return 'ok';
    } catch (err: any) {
      this.lastRunAt = new Date(this.now()).toISOString();
      this.lastResult = 'error';
      this.lastError = err?.message ?? String(err);
      this.deps.log?.(`اسکن زمان‌بندی‌شده ناموفق بود: ${this.lastError}`);
      return 'error';
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    this.state.enabled = false;
  }
}
