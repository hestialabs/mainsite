'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  Cpu,
  Key,
  Upload,
  FileText,
  Shield,
  Workflow,
  Webhook,
  Activity,
  LogOut,
  Home,
  QrCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: <Activity className="w-4 h-4" /> },
  { label: 'Infrastructure', href: '/dashboard/infrastructure', icon: <Home className="w-4 h-4" /> },
  { label: 'Devices', href: '/dashboard/devices', icon: <Cpu className="w-4 h-4" /> },
  { label: 'Provisioning', href: '/dashboard/provisioning', icon: <QrCode className="w-4 h-4" /> },
  { label: 'Developer Keys', href: '/dashboard/keys', icon: <Key className="w-4 h-4" /> },
  { label: 'OTA / Firmware', href: '/dashboard/firmware', icon: <Upload className="w-4 h-4" /> },
  { label: 'Logs', href: '/dashboard/logs', icon: <FileText className="w-4 h-4" /> },
  { label: 'Capabilities', href: '/dashboard/capabilities', icon: <Shield className="w-4 h-4" /> },
  { label: 'Automation', href: '/dashboard/automation', icon: <Workflow className="w-4 h-4" /> },
  { label: 'API & Webhooks', href: '/dashboard/api-keys', icon: <Webhook className="w-4 h-4" /> },
  { label: 'System Health', href: '/dashboard/health', icon: <Activity className="w-4 h-4" />, adminOnly: true },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-xs uppercase tracking-widest text-muted-foreground">
          Loading Control Plane...
        </div>
      </div>
    );
  }

  const filteredNav = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/30 flex flex-col">
        <div className="p-6 border-b border-border">
          <Link href="/dashboard" className="block">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Hestia
            </div>
            <div className="text-lg font-bold uppercase tracking-tighter">
              Control
            </div>
          </Link>
        </div>

        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-3">
            {filteredNav.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-xs uppercase tracking-widest font-medium transition-colors',
                    isActive
                      ? 'bg-foreground/5 text-foreground border-l-2 border-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t border-border space-y-3">
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {user.email}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Role: {user.role}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            onClick={logout}
          >
            <LogOut className="w-3 h-3" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
