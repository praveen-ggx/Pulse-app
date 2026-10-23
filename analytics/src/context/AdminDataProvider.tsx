import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Organization, AdminContextValue,
  OrgUser, UsageMetric, FeatureFlag,
  BillingTier, AppStatus,
  AuditEntry, AutomatedCheck, BusinessDocument,
  DocumentType,
} from '@/types/admin';
// Session client, not service_role: the six tables this provider reads
// (organizations, organization_members, profiles, trips,
// verification_audit_logs, org_feature_flags) now carry admin-read policies
// gated on the existing verification.review/approve permissions, and writes are
// gated on verification.approve. Audit rows record auth.uid().
// See 20270306060000_admindata_admin_access.sql.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { fetchKycDocumentsByOrg } from '@/lib/kycDocuments';
import {
  registrationTypeRequiresCin,
  requiredKycDocSlots,
} from '@/lib/kycDocumentMatrix';

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside AdminDataProvider');
  return ctx;
}

// ─── Map DB row → Organization ────────────────────────────────────────────────

function docSatisfiesSlot(
  docs: BusinessDocument[],
  satisfyWith: DocumentType[],
): BusinessDocument | undefined {
  return docs.find(
    (d) =>
      satisfyWith.includes(d.type) &&
      d.status !== 'Missing' &&
      (!!d.storage_path || !!d.url || !!d.file_name),
  );
}

/** Pad Missing placeholders using the structure matrix (client/RPC parity). */
function ensureRequiredDocuments(
  orgId: string,
  docs: BusinessDocument[],
  registrationType: string | null | undefined,
  gstNotApplicable: boolean,
): BusinessDocument[] {
  const slots = requiredKycDocSlots(registrationType, gstNotApplicable);
  const result = docs.map((d) => ({
    ...d,
    required: slots.some(
      (slot) => slot.type === d.type || slot.satisfyWith.includes(d.type),
    ),
  }));

  for (const slot of slots) {
    if (docSatisfiesSlot(result, slot.satisfyWith)) continue;
    // Avoid duplicate Missing rows for the same primary type
    if (result.some((d) => d.type === slot.type && d.status === 'Missing')) continue;
    result.push({
      id: `${orgId}-${slot.type.replace(/\s+/g, '_').toLowerCase()}-missing`,
      type: slot.type,
      file_name: '',
      status: 'Missing',
      uploaded_at: '',
      url: '',
      storage_path: '',
      mime_type: 'application/pdf',
      size_kb: 0,
      required: true,
    });
  }

  // GST skipped: drop a Missing GST Certificate placeholder if present
  if (gstNotApplicable) {
    return result.filter(
      (d) => !(d.type === 'GST Certificate' && d.status === 'Missing' && !d.url && !d.storage_path),
    );
  }

  return result;
}

