import { Report, ReportView } from '../models/report';

export function computeTotalAmount(report: Report): number {
  return (report.entries || []).reduce((s, e) => s + (e.amount ?? 0), 0);
}

export interface ViewOptions {
  include?: string[]; // e.g., ['entries','comments','metadata']
  compact?: boolean; // compact flattened view
  offset?: number;
  limit?: number;
  entriesSort?: 'amount_desc' | 'amount_asc' | 'date_desc' | 'date_asc';
  entriesMinAmount?: number;
}

function paginate<T>(arr: T[], offset = 0, limit = 5): { items: T[]; offset: number; limit: number; total: number } {
  const total = arr.length;
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(1, Math.floor(limit));
  return { items: arr.slice(off*lim, off*lim + lim), offset: off, limit: lim, total };
}

export function toReportView(report: Report, opts?: ViewOptions): any {
  const options: ViewOptions = opts || {};
  const include = new Set(options.include || ['entries', 'comments', 'metadata', 'metrics']);

  const totalAmount = computeTotalAmount(report);
  const isOverBudget = totalAmount > report.budgetCap;
  const entryCount = (report.entries || []).length;
  const averageEntry = entryCount ? totalAmount / entryCount : 0;

  // trendIndicator: compare last two entries by incurredAt (or insertion order)
  let trend: 'increasing' | 'decreasing' | 'stable' | 'unknown' = 'unknown';
  const entriesSortedByDate = (report.entries || []).slice().sort((a, b) => {
    const da = a.incurredAt ? Date.parse(a.incurredAt) : 0;
    const db = b.incurredAt ? Date.parse(b.incurredAt) : 0;
    return da - db;
  });
  if (entriesSortedByDate.length >= 2) {
    const last = entriesSortedByDate[entriesSortedByDate.length - 1].amount;
    const prev = entriesSortedByDate[entriesSortedByDate.length - 2].amount;
    if (last > prev) trend = 'increasing';
    else if (last < prev) trend = 'decreasing';
    else trend = 'stable';
  }

  const metrics = {
    totalAmount,
    isOverBudget,
    entryCount,
    averageEntry,
    trend,
  };

  // Process entries: filtering, sorting, pagination
  let entries = (report.entries || []).slice();
  if (options.entriesMinAmount !== undefined) {
    entries = entries.filter((e) => (e.amount ?? 0) >= (options.entriesMinAmount || 0));
  }
  if (options.entriesSort) {
    if (options.entriesSort === 'amount_desc') entries.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    if (options.entriesSort === 'amount_asc') entries.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0));
    if (options.entriesSort === 'date_desc') entries.sort((a, b) => (b.incurredAt ? Date.parse(b.incurredAt) : 0) - (a.incurredAt ? Date.parse(a.incurredAt) : 0));
    if (options.entriesSort === 'date_asc') entries.sort((a, b) => (a.incurredAt ? Date.parse(a.incurredAt) : 0) - (b.incurredAt ? Date.parse(b.incurredAt) : 0));
  }

  let entriesPageResult: any = null;
  if (include.has('entries')) {
    entriesPageResult = paginate(entries, options.offset, options.limit);
  }

  if (options.compact) {
    // return flattened compact summary
    return {
      id: report.id,
      title: report.title,
      ownerId: report.ownerId,
      department: report.department,
      status: report.status,
      totalAmount,
      isOverBudget,
      entryCount,
      averageEntry,
      trend,
      metadataSummary: report.metadata || {},
    };
  }

  // Default rich hierarchical view
  const view: any = {
    ...report,
    totalAmount,
    isOverBudget,
    metrics,
  };

  if (include.has('entries')) view.entries = entriesPageResult ? entriesPageResult.items : report.entries;
  else delete view.entries;

  if (include.has('comments')) view.comments = report.comments || [];
  else delete view.comments;

  if (include.has('metadata')) view.metadata = report.metadata || {};
  else delete view.metadata;

  if (include.has('metrics')) view.metrics = metrics;

  // attach pagination metadata for entries if present
  if (entriesPageResult) view.entriesPagination = { offset: entriesPageResult.offset, limit: entriesPageResult.limit, total: entriesPageResult.total };

  return view as ReportView;
}
