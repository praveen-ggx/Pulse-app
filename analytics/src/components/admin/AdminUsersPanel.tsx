/**
 * S3b — Admin Console membership management. Extends Platform IAM
 * (platform_users/platform_role_members/platform_roles), never organization_members.
 * Role-only assignment (no per-admin permission overrides, per the locked S3b decision) --
 * "Effective permissions" below is read-only, derived from the assigned role.
 * Now gated behind 'platform_admin.manage' permission.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { AccessDenied } from '@/components/auth/PermissionGate';
import {
  changePlatformAdminRole,
  fetchPlatformAdmins,
  fetchPlatformRoles,
  invitePlatformAdmin,
  removePlatformAdmin,
  setPlatformAdminStatus,
  type PlatformAdminRow,
  type PlatformRoleRow,
} from '@/lib/platformAdmins';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** platform_roles.name is a snake_case key ("super_admin") -- render it as "Super Admin". */
function formatRoleName(name: string): string {
  return name
    .split('_')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function formatLastActivity(iso: string | null): string {
  if (!iso) return 'Never signed in';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_BADGE: Record<string, 'info' | 'success' | 'secondary'> = {
  invited: 'info',
  active: 'success',
  suspended: 'secondary',
};

export function AdminUsersPanel() {
  const { can, isLoading: permLoading } = usePermission();
  const hasAccess = !permLoading && can('platform_admin.manage');

  const [rows, setRows] = useState<PlatformAdminRow[]>([]);
  const [roles, setRoles] = useState<PlatformRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PlatformAdminRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ rows: r, error: e }, roleRows] = await Promise.all([
      fetchPlatformAdmins(),
      fetchPlatformRoles(),
    ]);
    setRows(r);
    setRoles(roleRows);
    setError(e);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    void load();
  }, [load, hasAccess]);

  // Deny access if no permission
  if (permLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasAccess) {
    return <AccessDenied message="You do not have permission to manage admin users. Required: platform_admin.manage" />;
  }

  // Staged email/role previously only got cleared after a successful invite -- closing via
  // Cancel/X/Escape left them in place, so reopening the dialog for a genuinely new invite could
  // silently submit a stale role (or email) left over from an earlier attempt in the same
  // session, with no visual cue that it wasn't freshly chosen. Every close path now resets.
  const resetInviteForm = () => {
    setInviteEmail('');
    setInviteRoleId('');
    setInviteError(null);
  };

  const handleInviteOpenChange = (open: boolean) => {
    if (inviting) return;
    setInviteOpen(open);
    if (!open) resetInviteForm();
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteRoleId) {
      setInviteError('Enter an email and choose a role.');
      return;
    }
    setInviting(true);
    setInviteError(null);
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error: err } = await invitePlatformAdmin(inviteEmail, inviteRoleId, redirectTo);
    setInviting(false);
    if (err) {
      setInviteError(err);
      return;
    }
    setInviteOpen(false);
    resetInviteForm();
    await load();
  };

  const handleRoleChange = async (row: PlatformAdminRow, newRoleId: string) => {
    setBusyId(row.platform_user_id);
    const { error: err } = await changePlatformAdminRole(row.platform_user_id, newRoleId);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    await load();
  };

  const handleToggleStatus = async (row: PlatformAdminRow) => {
    const next = row.status === 'suspended' ? 'active' : 'suspended';
    setBusyId(row.platform_user_id);
    const { error: err } = await setPlatformAdminStatus(row.platform_user_id, next);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    await load();
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setBusyId(removeTarget.platform_user_id);
    const { error: err } = await removePlatformAdmin(removeTarget.platform_user_id);
    setBusyId(null);
    setRemoveTarget(null);
    if (err) {
      setError(err);
      return;
    }
    await load();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Admin Users</h2>
          <p className="text-[11px] text-muted-foreground">
            Platform IAM identities with Admin Console access — separate from Business app members.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-3.5" />
            Invite Admin
          </Button>
        </div>
      </div>

      {error ? (
        <div className="shrink-0 border-b border-border bg-destructive/10 px-4 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No platform admins yet.</p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-semibold">Email</th>
                <th className="pb-2 font-semibold">Role</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 font-semibold">Last activity</th>
                <th className="pb-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.platform_user_id} className="border-b border-border/60">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1.5">
                      <Mail className="size-3 text-muted-foreground" />
                      {row.email}
                    </div>
                  </td>
                  <td className="py-2 pr-2">
                    <Select
                      value={row.role_id ?? undefined}
                      onValueChange={(v) => void handleRoleChange(row, v)}
                      disabled={busyId === row.platform_user_id}
                    >
                      <SelectTrigger className="h-7 w-40 text-[11px]">
                        <SelectValue placeholder="No role" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {formatRoleName(r.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="py-2 pr-2">
                    <Badge
                      variant={STATUS_BADGE[row.status] ?? 'secondary'}
                      appearance="light"
                      size="sm"
                    >
                      {row.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-2 text-muted-foreground">
                    {formatLastActivity(row.last_sign_in_at)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleToggleStatus(row)}
                        disabled={busyId === row.platform_user_id}
                      >
                        <ShieldCheck className="size-3" />
                        {row.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemoveTarget(row)}
                        disabled={busyId === row.platform_user_id}
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={inviteOpen} onOpenChange={handleInviteOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <UserPlus className="size-4" />
              Invite Admin
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Role</label>
              <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {formatRoleName(r.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteError ? <p className="text-xs text-destructive">{inviteError}</p> : null}
            <p className="text-[10px] text-muted-foreground">
              The invited person sets up their own sign-in — you never create or see their
              password.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => handleInviteOpenChange(false)} disabled={inviting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={() => void handleInvite()} disabled={inviting}>
              {inviting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.email}?</DialogTitle>
          </DialogHeader>
          <p className="px-1 text-xs text-muted-foreground">
            This permanently removes their Admin Console access and role. It does not affect their
            ability to sign in elsewhere in Pulse.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleRemove()}>
              Remove access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
