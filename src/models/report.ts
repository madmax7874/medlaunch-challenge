import { randomUUID } from "crypto";
import globalRepo from "../repositories/globalRepository";
export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
import { getUserById } from "./user";

export interface ReportEntry {
  id: string;
  description?: string;
  amount: number;
  category?: string;
  incurredAt?: string;
  receiptAttached?: boolean;
}

export interface ReportComment {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface ReportAttachment {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  storagePath: string;
  uploadedAt: string
  owner: string;
}

export type Metadata = Record<string, string | number | boolean>;

export interface ReportView {
  totalAmount?: number;
  isOverBudget?: boolean;
  entryCount?: number;
  averageEntry?: number;
  trend?: 'increasing' | 'decreasing' | 'stable' | 'unknown';
}

export interface Report {
  id: string;
  title: string;
  ownerId: string;
  department?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  budgetCap: number;
  budgetOverride?: boolean;
  status: ReportStatus;
  entries: ReportEntry[];
  users?: { userId: string; access: 'VIEW' | 'EDIT' | 'COMMENT' }[];
  comments?: ReportComment[];
  metadata?: Metadata;
  attachments?: ReportAttachment[];
  metrics?: ReportView;
}



export function getReportsByUser(userId: string): Report[] {
  const user = getUserById(userId);
  if (!user) {
    return [];
  }
  const allReports = globalRepo.reports.list();
  if (user.role === 'ADMIN') {
    return allReports;
  } else {
    // Users can see reports they own, or reports where they are listed as a viewer
    return (allReports).filter((r) => r.ownerId === userId || (Array.isArray(r.users) && r.users.some((v) => v.userId === userId)));
  }
}

export function getReportById(id: string): Report | null {
  const report = globalRepo.reports.findById(id);
  if (!report) {
    return null;
  }
  return report;
}

export async function createReport(title: string, ownerId: string, budgetCap: number, department?: string, entries?: ReportEntry[], users?: { userId: string; access: 'VIEW' | 'EDIT' | 'COMMENT' }[], status?: ReportStatus, budgetOverride?: boolean): Promise<Report> {
  const now = new Date().toISOString();

  const rec: Report = {
    id: randomUUID(),
    title,
    ownerId,
    department,
    createdAt: now,
    updatedAt: now,
    version: 1,
    budgetCap,
    budgetOverride: budgetOverride || false,
    entries: entries || [],
    users: users || [],
    status: status || 'DRAFT',
  } as Report;

  globalRepo.reports.add(rec);
  return rec;
}

export function updateReport(id: string, updated: Partial<Report>, expectedVersion?: number): Report {
  let existing = getReportById(id);
  if (!existing) throw new Error('NotFound');

  if (expectedVersion !== undefined && expectedVersion !== existing.version) {
    const err: any = new Error('VersionMismatch');
    err.code = 'VERSION_MISMATCH';
    throw err;
  }
  const now = new Date().toISOString();
  const merged: Report = {
    ...existing,
    ...updated,
    version: (existing.version ?? 0) + 1,
    updatedAt: now,
  } as Report;

  globalRepo.reports.update(id, merged);
  return merged;
}

/**
 * Asynchronously generates and updates the ReportView for a given report.
 * In a real application, this function would be triggered by a background job worker.
*/
export async function updateReportView(reportId: string): Promise<void> {
  console.log(`[Worker] Starting async generation of ReportView for reportId: ${reportId}`);
  const report = getReportById(reportId);
  if (!report) {
    console.error(`[Worker] Report with ID ${reportId} not found. Cannot generate view.`);
    return;
  }

  const totalAmount = (report.entries || []).reduce((s, e) => s + (e.amount ?? 0), 0);
  const isOverBudget = totalAmount > report.budgetCap && !report.budgetOverride;
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

  const reportView: ReportView = {
    totalAmount: totalAmount,
    isOverBudget: isOverBudget,
    entryCount: entryCount,
    averageEntry: averageEntry,
    trend: trend,
  };

  // update the report with its metrics
  report.metrics = reportView;
  updateReport(reportId, report);
  console.log(`[Worker] Finished async generation of ReportView for reportId: ${reportId}`);
}