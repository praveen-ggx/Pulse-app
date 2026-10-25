/**
 * Permission utilities for the Admin Console.
 * Provides helpers for checking permissions, building permission matrices, and guard logic.
 */

export type AdminPermission =
  | 'verification.review'
  | 'verification.approve'
  | 'driver.kyc.review'
  | 'driver.kyc.approve'
  | 'credits.manage'
  | 'support.manage'
  | 'system.flags.manage'
  | 'users.suspend'
  | 'marketplace_fees.manage'
  | 'dco.review'
  | 'reach.manage'
  | 'reach.approve'
  | 'analytics.view'
  | 'platform_admin.manage';

export type AdminRole =
  | 'super_admin'
  | 'verification_mgr'
  | 'kyc_operator'
  | 'support_agent'
  | 'financial_auditor'
  | 'control_tower'
  | 'reach_admin';

// Permission → human-readable label
export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  'verification.review': 'Review Verifications',
  'verification.approve': 'Approve Verifications',
  'driver.kyc.review': 'Review Driver KYC',
  'driver.kyc.approve': 'Approve Driver KYC',
  'credits.manage': 'Manage Credits',
  'support.manage': 'Manage Support',
  'system.flags.manage': 'Manage Feature Flags',
  'users.suspend': 'Suspend Users',
  'marketplace_fees.manage': 'Manage Marketplace Fees',
  'dco.review': 'Review DCO Requests',
  'reach.manage': 'Manage Reach Campaigns',
  'reach.approve': 'Approve Reach Campaigns',
  'analytics.view': 'View Analytics',
  'platform_admin.manage': 'Manage Platform Admins',
};

// Role → preset permissions (for reference; source of truth is the database)
export const ROLE_PERMISSION_PRESETS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    'verification.review', 'verification.approve',
    'driver.kyc.review', 'driver.kyc.approve',
    'credits.manage',
    'support.manage',
    'system.flags.manage',
    'users.suspend',
    'marketplace_fees.manage',
    'dco.review',
    'reach.manage', 'reach.approve',
    'analytics.view',
    'platform_admin.manage',
  ],
  verification_mgr: [
    'verification.review', 'verification.approve',
    'analytics.view',
  ],
  kyc_operator: [
    'driver.kyc.review', 'driver.kyc.approve',
    'analytics.view',
  ],
  support_agent: [
    'support.manage',
    'users.suspend',
    'analytics.view',
  ],
  financial_auditor: [
    'credits.manage',
    'analytics.view',
  ],
  control_tower: [
    'verification.review', 'verification.approve',
    'credits.manage',
    'analytics.view',
  ],
  reach_admin: [
    'reach.manage', 'reach.approve',
    'analytics.view',
  ],
};

/**
 * Check if an array of permission strings includes a specific permission.
 * @param permissions - Array of permission keys from `get_my_platform_permissions()`
 * @param permission - Single permission or array of permissions to check
 * @param mode - 'any' (||) or 'all' (&&) matching
 */
export function hasPermission(
  permissions: string[],
  permission: AdminPermission | AdminPermission[],
  mode: 'any' | 'all' = 'any',
): boolean {
  if (!permissions || permissions.length === 0) return false;

  const checks = Array.isArray(permission) ? permission : [permission];

  if (mode === 'any') {
    return checks.some((p) => permissions.includes(p));
  }
  return checks.every((p) => permissions.includes(p));
}

/**
 * Get a description of what a permission allows.
 */
export function getPermissionDescription(permission: AdminPermission): string {
  const descriptions: Record<AdminPermission, string> = {
    'verification.review': 'View and triage pending organization verifications',
    'verification.approve': 'Approve, reject, or escalate organization verifications',
    'driver.kyc.review': 'View pending driver KYC submissions',
    'driver.kyc.approve': 'Approve or reject driver KYC submissions',
    'credits.manage': 'Issue or reverse organization credits',
    'support.manage': 'Manage support tickets and escalations',
    'system.flags.manage': 'Toggle feature flags across organizations',
    'users.suspend': 'Suspend or unsuspend user accounts',
    'marketplace_fees.manage': 'Adjust marketplace fee rules',
    'dco.review': 'Review, approve, reject, or suspend DCO status requests',
    'reach.manage': 'Create and edit Pulse Boost campaigns',
    'reach.approve': 'Approve Pulse Boost campaigns for publishing',
    'analytics.view': 'View internal analytics dashboards',
    'platform_admin.manage': 'Invite, update roles, and manage admin users',
  };

  return descriptions[permission] || 'Unknown permission';
}

/**
 * Get all tabs/panels this permission set allows access to.
 */
export function getAllowedPanels(permissions: string[]): string[] {
  const panels: string[] = [];

  if (hasPermission(permissions, ['verification.review', 'verification.approve'])) {
    panels.push('verification');
  }
  if (hasPermission(permissions, ['driver.kyc.review', 'driver.kyc.approve'])) {
    panels.push('driver-kyc');
  }
  if (hasPermission(permissions, 'credits.manage')) {
    panels.push('credits');
  }
  if (hasPermission(permissions, 'reach.manage')) {
    panels.push('referrals', 'reward-rules');
  }
  if (hasPermission(permissions, 'marketplace_fees.manage')) {
    panels.push('marketplace-fees');
  }
  if (hasPermission(permissions, 'dco.review')) {
    panels.push('dco-review');
  }
  if (hasPermission(permissions, 'system.flags.manage')) {
    panels.push('boost-ops');
  }
  if (hasPermission(permissions, 'support.manage')) {
    panels.push('support');
  }
  if (hasPermission(permissions, 'platform_admin.manage')) {
    panels.push('admin-users');
  }

  return panels;
}
