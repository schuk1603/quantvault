import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Sidebar from "@/components/Sidebar";

import Dashboard from "@/pages/Dashboard";
import Watchlist from "@/pages/Watchlist";
import AlertsPage from "@/pages/Alerts";
import Signals from "@/pages/Signals";
import Backtest from "@/pages/Backtest";
import Portfolio from "@/pages/Portfolio";
import Theses from "@/pages/Theses";
import News from "@/pages/News";
import Company from "@/pages/Company";
import AIAnalyst from "@/pages/AIAnalyst";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <div className="dark flex h-full bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/watchlist" component={Watchlist} />
          <Route path="/alerts" component={AlertsPage} />
          <Route path="/signals/:ticker" component={Signals} />
          <Route path="/signals" component={Signals} />
          <Route path="/backtest" component={Backtest} />
          <Route path="/portfolio" component={Portfolio} />
          <Route path="/theses" component={Theses} />
          <Route path="/news" component={News} />
          <Route path="/company/:ticker" component={Company} />
          <Route path="/ai" component={AIAnalyst} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
