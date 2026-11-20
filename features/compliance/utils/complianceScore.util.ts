import type { DocumentRow } from '../services/documents.service';
import { isLiveEntityDoc, isSupersededEntityDoc } from './currentDocument.util';

export type ComplianceLevel = 'excellent' | 'good' | 'warning' | 'critical';

export interface ComplianceScore {
  score: number;           // 0-100
  level: ComplianceLevel;
  validityScore: number;   // 0-100: % non-expired docs
  completenessScore: number; // 0-100: % required docs present
  verificationScore: number; // 0-100: % verified docs
  breakdown: {
    total: number;
    active: number;
    expired: number;
    expiring7d: number;
    expiring30d: number;
    verified: number;
    pending: number;
    missing: number;
  };
}

// Required document types per entity type
export const REQUIRED_DOC_TYPES: Record<string, string[]> = {
  vehicle: ['insurance', 'rc', 'fitness', 'permit', 'pollution'],
  driver: ['license', 'medical'],
  supplier: ['gst', 'pan'],
};

export function computeComplianceScore(
  allDocuments: DocumentRow[],
  entityType: string,
): ComplianceScore {
  // Same rows as SQL compute_compliance_score: replaced and superseded copies
  // (an older file of a slot that has a newer, differently dated file) are history.
  const documents = allDocuments.filter(
    (d) => d.status !== 'replaced' && !isSupersededEntityDoc(d, allDocuments),
  );
  const today = new Date();
  const in7days = new Date(today.getTime() + 7 * 86400000);
  const in30days = new Date(today.getTime() + 30 * 86400000);

  const active = documents.filter(d => d.status === 'active' || d.status === 'verified');
  const expired = documents.filter(d => {
    if (!isLiveEntityDoc(d)) return false;
    if (d.status === 'expired') return true;
    if (d.expiry_date && new Date(d.expiry_date) < today) return true;
    return false;
  });
  const expiring7d = documents.filter(d => {
    if (!d.expiry_date) return false;
    const exp = new Date(d.expiry_date);
    return exp >= today && exp <= in7days && d.status !== 'replaced';
  });
  const expiring30d = documents.filter(d => {
    if (!d.expiry_date) return false;
    const exp = new Date(d.expiry_date);
    return exp >= today && exp <= in30days && d.status !== 'replaced';
  });
  const verified = documents.filter(d => d.status === 'verified');
  const pending = documents.filter(d => d.status === 'pending');

  const requiredTypes = REQUIRED_DOC_TYPES[entityType] ?? [];
  const presentTypes = new Set(documents.filter(isLiveEntityDoc).map(d => d.doc_type));
  const missing = requiredTypes.filter(t => !presentTypes.has(t)).length;

  const total = documents.length;

  // Scores
  const validityScore = total > 0
    ? Math.round(((total - expired.length) / total) * 100)
    : requiredTypes.length === 0 ? 100 : 0;

  const completenessScore = requiredTypes.length > 0
    ? Math.round(((requiredTypes.length - missing) / requiredTypes.length) * 100)
    : 100;

  const verificationScore = total > 0
    ? Math.round((verified.length / total) * 100)
    : 100;

  // Composite: validity 40%, completeness 35%, verification 25%
  const score = Math.round(
    validityScore * 0.40 +
    completenessScore * 0.35 +
    verificationScore * 0.25
  );

  const level: ComplianceLevel =
    score >= 90 ? 'excellent' :
    score >= 70 ? 'good' :
    score >= 50 ? 'warning' : 'critical';

  return {
    score,
    level,
    validityScore,
    completenessScore,
    verificationScore,
    breakdown: {
      total,
      active: active.length,
      expired: expired.length,
      expiring7d: expiring7d.length,
      expiring30d: expiring30d.length,
      verified: verified.length,
      pending: pending.length,
      missing,
    },
  };
}

export function getComplianceLevelColor(level: ComplianceLevel): string {
  switch (level) {
    case 'excellent': return '#16A34A';  // green
    case 'good': return '#2563EB';       // blue
    case 'warning': return '#D97706';    // amber
    case 'critical': return '#DC2626';   // red
  }
}

export function getDaysUntilExpiry(expiryDate: string): number {
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
}

export function getExpiryAlertLevel(daysUntil: number): 'expired' | 'critical' | 'warning' | 'notice' | 'ok' {
  if (daysUntil < 0) return 'expired';
  if (daysUntil <= 7) return 'critical';
  if (daysUntil <= 30) return 'warning';
  if (daysUntil <= 90) return 'notice';
  return 'ok';
}
