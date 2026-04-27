"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  GitBranch,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/lib/auth";
import type { UserRole, UserPermissions } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: UserRole[];
  permission?: keyof UserPermissions;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["rep", "marketing", "admin"] },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, roles: ["rep", "marketing", "admin"] },
  { href: "/people", label: "People", icon: Users, roles: ["rep", "marketing", "admin"] },
  { href: "/leadership", label: "Leadership", icon: BarChart3, permission: "canViewLeadership" },
  { href: "/admin", label: "Admin", icon: Settings, permission: "canAccessAdmin" },
];

function isVisible(item: NavItem, role: UserRole, permissions?: UserPermissions): boolean {
  if (item.permission) return hasPermission({ role, permissions }, item.permission);
  if (item.roles) return item.roles.includes(role);
  return false;
}

export function SidebarNav({ role, permissions }: { role: UserRole; permissions?: UserPermissions }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-0.5 px-3 py-4">
      {NAV_ITEMS.filter((item) => isVisible(item, role, permissions)).map((item) => {
        const Icon = item.icon;
        const isActive = item.href === "/"
          ? pathname === "/"
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-base font-medium transition-colors ${
              isActive
                ? "text-gold bg-navy-light"
                : "text-white/70 hover:bg-navy-light hover:text-white"
            }`}
          >
            <Icon size={18} className="shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ["Dashboard", "Pipeline", "People"].includes(item.label)
);

const ROLE_LABELS: Record<UserRole, string> = {
  rep: "Rep",
  marketing: "Marketing",
  admin: "Admin",
};

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MobileNav({ role, fullName, permissions }: { role: UserRole; fullName: string; permissions?: UserPermissions }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);

  const firstName = fullName.trim().split(/\s+/)[0] || "?";
  const initials = getInitials(fullName);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t bg-navy safe-bottom">
        {MOBILE_NAV_ITEMS.filter((item) => isVisible(item, role, permissions)).map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                isActive ? "text-gold" : "text-white/60"
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}

        {/* User / logout tab */}
        <button
          onClick={() => setSheetOpen(true)}
          aria-label="Open user menu"
          className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
            sheetOpen ? "text-gold" : "text-white/60"
          }`}
        >
          <span
            className={`w-[22px] h-[22px] rounded-full bg-white/15 text-gold text-[10px] font-bold flex items-center justify-center ${
              sheetOpen ? "ring-1 ring-gold ring-offset-1 ring-offset-navy" : ""
            }`}
          >
            {initials}
          </span>
          {firstName}
        </button>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe px-6 pt-0">
          <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mt-3 mb-5" />
          <div className="flex items-center gap-3 mb-6">
            <span className="w-10 h-10 rounded-full bg-navy/10 text-gold text-base font-bold flex items-center justify-center shrink-0">
              {initials}
            </span>
            <div>
              <p className="text-base font-semibold text-navy">{fullName}</p>
              <Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
            </div>
          </div>
          <div className="border-t mb-4" />
          <button
            onClick={handleLogout}
            className="w-full rounded-full border border-alert-red/30 py-3 text-sm font-medium text-alert-red hover:bg-alert-red-light transition-colors"
          >
            Sign out
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}
