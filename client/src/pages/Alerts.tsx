import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";
import type { Alert, InsertAlert } from "@shared/schema";

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  price_above: { label: "Price Above", icon: TrendingUp, color: "text-green-400" },
  price_below: { label: "Price Below", icon: TrendingDown, color: "text-red-400" },
  vol_spike:   { label: "Vol Spike",   icon: Activity,    color: "text-amber-400" },
  signal_change:{ label: "Signal Change", icon: Zap,      color: "text-blue-400" },
};

export default function AlertsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<InsertAlert>>({
    ticker: "", alertType: "price_above", message: "", isActive: 1,
  });

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
    queryFn: () => apiRequest("GET", "/api/alerts").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertAlert) => apiRequest("POST", "/api/alerts", data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setOpen(false);
      setForm({ ticker: "", alertType: "price_above", message: "", isActive: 1 });
      toast({ title: "Alert created" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/alerts/${id}/toggle`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/${id}`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert removed" });
    },
  });

  const activeCount = alerts.filter(a => a.isActive).length;

  return (
    <div className="flex flex-col min-h-full">
      <header className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Price Alerts</h1>
            {activeCount > 0 && (
              <Badge className="bg-green-500/15 text-green-400 border border-green-500/25">
                {activeCount} active
              </Badge>
            )}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 bg-primary text-primary-foreground" data-testid="btn-new-alert">
                <Plus className="w-3.5 h-3.5 mr-1" /> New Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Alert</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ticker</label>
                  <Input
                    value={form.ticker || ""}
                    onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                    placeholder="SPY"
                    className="font-mono uppercase"
                    data-testid="input-alert-ticker"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Alert Type</label>
                  <Select value={form.alertType || "price_above"} onValueChange={v => setForm(f => ({ ...f, alertType: v }))}>
                    <SelectTrigger data-testid="select-alert-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="price_above">Price Above Threshold</SelectItem>
                      <SelectItem value="price_below">Price Below Threshold</SelectItem>
                      <SelectItem value="vol_spike">Volatility Spike</SelectItem>
                      <SelectItem value="signal_change">Signal Change</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Threshold (optional)</label>
                  <Input
                    type="number"
                    value={form.threshold ?? ""}
                    onChange={e => setForm(f => ({ ...f, threshold: e.target.value ? parseFloat(e.target.value) : undefined }))}
                    placeholder="500.00"
                    data-testid="input-alert-threshold"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Message</label>
                  <Input
                    value={form.message || ""}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="SPY breaks above 500 — review momentum signals"
                    data-testid="input-alert-message"
                  />
                </div>
                <Button
                  className="w-full bg-primary text-primary-foreground"
                  disabled={!form.ticker || !form.message || createMutation.isPending}
                  onClick={() => createMutation.mutate(form as InsertAlert)}
                  data-testid="btn-create-alert"
                >
                  {createMutation.isPending ? "Creating…" : "Create Alert"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Monitor tickers for price levels, volatility events, and signal changes</p>
      </header>

      <div className="flex-1 p-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Bell className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No alerts configured yet.</p>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Create your first alert</Button>
          </div>
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="p-0">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>Ticker</th><th>Type</th><th>Threshold</th>
                    <th>Message</th><th>Active</th><th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map(alert => {
                    const meta = TYPE_META[alert.alertType] || { label: alert.alertType, icon: Bell, color: "text-muted-foreground" };
                    const Icon = meta.icon;
                    return (
                      <tr key={alert.id} data-testid={`alert-row-${alert.id}`}
                        className={!alert.isActive ? "opacity-50" : ""}>
                        <td><span className={`ticker font-bold ${alert.isActive ? "text-green-400" : "text-muted-foreground"}`}>{alert.ticker}</span></td>
                        <td>
                          <span className={`flex items-center gap-1 text-xs font-medium ${meta.color}`}>
                            <Icon className="w-3 h-3" />{meta.label}
                          </span>
                        </td>
                        <td className="font-mono text-muted-foreground">
                          {alert.threshold != null ? `$${alert.threshold.toFixed(2)}` : "—"}
                        </td>
                        <td className="max-w-xs text-muted-foreground truncate">{alert.message}</td>
                        <td>
                          <Switch
                            checked={!!alert.isActive}
                            onCheckedChange={() => toggleMutation.mutate(alert.id)}
                            data-testid={`toggle-alert-${alert.id}`}
                          />
                        </td>
                        <td>
                          <button
                            onClick={() => deleteMutation.mutate(alert.id)}
                            className="text-muted-foreground hover:text-red-400 transition-colors"
                            data-testid={`btn-delete-alert-${alert.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
