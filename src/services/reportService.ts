import { Report } from '../models/report';


function paginate<T>(arr: T[], offset = 0, limit = 5): { items: T[]; offset: number; limit: number; total: number } {
  const total = arr.length;
  const off = Math.max(0, Math.floor(offset));
  const lim = Math.max(1, Math.floor(limit));
  return { items: arr.slice(off*lim, off*lim + lim), offset: off, limit: lim, total };
}

export function toReportView(report: Report, options: any = {}): any {
  const include = new Set(options.include || ['entries', 'comments', 'metadata', 'metrics']);

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
    return {
      id: report.id,
      title: report.title,
      ownerId: report.ownerId,
      department: report.department,
      status: report.status,
      metrics: report.metrics,
      metadataSummary: report.metadata || {},
    };
  }

  let data: any = {...report}

  if (include.has('entries')) data.entries = entriesPageResult ? entriesPageResult.items : data.entries;
  else delete data.entries;

  if (include.has('comments')) data.comments = data.comments || [];
  else delete data.comments;

  if (include.has('metadata')) data.metadata = data.metadata || {};
  else delete data.metadata;

  if (include.has('metrics')) data.metrics = data.metrics;
  else delete data.metrics;

  return data;
}
