/**
 * PermissionGate — conditionally render content based on admin permissions.
 * Useful for wrapping tabs, buttons, forms, or entire panels.
 */

import React from 'react';
import { usePermission } from '@/hooks/usePermission';
import type { AdminPermission } from '@/lib/permissions';

interface PermissionGateProps {
  /** Single permission string or array of permissions */
  permission: AdminPermission | AdminPermission[];
  /** 'any' (||) or 'all' (&&) matching when array provided */
  mode?: 'any' | 'all';
  /** Content to render when permitted */
  children: React.ReactNode;
  /** Fallback to render when denied (default: null) */
  fallback?: React.ReactNode;
  /** If true, render fallback; if false, render nothing when denied */
  showFallback?: boolean;
}

export function PermissionGate({
  permission,
  mode: _mode = 'any',
  children,
  fallback = null,
  showFallback = false,
}: PermissionGateProps) {
  const { can } = usePermission();

  if (can(permission)) {
    return <>{children}</>;
  }

  if (showFallback) {
    return <>{fallback}</>;
  }

  return null;
}

/**
 * Variant: render nothing if denied, or a custom component.
 * Useful for conditional rendering of buttons/actions without a fallback UI.
 */
export function PermissionGuard({
  permission,
  mode = 'any',
  children,
}: Omit<PermissionGateProps, 'fallback' | 'showFallback'>) {
  return (
    <PermissionGate permission={permission} mode={mode} showFallback={false}>
      {children}
    </PermissionGate>
  );
}

/**
 * Render a denied-access message.
 */
export function AccessDenied({ message }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-md space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-sm font-bold text-destructive">Access Denied</h1>
        <p className="text-xs leading-5 text-muted-foreground">
          {message || 'You do not have permission to access this resource. Contact your administrator.'}
        </p>
      </div>
    </div>
  );
}
