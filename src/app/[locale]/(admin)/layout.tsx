import { Link } from "@/i18n/navigation";
import { LayoutDashboard, Users, Sparkles, BarChart3, Bell } from "lucide-react";

const adminNav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/skills", label: "Skills", icon: Sparkles },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/push", label: "Push", icon: Bell },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // In production: check if user has role='super_admin'
  // If not, redirect to /chat

  return (
    <div className="min-h-dvh flex">
      <aside className="w-56 bg-white/[0.02] border-r border-white/[0.06] p-4 space-y-1 flex-shrink-0">
        <div className="text-lg font-bold text-purple-400 mb-6 px-2">DILO Admin</div>
        {adminNav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/[0.05] transition"
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </aside>
      <main className="flex-1 p-6 overflow-y-auto">{children}</main>
    </div>
  );
}
