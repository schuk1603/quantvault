import { useHashLocation } from "wouter/use-hash-location";
import { Link } from "wouter";
import {
  LayoutGrid,
  Bookmark,
  Bell,
  TrendingUp,
  PlayCircle,
  PieChart,
  FileText,
  Newspaper,
  Building2,
  Bot,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "MARKET",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutGrid },
      { label: "Watchlist", href: "/watchlist", icon: Bookmark },
      { label: "Alerts", href: "/alerts", icon: Bell },
    ],
  },
  {
    label: "ALPHA",
    items: [
      { label: "Signals", href: "/signals", icon: TrendingUp },
      { label: "Backtest", href: "/backtest", icon: PlayCircle },
      { label: "Portfolio", href: "/portfolio", icon: PieChart },
    ],
  },
  {
    label: "RESEARCH",
    items: [
      { label: "Theses", href: "/theses", icon: FileText },
      { label: "News", href: "/news", icon: Newspaper },
      { label: "Company", href: "/company/AAPL", icon: Building2 },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "AI Analyst", href: "/ai", icon: Bot },
    ],
  },
];

export default function Sidebar() {
  const [location] = useHashLocation();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(href: string) {
    if (href === "/") return location === "/" || location === "";
    return location.startsWith(href);
  }

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-border bg-card transition-all duration-200 shrink-0",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-2.5 px-3 py-4 border-b border-border", collapsed && "justify-center px-0")}>
        <div
          className="flex items-center justify-center rounded-md shrink-0"
          style={{
            width: 32,
            height: 32,
            background: "hsl(152 69% 45% / 0.15)",
            border: "1px solid hsl(152 69% 45% / 0.35)",
          }}
        >
          <span
            className="font-bold text-xs"
            style={{ fontFamily: "var(--font-display)", color: "hsl(152 69% 45%)" }}
          >
            QV
          </span>
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight min-w-0">
            <span className="font-bold text-sm text-foreground truncate" style={{ fontFamily: "var(--font-display)" }}>
              QuantVault
            </span>
            <span className="text-[10px] text-muted-foreground tracking-wide">Institutional Research</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest text-muted-foreground/60 uppercase">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href}>
                      <a
                        className={cn(
                          "flex items-center gap-2.5 rounded-md transition-all cursor-pointer select-none",
                          collapsed ? "justify-center p-2" : "px-2.5 py-1.5",
                          active
                            ? "text-foreground bg-accent"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
                        )}
                        style={active ? { borderLeft: "2px solid hsl(152 69% 45%)", paddingLeft: collapsed ? undefined : "0.5rem" } : {}}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon
                          className={cn(
                            "shrink-0",
                            collapsed ? "w-4 h-4" : "w-3.5 h-3.5",
                            active ? "text-[hsl(152_69%_52%)]" : "text-current"
                          )}
                        />
                        {!collapsed && (
                          <span className="text-[13px] font-medium truncate">{item.label}</span>
                        )}
                      </a>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-border px-3 py-3 flex items-center", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <span className="text-[10px] text-muted-foreground/50 leading-tight">
            Powered by<br />
            <span className="text-muted-foreground/70">QuantCore + Samfynd</span>
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-all"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