function mapOrg(
  row: Record<string, unknown>,
  members: Record<string, unknown>[],
  tripCounts: Record<string, number>,
  featureFlagMap: Record<string, Record<string, boolean>>,
  auditByOrg: Record<string, AuditEntry[]>,
  documents: BusinessDocument[],
): Organization {
  const status = mapStatus(row.verification_status as string);

  const users: OrgUser[] = members.map((m) => ({
    id:        m.user_id as string,
    name:      (m as Record<string, unknown>).display_name as string ?? 'Unknown',
    email:     (m as Record<string, unknown>).email as string ?? '',
    role:      capitalize((m.role as string) ?? 'member') as OrgUser['role'],
    status:    m.status === 'active' ? 'Active' : 'Suspended',
    lastLogin: null,
  }));

  const tripCount = (tripCounts[row.id as string] ?? 0) as number;
  const usagePct = Math.min(100, Math.round((tripCount / 200) * 100));
  const usageVariant: UsageMetric['variant'] = usagePct >= 90 ? 'danger' : usagePct >= 70 ? 'warning' : 'default';

  const usage: UsageMetric[] = [
    {
      id: 'trips', label: 'Trips this month',
      pct: usagePct,
      detail: `${tripCount} trips`,
      variant: usageVariant,
    },
  ];

  const dbFlags = featureFlagMap[row.id as string] ?? {};
  const flags: FeatureFlag[] = [
    { id: 'load_board',  label: 'Load Board',    description: 'Access to marketplace load board', enabled: dbFlags['load_board']  ?? true },
    { id: 'analytics',   label: 'Analytics',     description: 'Finance & fleet analytics',         enabled: dbFlags['analytics']   ?? false },
    { id: 'ai_dispatch', label: 'AI Dispatch',   description: 'AI-powered dispatch suggestions',   enabled: dbFlags['ai_dispatch'] ?? false },
  ];

  const auditTrail = auditByOrg[row.id as string] ?? [];
  const approval_notes = [...auditTrail]
    .reverse()
    .find((a) => a.event_type === 'approved')
    ?.detail;

  return {
    id:                   row.id as string,
    company_name:         (row.name as string) ?? 'Unnamed',
    trade_name:           undefined,
    entity_type:          mapEntityType(row.registration_type as string),
    gstin:                (row.gstin as string) ?? '—',
    pan:                  (row.business_pan as string) ?? '—',
    cin:                  (row.cin as string) ?? undefined,
    registration_date:    (row.created_at as string) ?? '',
    directors:            [],
    registered_address:   [row.address_line, row.city, row.state].filter(Boolean).join(', ') || '—',
    pincode:              (row.pincode as string) ?? (row.address_pincode as string) ?? '',
    city:                 (row.city as string) ?? '—',
    state:                (row.state as string) ?? '—',
    contact_name:         members[0] ? ((members[0] as Record<string, unknown>).display_name as string ?? '—') : '—',
    contact_email:        members[0] ? ((members[0] as Record<string, unknown>).email as string ?? '—') : '—',
    contact_phone:        members[0] ? ((members[0] as Record<string, unknown>).phone as string ?? '—') : '—',
    submission_date:      (row.submitted_at as string) ?? (row.created_at as string) ?? '',
    status,
    risk_score:           'Low',
    risk_factors:         [],
    assigned_to:          'System',
    rejection_reason:     (row.rejection_reasons as { checklist?: string[] } | null)?.checklist?.[0] ?? undefined,
    rejection_notes:      (row.kyc_rejected_reason as string) ?? undefined,
    escalation_reason:    undefined,
    automated_checks:     mapChecks(row, documents),
    documents:            ensureRequiredDocuments(
      row.id as string,
      documents,
      row.registration_type as string | null,
      !!row.gst_not_applicable,
    ),
    approval_notes,
    audit_trail:          auditTrail,
    billing_tier:         'Starter' as BillingTier,
    api_usage:            0,
    users,
    usage_metrics:        usage,
    feature_flags:        flags,
  };
}

function mapStatus(s: string): AppStatus {
  switch (s) {
    case 'pending':   return 'Under Review';
    case 'verified':  return 'Approved';
    case 'rejected':  return 'Rejected';
    case 'unverified':
    default:          return 'Pending';
  }
}

