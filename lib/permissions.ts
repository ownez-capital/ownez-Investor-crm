import type { UserRole, UserPermissions } from "./types";

const ROLE_DEFAULTS: Record<UserRole, UserPermissions> = {
  rep:       { canViewLeadership: false, canAccessAdmin: false, canReassignProspects: false, canViewAllProspects: true,  canMarkDead: true  },
  marketing: { canViewLeadership: true,  canAccessAdmin: false, canReassignProspects: false, canViewAllProspects: true,  canMarkDead: true  },
  admin:     { canViewLeadership: true,  canAccessAdmin: true,  canReassignProspects: true,  canViewAllProspects: true,  canMarkDead: true  },
};

export function hasPermission(
  user: { role: UserRole; permissions?: UserPermissions },
  key: keyof UserPermissions
): boolean {
  if (user.permissions?.[key] !== undefined) return user.permissions[key]!;
  return ROLE_DEFAULTS[user.role][key] ?? false;
}

export function hasPermissionByRole(role: UserRole, key: keyof UserPermissions): boolean {
  return ROLE_DEFAULTS[role][key] ?? false;
}
