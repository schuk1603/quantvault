import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { Plus, Trash2, Bookmark, TrendingUp, TrendingDown } from "lucide-react";
import type { WatchlistItem } from "@shared/schema";

const SECTORS = ["Technology", "Healthcare", "Finance", "Energy", "Consumer", "Industrial", "Other"];

interface QuoteData {
  ticker: string;
  price: number;
  changePct: number;
  change: number;
}

interface FormState {
  ticker: string;
  companyName: string;
  sector: string;
  targetPrice: string;
  alertPrice: string;
  notes: string;
}

const defaultForm: FormState = {
  ticker: "",
  companyName: "",
  sector: "",
  targetPrice: "",
  alertPrice: "",
  notes: "",
};

export default function Watchlist() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  // Fetch watchlist
  const { data: watchlist = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  // Fetch live quotes for all tickers
  const tickers = watchlist.map((w) => w.ticker).join(",");
  const { data: quotes } = useQuery<QuoteData[]>({
    queryKey: ["/api/market/quotes", tickers],
    queryFn: async () => {
      if (!tickers) return [];
      const res = await apiRequest("GET", `/api/market/quotes?tickers=${tickers}`);
      return res.json();
    },
    enabled: watchlist.length > 0,
    staleTime: 60_000,
  });

  const quotesMap = new Map<string, QuoteData>(
    (quotes ?? []).map((q) => [q.ticker.toUpperCase(), q])
  );

  // Add ticker
  const addMutation = useMutation({
    mutationFn: async (data: FormState) => {
      const body: Record<string, unknown> = {
        ticker: data.ticker.toUpperCase().trim(),
        companyName: data.companyName.trim(),
        sector: data.sector || null,
        notes: data.notes || null,
        targetPrice: data.targetPrice ? parseFloat(data.targetPrice) : null,
        alertPrice: data.alertPrice ? parseFloat(data.alertPrice) : null,
        addedAt: new Date().toISOString(),
      };
      await apiRequest("POST", "/api/watchlist", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setDialogOpen(false);
      setForm(defaultForm);
      toast({ title: "Ticker added to watchlist" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete ticker
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/watchlist/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/watchlist"] });
      toast({ title: "Ticker removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker || !form.companyName) {
      toast({ title: "Ticker and company name are required", variant: "destructive" });
      return;
    }
    addMutation.mutate(form);
  }

  function fmtPrice(n: number | null | undefined) {
    if (n == null) return "—";
    return `$${n.toFixed(2)}`;
  }

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Bookmark className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Watchlist
          </h1>
          {watchlist.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {watchlist.length}
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => { setForm(defaultForm); setDialogOpen(true); }}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Ticker
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-card/60">
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground w-28">Ticker</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Company</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Sector</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground text-right">Live Price</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground text-right">Target</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground text-right">Alert</TableHead>
              <TableHead className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i} className="border-border">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : watchlist.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Bookmark className="w-8 h-8 opacity-25" />
                    <p className="text-sm font-medium">No tickers on your watchlist yet</p>
                    <p className="text-xs opacity-60">Add a ticker to start tracking</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              watchlist.map((item) => {
                const q = quotesMap.get(item.ticker.toUpperCase());
                const isUp = q ? q.changePct >= 0 : null;
                return (
                  <TableRow key={item.id} className="border-border hover:bg-accent/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/company/${item.ticker.toUpperCase()}`)}
                          className="font-mono font-bold text-sm text-primary hover:text-primary/80 transition-colors underline-offset-2 hover:underline"
                        >
                          {item.ticker.toUpperCase()}
                        </button>
                        {q && (
                          isUp
                            ? <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                            : <TrendingDown className="w-3 h-3 text-red-500 shrink-0" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground/90 max-w-[180px] truncate">
                      {item.companyName}
                    </TableCell>
                    <TableCell>
                      {item.sector ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {item.sector}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {q ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-sm text-foreground">${q.price.toFixed(2)}</span>
                          <span
                            className="font-mono text-xs"
                            style={{ color: isUp ? "hsl(152 69% 45%)" : "hsl(0 72% 55%)" }}
                          >
                            {isUp ? "+" : ""}{q.changePct.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtPrice(item.targetPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtPrice(item.alertPrice)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {item.notes || <span className="opacity-30">—</span>}
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Ticker Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-display)" }}>Add Ticker</DialogTitle>
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
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Sector</Label>
                <Select
                  value={form.sector}
                  onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}
                >
                  <SelectTrigger className="bg-background border-border text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {SECTORS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Target Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="200.00"
                  value={form.targetPrice}
                  onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))}
                  className="font-mono bg-background border-border"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Alert Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="180.00"
                  value={form.alertPrice}
                  onChange={(e) => setForm((f) => ({ ...f, alertPrice: e.target.value }))}
                  className="font-mono bg-background border-border"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Notes</Label>
              <Textarea
                placeholder="Research notes, thesis summary…"
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
                {addMutation.isPending ? "Adding…" : "Add Ticker"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from watchlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the ticker from your watchlist.
            </AlertDialogDescription>
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
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
