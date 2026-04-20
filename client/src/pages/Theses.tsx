import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Star, MoreHorizontal, Trash2, ChevronDown } from "lucide-react";
import type { Thesis } from "@shared/schema";

const TIME_HORIZONS = ["1W", "1M", "3M", "6M", "1Y", "2Y+"];
const STATUSES = ["active", "monitoring", "closed"] as const;
type StatusType = typeof STATUSES[number];

interface FormState {
  ticker: string;
  companyName: string;
  direction: "long" | "short";
  conviction: number;
  thesis: string;
  catalysts: string;
  risks: string;
  targetPrice: string;
  timeHorizon: string;
  status: StatusType;
}

const defaultForm: FormState = {
  ticker: "",
  companyName: "",
  direction: "long",
  conviction: 3,
  thesis: "",
  catalysts: "",
  risks: "",
  targetPrice: "",
  timeHorizon: "3M",
  status: "active",
};

function safeParseArray(val: string): string[] {
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function ConvictionStars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="w-3 h-3"
          style={{
            fill: i < value ? "hsl(38 92% 50%)" : "transparent",
            color: i < value ? "hsl(38 92% 50%)" : "hsl(var(--border))",
          }}
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; style: React.CSSProperties }> = {
    active: { label: "Active", style: { background: "hsl(152 69% 45% / 0.15)", color: "hsl(152 69% 55%)", border: "1px solid hsl(152 69% 45% / 0.35)" } },
    monitoring: { label: "Monitoring", style: { background: "hsl(38 92% 50% / 0.12)", color: "hsl(38 92% 60%)", border: "1px solid hsl(38 92% 50% / 0.3)" } },
    closed: { label: "Closed", style: { background: "hsl(220 13% 16%)", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" } },
  };
  const c = config[status] ?? config.closed;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={c.style}>
      {c.label}
    </span>
  );
}

