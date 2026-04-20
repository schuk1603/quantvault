import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Newspaper, Trash2, Circle } from "lucide-react";
import type { NewsAnnotation } from "@shared/schema";

type Signal = "bullish" | "bearish" | "neutral";
type FilterSignal = "all" | Signal;

interface FormState {
  headline: string;
  ticker: string;
  signal: Signal;
  importance: number;
  notes: string;
}

const defaultForm: FormState = {
  headline: "",
  ticker: "",
  signal: "neutral",
  importance: 3,
  notes: "",
};

function SignalBadge({ signal }: { signal: string }) {
  const config: Record<string, { label: string; style: React.CSSProperties }> = {
    bullish: {
      label: "Bullish",
      style: { background: "hsl(152 69% 45% / 0.15)", color: "hsl(152 69% 55%)", border: "1px solid hsl(152 69% 45% / 0.3)" },
    },
    bearish: {
      label: "Bearish",
      style: { background: "hsl(0 72% 55% / 0.15)", color: "hsl(0 72% 65%)", border: "1px solid hsl(0 72% 55% / 0.3)" },
    },
    neutral: {
      label: "Neutral",
      style: { background: "hsl(220 13% 18%)", color: "hsl(213 8% 55%)", border: "1px solid hsl(var(--border))" },
    },
  };
  const c = config[signal] ?? config.neutral;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={c.style}>
      {c.label}
    </span>
  );
}

function ImportanceDots({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <Circle
          key={i}
          className="w-2 h-2"
          style={{
            fill: i < value ? "hsl(152 69% 45%)" : "hsl(var(--border))",
            color: i < value ? "hsl(152 69% 45%)" : "hsl(var(--border))",
          }}
        />
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  } catch {
    return iso;
  }
}

export default function News() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [filterSignal, setFilterSignal] = useState<FilterSignal>("all");
  const [form, setForm] = useState<FormState>(defaultForm);

  const { data: annotations = [], isLoading } = useQuery<NewsAnnotation[]>({
    queryKey: ["/api/annotations"],
  });

  // Sort by createdAt descending
  const sorted = [...annotations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const filtered = sorted.filter((a) => {
    if (filterSignal === "all") return true;
    return a.signal === filterSignal;
  });

  const addMutation = useMutation({
    mutationFn: async (data: FormState) => {
      await apiRequest("POST", "/api/annotations", {
        newsId: `manual-${Date.now()}`,
        headline: data.headline.trim(),
        ticker: data.ticker.trim().toUpperCase() || null,
        signal: data.signal,
        importance: data.importance,
        notes: data.notes || null,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/annotations"] });
      setDialogOpen(false);
      setForm(defaultForm);
      toast({ title: "Annotation added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/annotations/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/annotations"] });
      toast({ title: "Annotation deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.headline) {
      toast({ title: "Headline is required", variant: "destructive" });
      return;
    }
    addMutation.mutate(form);
  }

  const filterCounts = {
    all: annotations.length,
    bullish: annotations.filter((a) => a.signal === "bullish").length,
    bearish: annotations.filter((a) => a.signal === "bearish").length,
    neutral: annotations.filter((a) => a.signal === "neutral").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Newspaper className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            News Annotations
          </h1>
          {annotations.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {annotations.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => { setForm(defaultForm); setDialogOpen(true); }}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Annotation
        </Button>
      </div>

      {/* Signal filter */}
      <div className="flex items-center gap-1.5">
        {(["all", "bullish", "bearish", "neutral"] as FilterSignal[]).map((sig) => (
          <button
            key={sig}
            onClick={() => setFilterSignal(sig)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-all"
            style={
              filterSignal === sig
                ? { background: "hsl(var(--accent))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }
                : { background: "transparent", color: "hsl(var(--muted-foreground))", border: "1px solid transparent" }
            }
          >
            <span className="capitalize">{sig}</span>
            <span className="text-[10px] opacity-60">
              {filterCounts[sig]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-card/60">
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Headline</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground w-20">Ticker</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground w-24">Signal</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground w-28">Importance</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Notes</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground w-24">Date</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Newspaper className="w-8 h-8 opacity-25" />
                    <p className="text-sm font-medium">
                      {filterSignal === "all" ? "No annotations yet" : `No ${filterSignal} annotations`}
                    </p>
                    <p className="text-xs opacity-60">Annotate news to track market signals</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow key={item.id} className="border-border hover:bg-accent/30 transition-colors">
                  <TableCell className="text-sm text-foreground/90 max-w-[320px]">
                    <span className="line-clamp-2">{item.headline}</span>
                  </TableCell>
                  <TableCell>
                    {item.ticker ? (
                      <span className="font-mono font-semibold text-xs text-primary">{item.ticker}</span>
                    ) : (
                      <span className="text-muted-foreground/40 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SignalBadge signal={item.signal} />
                  </TableCell>
                  <TableCell>
                    <ImportanceDots value={item.importance} />
                  </TableCell>
                  <TableCell className="max-w-[200px] text-xs text-muted-foreground truncate">
                    {item.notes || <span className="opacity-30">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      onClick={() => setDeleteId(item.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Annotation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>Add Annotation</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Headline *</Label>
              <Input
                placeholder="Fed signals rate cut ahead of CPI data…"
                value={form.headline}
                onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                className="bg-background border-border text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Ticker (optional)</Label>
                <Input
                  placeholder="AAPL"
                  value={form.ticker}
                  onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  className="font-mono bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Signal</Label>
                <Select
                  value={form.signal}
                  onValueChange={(v) => setForm((f) => ({ ...f, signal: v as Signal }))}
                >
                  <SelectTrigger className="bg-background border-border text-sm capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="bullish">Bullish</SelectItem>
                    <SelectItem value="bearish">Bearish</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Importance — {form.importance}/5
              </Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, importance: n }))}
                    className="flex-1 h-7 rounded text-xs font-semibold transition-all"
                    style={
                      form.importance >= n
                        ? { background: "hsl(152 69% 45% / 0.25)", color: "hsl(152 69% 55%)", border: "1px solid hsl(152 69% 45% / 0.4)" }
                        : { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" }
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Notes</Label>
              <Textarea
                placeholder="Your interpretation of this news…"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="bg-background border-border resize-none text-sm"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} className="border-border">
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Saving…" : "Save Annotation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete annotation?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId !== null) {
                  deleteMutation.mutate(deleteId);
                  setDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