function mapEntityType(r: string): Organization['entity_type'] {
  switch (r) {
    case 'pvt_ltd':    return 'Pvt Ltd';
    case 'llp':        return 'LLP';
    case 'public_ltd': return 'Public Ltd';
    case 'partnership':return 'Partnership';
    case 'individual': return 'Individual';
    default:           return 'Proprietorship';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// submit_business_verification writes new_status='pending' both for a
// user's first-ever submission and a resubmission after rejection — the
// same transition escalateApp also produces today (see its TODO). notes
// is the only field that actually distinguishes them, so check it first
// rather than inferring intent from the status pair alone.
function mapAuditEventType(prev: string | null, next: string, notes: string | null): AuditEntry['event_type'] {
  if (notes === 'user_submitted') return 'submitted';
  if (notes === 'document_update_resubmit') return 'reopened';
  if (next === 'verified') return 'approved';
  if (next === 'rejected') return 'rejected';
  if (next === 'pending')  return 'escalated';
  if (!prev) return 'submitted';
  return 'comment';
}

function auditTitle(prev: string | null, next: string, notes: string | null): string {
  if (notes === 'user_submitted') return 'Submitted for verification';
  if (notes === 'document_update_resubmit') return 'Document updated — pending review';
  if (next === 'verified') return 'Approved';
  if (next === 'rejected') return 'Rejected';
  if (next === 'pending')  return 'Escalated for review';
  if (!prev) return 'Application submitted';
  return `Status changed to ${next}`;
}

function mapChecks(row: Record<string, unknown>, documents: BusinessDocument[]): AutomatedCheck[] {
  const registrationType = row.registration_type as string | null;
  const gstNotApplicable = !!row.gst_not_applicable;
  const slots = requiredKycDocSlots(registrationType, gstNotApplicable);

  const slotCheck = (satisfyWith: DocumentType[]): AutomatedCheck['status'] => {
    const doc = docSatisfiesSlot(documents, satisfyWith);
    if (!doc) return 'Pending';
    if (doc.status === 'Flagged' || doc.status === 'Expired') return 'Failed';
    if (doc.status === 'Unreadable' || doc.status === 'Pending') return 'Manual Review';
    return 'Passed';
  };

  const addressPassed =
    slotCheck(['Address Proof']) === 'Passed' || !!row.address_proof_path;

  const checks: AutomatedCheck[] = [
    {
      id: 'gstin',
      label: gstNotApplicable ? 'GST (not applicable)' : 'GSTIN Registry',
      status: gstNotApplicable ? 'N/A' : row.gstin ? 'Passed' : 'Pending',
      required: !gstNotApplicable,
      detail: gstNotApplicable
        ? 'Not registered for GST'
        : row.gstin
          ? `GSTIN: ${row.gstin}`
          : 'Not submitted',
    },
    {
      id: 'pan',
      label: 'PAN Verification',
      status: row.business_pan ? 'Passed' : 'Pending',
      required: true,
      detail: row.business_pan ? `PAN: ${row.business_pan}` : 'Not submitted',
    },
  ];

  if (registrationTypeRequiresCin(registrationType)) {
    checks.push({
      id: 'cin',
      label: 'CIN',
      status: row.cin ? 'Passed' : 'Pending',
      required: true,
      detail: row.cin ? `CIN: ${row.cin}` : 'Required for limited company',
    });
  }

  for (const slot of slots) {
    if (slot.type === 'Address Proof') {
      checks.push({
        id: 'address',
        label: slot.label,
        status: addressPassed ? 'Passed' : 'Pending',
        required: true,
        detail:
          (row.address_proof_type as string) ??
          docSatisfiesSlot(documents, slot.satisfyWith)?.file_name ??
          'Not uploaded',
      });
      continue;
    }
    const match = docSatisfiesSlot(documents, slot.satisfyWith);
    checks.push({
      id: `doc_${slot.type.replace(/\s+/g, '_').toLowerCase()}`,
      label: slot.label,
      status: slotCheck(slot.satisfyWith),
      required: true,
      detail: match?.file_name ?? 'Not uploaded',
    });
  }

  return checks;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [applications, setApplications] = useState<Organization[]>([]);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [searchQuery, setSearchQuery]   = useState('');
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [isActing, setIsActing]         = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all orgs
      const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgErr) throw orgErr;

      // Fetch all members (no FK join — user_id has no FK to profiles)
      const { data: members, error: memErr } = await supabase
        .from('organization_members')
        .select('*');

      if (memErr) throw memErr;

      // Fetch profiles for all member user_ids
      const userIds = [...new Set((members ?? []).map(m => m.user_id as string))];
      let profileMap: Record<string, { full_name: string; email: string; phone: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .in('id', userIds);
        for (const p of (profiles ?? [])) {
          profileMap[p.id] = { full_name: p.full_name, email: p.email, phone: p.phone ?? null };
        }
      }

      // Group members by org
      const byOrg: Record<string, Record<string, unknown>[]> = {};
      for (const m of (members ?? [])) {
        const orgId = m.organization_id as string;
        if (!byOrg[orgId]) byOrg[orgId] = [];
        const profile = profileMap[m.user_id as string];
        byOrg[orgId].push({
          ...m,
          display_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
        });
      }

      // Fetch this-month trip counts per org
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: tripRows } = await supabase
        .from('trips')
        .select('organization_id')
        .gte('created_at', monthStart);
      const tripCounts: Record<string, number> = {};
      for (const t of (tripRows ?? [])) {
        const oid = t.organization_id as string;
        tripCounts[oid] = (tripCounts[oid] ?? 0) + 1;
      }

      // Fetch audit logs for all orgs
      const { data: auditRows } = await supabase
        .from('verification_audit_logs')
        .select('*')
        .order('created_at', { ascending: true });
      const auditByOrg: Record<string, AuditEntry[]> = {};
      for (const a of (auditRows ?? [])) {
        const oid = a.org_id as string;
        if (!auditByOrg[oid]) auditByOrg[oid] = [];
        const notes = (a.notes as string | null) ?? null;
        auditByOrg[oid].push({
          id:         a.id as string,
          timestamp:  a.created_at as string,
          actor:      notes === 'user_submitted' ? 'applicant' : (a.changed_by as string) ?? 'system',
          actor_type: notes === 'user_submitted' ? 'applicant' : a.changed_by ? 'admin' : 'system',
          event_type: mapAuditEventType(a.previous_status as string | null, a.new_status as string, notes),
          title:      auditTitle(a.previous_status as string | null, a.new_status as string, notes),
          detail:     notes ?? undefined,
        });
      }

      // Fetch feature flags for all orgs
      const { data: flagRows } = await supabase
        .from('org_feature_flags')
        .select('org_id, flag_id, enabled');
      const featureFlagMap: Record<string, Record<string, boolean>> = {};
      for (const f of (flagRows ?? [])) {
        const oid = f.org_id as string;
        if (!featureFlagMap[oid]) featureFlagMap[oid] = {};
        featureFlagMap[oid][f.flag_id as string] = f.enabled as boolean;
      }

      const docsByOrg = await fetchKycDocumentsByOrg();

      const mapped = (orgs ?? []).map((o) =>
        mapOrg(
          o as Record<string, unknown>,
          byOrg[o.id] ?? [],
          tripCounts,
          featureFlagMap,
          auditByOrg,
          docsByOrg[o.id as string] ?? [],
        ),
      );
      setApplications(mapped);
      if (mapped.length > 0 && !selectedId) setSelectedId(mapped[0].id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { loadData(); }, []);

  const selectedApp = applications.find(a => a.id === selectedId) ?? null;

  // approveApp/rejectApp go through the admin_approve_profile / admin_reject_profile
  // procedures (not raw .update()) so verified_by, marketplace_verified, frozen_at
  // unfreeze, and the verification_audit_logs entry all happen atomically — matching
  // what the mobile wizard's submit/frozen-view code expects. This console runs under
  // the service_role key with no per-admin session, so p_admin_id is passed as null;
  // the audit trail records the action without attributing it to a specific admin user.
  const approveApp = useCallback(async (id: string, notes?: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase.rpc('admin_approve_profile', {
        p_org_id:   id,
        p_admin_id: null,
        p_notes:    notes?.trim() || null,
      });
      if (error) throw error;
      await loadData();
    } catch (e) {
      const message = (e as Error).message ?? 'Approval failed';
      alert(message);
      throw e;
    } finally { setIsActing(false); }
  }, [loadData]);

  const rejectApp = useCallback(async (id: string, reason: string, notes: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase.rpc('admin_reject_profile', {
        p_org_id:            id,
        p_admin_id:          null,
        p_rejection_reasons: { checklist: [reason], notes },
        p_notes:             notes,
      });
      if (error) throw error;
      await loadData();
    } catch (e) {
      const message = (e as Error).message ?? 'Rejection failed';
      alert(message);
      throw e;
    } finally { setIsActing(false); }
  }, [loadData]);

  const escalateApp = useCallback(async (id: string, reason: string) => {
    setIsActing(true);
    try {
      const org = applications.find((a) => a.id === id);
      const previousStatus =
        org?.status === 'Under Review' ? 'pending' : 'unverified';

      const { error: updateErr } = await supabase
        .from('organizations')
        .update({
          verification_status: 'pending',
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updateErr) throw updateErr;

      // Records the real signed-in admin. This was `null` while the provider ran
      // on the service_role key, which had no user identity -- the trail showed
      // that an escalation happened but never who did it.
      const { data: authData } = await supabase.auth.getUser();
      const { error: auditErr } = await supabase
        .from('verification_audit_logs')
        .insert({
          org_id: id,
          changed_by: authData?.user?.id ?? null,
          previous_status: previousStatus,
          new_status: 'pending',
          notes: reason.trim(),
        });
      if (auditErr) throw auditErr;

      await loadData();
    } catch (e) {
      const message = (e as Error).message ?? 'Escalation failed';
      alert(message);
      throw e;
    } finally { setIsActing(false); }
  }, [applications, loadData]);

  const suspendUser = useCallback(async (_orgId: string, userId: string) => {
    setIsActing(true);
    try {
      const { error } = await supabase
        .from('organization_members')
        .update({ status: 'suspended' })
        .eq('user_id', userId);
      if (error) throw error;
      await loadData();
    } finally { setIsActing(false); }
  }, [loadData]);

  const toggleFeatureFlag = useCallback(async (orgId: string, flagId: string) => {
    const org = applications.find(a => a.id === orgId);
    if (!org) return;
    const flag = org.feature_flags.find(f => f.id === flagId);
    if (!flag) return;
    const newEnabled = !flag.enabled;
    // Optimistic update
    setApplications(prev => prev.map(a =>
      a.id !== orgId ? a : {
        ...a,
        feature_flags: a.feature_flags.map(f => f.id === flagId ? { ...f, enabled: newEnabled } : f),
      },
    ));
    await supabase
      .from('org_feature_flags')
      .upsert({ org_id: orgId, flag_id: flagId, enabled: newEnabled, updated_at: new Date().toISOString() },
        { onConflict: 'org_id,flag_id' });
  }, [applications]);

  const value: AdminContextValue = {
    applications,
    selectedId,
    selectedApp,
    selectedOrg: selectedApp,
    selectApplication: setSelectedId,
    setSelectedOrgById: setSelectedId,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    refreshData: loadData,
    isActing,
    approveApp,
    rejectApp,
    escalateApp,
    suspendUser,
    toggleFeatureFlag,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