export default function Theses() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterTab, setFilterTab] = useState("all");
  const [form, setForm] = useState<FormState>(defaultForm);

  const { data: theses = [], isLoading } = useQuery<Thesis[]>({
    queryKey: ["/api/theses"],
  });

  const filtered = theses.filter((t) => {
    if (filterTab === "all") return true;
    return t.status === filterTab;
  });

  const addMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const catalystsArr = data.catalysts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const risksArr = data.risks
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await apiRequest("POST", "/api/theses", {
        ticker: data.ticker.toUpperCase().trim(),
        companyName: data.companyName.trim(),
        direction: data.direction,
        conviction: data.conviction,
        thesis: data.thesis,
        catalysts: JSON.stringify(catalystsArr),
        risks: JSON.stringify(risksArr),
        targetPrice: data.targetPrice ? parseFloat(data.targetPrice) : null,
        timeHorizon: data.timeHorizon,
        status: data.status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/theses"] });
      setDialogOpen(false);
      setForm(defaultForm);
      toast({ title: "Thesis created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: StatusType }) => {
      await apiRequest("PATCH", `/api/theses/${id}`, { status, updatedAt: new Date().toISOString() });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/theses"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/theses/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/theses"] });
      toast({ title: "Thesis deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker || !form.companyName || !form.thesis) {
      toast({ title: "Ticker, company, and thesis text are required", variant: "destructive" });
      return;
    }
    addMutation.mutate(form);
  }

  const tabCounts = {
    all: theses.length,
    active: theses.filter((t) => t.status === "active").length,
    monitoring: theses.filter((t) => t.status === "monitoring").length,
    closed: theses.filter((t) => t.status === "closed").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Investment Theses
          </h1>
        </div>
        <Button size="sm" onClick={() => { setForm(defaultForm); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          New Thesis
        </Button>
      </div>

      {/* Filter tabs */}
      <Tabs value={filterTab} onValueChange={setFilterTab}>
        <TabsList className="bg-card border border-border h-8">
          {(["all", "active", "monitoring", "closed"] as const).map((tab) => (
            <TabsTrigger key={tab} value={tab} className="text-xs capitalize h-6 px-3 gap-1.5">
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="text-[10px] text-muted-foreground">
                {tabCounts[tab]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-52 gap-2 text-muted-foreground">
          <FileText className="w-8 h-8 opacity-25" />
          <p className="text-sm font-medium">No theses found</p>
          <p className="text-xs opacity-60">
            {filterTab === "all" ? "Create your first investment thesis" : `No ${filterTab} theses`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((thesis) => {
            const catalysts = safeParseArray(thesis.catalysts);
            const isLong = thesis.direction === "long";

            return (
              <div
                key={thesis.id}
                className="rounded-lg border border-border bg-card p-4 space-y-3 hover:border-border/80 transition-colors"
                style={{ borderLeft: `3px solid ${isLong ? "hsl(152 69% 45%)" : "hsl(0 72% 55%)"}` }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                      style={
                        isLong
                          ? { background: "hsl(152 69% 45% / 0.15)", color: "hsl(152 69% 55%)", border: "1px solid hsl(152 69% 45% / 0.3)" }
                          : { background: "hsl(0 72% 55% / 0.15)", color: "hsl(0 72% 65%)", border: "1px solid hsl(0 72% 55% / 0.3)" }
                      }
                    >
                      {isLong ? "LONG" : "SHORT"}
                    </span>
                    <button
                      onClick={() => navigate(`/company/${thesis.ticker}`)}
                      className="font-mono font-bold text-base text-primary hover:text-primary/80 transition-colors"
                    >
                      {thesis.ticker}
                    </button>
                    <span className="text-sm text-muted-foreground truncate max-w-[140px]">{thesis.companyName}</span>
                    {thesis.timeHorizon && (
                      <span className="text-xs text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded font-mono">
                        {thesis.timeHorizon}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={thesis.status} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border w-40">
                        {STATUSES.filter((s) => s !== thesis.status).map((s) => (
                          <DropdownMenuItem
                            key={s}
                            className="text-xs capitalize cursor-pointer"
                            onClick={() => updateStatusMutation.mutate({ id: thesis.id, status: s })}
                          >
                            Mark as {s}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem
                          className="text-xs text-destructive cursor-pointer focus:text-destructive focus:bg-destructive/10"
                          onClick={() => deleteMutation.mutate(thesis.id)}
                        >
                          <Trash2 className="w-3 h-3 mr-1.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Conviction */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Conviction</span>
                  <ConvictionStars value={thesis.conviction} />
                </div>

                {/* Thesis preview */}
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {thesis.thesis.slice(0, 160)}{thesis.thesis.length > 160 ? "…" : ""}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                  <div className="flex flex-wrap gap-1">
                    {catalysts.slice(0, 2).map((c, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80"
                      >
                        {c}
                      </span>
                    ))}
                    {catalysts.length > 2 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/50">
                        +{catalysts.length - 2}
                      </span>
                    )}
                  </div>
                  {thesis.targetPrice != null && (
                    <span className="font-mono text-xs text-muted-foreground">
                      Target: <span className="text-foreground">${thesis.targetPrice.toFixed(2)}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Thesis Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg border-border bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>New Investment Thesis</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ticker *</Label>
                <Input
                  placeholder="AAPL"
                  value={form.ticker}
                  onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  className="font-mono bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Direction</Label>
                <Select
                  value={form.direction}
                  onValueChange={(v) => setForm((f) => ({ ...f, direction: v as "long" | "short" }))}
                >
                  <SelectTrigger className="bg-background border-border text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Company Name *</Label>
              <Input
                placeholder="Apple Inc."
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                className="bg-background border-border"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Conviction — {form.conviction}/5
              </Label>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[form.conviction]}
                onValueChange={([v]) => setForm((f) => ({ ...f, conviction: v }))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/50">
                <span>Weak</span>
                <span>Strong</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Thesis *</Label>
              <Textarea
                placeholder="Describe your investment thesis…"
                value={form.thesis}
                onChange={(e) => setForm((f) => ({ ...f, thesis: e.target.value }))}
                rows={4}
                className="bg-background border-border resize-none text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Catalysts (comma-sep)</Label>
                <Input
                  placeholder="Earnings, Product launch…"
                  value={form.catalysts}
                  onChange={(e) => setForm((f) => ({ ...f, catalysts: e.target.value }))}
                  className="bg-background border-border text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Risks (comma-sep)</Label>
                <Input
                  placeholder="Competition, Regulation…"
                  value={form.risks}
                  onChange={(e) => setForm((f) => ({ ...f, risks: e.target.value }))}
                  className="bg-background border-border text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Target Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="250.00"
                  value={form.targetPrice}
                  onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))}
                  className="font-mono bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Time Horizon</Label>
                <Select
                  value={form.timeHorizon}
                  onValueChange={(v) => setForm((f) => ({ ...f, timeHorizon: v }))}
                >
                  <SelectTrigger className="bg-background border-border text-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {TIME_HORIZONS.map((h) => (
                      <SelectItem key={h} value={h} className="font-mono">{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as StatusType }))}
                >
                  <SelectTrigger className="bg-background border-border text-sm capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-border">
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Creating…" : "Create Thesis"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
