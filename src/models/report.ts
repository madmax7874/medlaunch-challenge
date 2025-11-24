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
  entries: ReportEntry[];
  viewers?: { userId: string; access: 'VIEW' | 'EDIT' | 'COMMENT' }[];
  status: ReportStatus;
  comments?: ReportComment[];
  metadata?: Metadata;
  attachments?: ReportAttachment[];
}

export interface ReportView extends Report {
  // Computed fields (calculated at read time)
  totalAmount: number;
  isOverBudget: boolean;
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
    return (allReports).filter((r) => r.ownerId === userId || (Array.isArray(r.viewers) && r.viewers.some((v) => v.userId === userId)));
  }
}

export function getReportById(id: string): Report | null {
  const report = globalRepo.reports.findById(id);
  if (!report) {
    return null;
  }
  return report;
}

export async function createReport(title: string, ownerId: string, budgetCap: number, department?: string, entries?: ReportEntry[], viewers?: { userId: string; access: 'VIEW' | 'EDIT' | 'COMMENT' }[], status?: ReportStatus, budgetOverride?: boolean): Promise<Report> {
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
    viewers: viewers || [],
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