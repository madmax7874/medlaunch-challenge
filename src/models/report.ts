import { randomUUID } from "crypto";
import globalRepo from "../repositories/globalRepository";

export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

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
}

export interface ReportView extends Report {
  // Computed fields (calculated at read time)
  totalAmount: number;
  isOverBudget: boolean;
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

  await globalRepo.reports.add(rec);
  return rec;
}

// get reports by user and role
export async function getReportsByUser(userId: string, role: 'USER' | 'ADMIN'): Promise<Report[]> {
  const allReports = globalRepo.reports.list();
  if (role === 'ADMIN') {
    return await allReports;
  } else {
    // Users can see reports they own, or reports where they are listed as a viewer
    return (await allReports).filter((r) => r.ownerId === userId || (Array.isArray(r.viewers) && r.viewers.some((v) => v.userId === userId)));
  }
}