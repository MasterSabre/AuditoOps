import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  BarChart3,
  Boxes,
  CalendarDays,
  FileDown,
  Info,
  LayoutDashboard,
  ShieldCheck,
  Menu,
  LogOut,
  Route as RouteIcon,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AuditResult } from "@/lib/audit/types";
import { clearSensitiveAuditCache, setSharedAuditResult } from "@/lib/audit/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuditResult } from "@/lib/audit/store";
import { clearGlobalAuditFilters, setSearchQuery, useSearchQuery } from "@/lib/search-store";
import { GlobalFilterPanel, GlobalFilterToggle } from "@/components/GlobalFilterPanel";
import { cn } from "@/lib/utils";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

const GROUPS = [
  {
    label: "Operação",
    items: [
      { to: "/", label: "Visão geral", icon: LayoutDashboard },
      { to: "/setores", label: "Setores", icon: Boxes },
      { to: "/colaboradores", label: "Colaboradores", icon: Users },
      { to: "/corredores", label: "Corredores", icon: RouteIcon },
    ],
  },
  {
    label: "Dados",
    items: [{ to: "/atualizar-dados", label: "Calendário semanal", icon: CalendarDays }],
  },
  {
    label: "Histórico",
    items: [{ to: "/analise-auditorias", label: "Análise de Auditorias", icon: BarChart3 }],
  },
  {
    label: "Relatórios",
    items: [{ to: "/relatorios", label: "Exportações", icon: FileDown }],
  },
  {
    label: "Sistema",
    items: [
      { to: "/acessos", label: "Acessos e usuários", icon: ShieldCheck },
      { to: "/seguranca-dados", label: "Segurança e recuperação", icon: ShieldCheck },
    ],
  },
  {
    label: "Conta",
    items: [{ to: "/minha-conta", label: "Minha conta", icon: UserRound }],
  },
  {
    label: "Produto",
    items: [{ to: "/sobre", label: "Sobre", icon: Info }],
  },
] as const;

type ClientAuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: "master" | "custom";
  forcePasswordChange: boolean;
  permissions: Record<string, boolean>;
};

const ROUTE_PERMISSION: Record<string, string> = {
  "/": "overview",
  "/setores": "setores",
  "/colaboradores": "colaboradores",
  "/corredores": "corredores",
  "/atualizar-dados": "calendar",
  "/analise-auditorias": "analysis",
  "/relatorios": "reports",
  "/sobre": "about",
  "/minha-conta": "__authenticated__",
};
const DATA_PERMISSIONS = ["overview", "setores", "colaboradores", "corredores", "calendar", "analysis", "reports"];

function hasDataAccess(user: ClientAuthUser | null): boolean {
  return Boolean(user && (user.role === "master" || DATA_PERMISSIONS.some((key) => user.permissions[key])));
}

function firstAllowedClientPath(user: ClientAuthUser): string {
  if (user.role === "master") return "/";
  const options: Array<[string, string]> = [
    ["overview", "/"], ["setores", "/setores"], ["colaboradores", "/colaboradores"],
    ["corredores", "/corredores"], ["calendar", "/atualizar-dados"],
    ["analysis", "/analise-auditorias"], ["reports", "/relatorios"], ["about", "/sobre"],
  ];
  return options.find(([key]) => user.permissions[key])?.[1] ?? "/minha-conta";
}

function canSeeNavigationItem(user: ClientAuthUser, path: string): boolean {
  if (user.role === "master") return true;
  if (path === "/minha-conta") return true;
  if (path === "/acessos" || path === "/seguranca-dados") return false;
  const permission = ROUTE_PERMISSION[path];
  return permission ? user.permissions[permission] === true : false;
}

function NavLinks({ onNavigate, user }: { onNavigate?: () => void; user: ClientAuthUser | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!user) return null;
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeNavigationItem(user, item.to)),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = pathname === item.to;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "app-nav-link group flex items-center rounded-md font-medium transition-all duration-200",
                      active
                        ? "app-nav-active"
                        : "text-muted-foreground hover:translate-x-1 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-5 shrink-0 transition-transform duration-200 group-hover:scale-110 group-active:scale-90" />
                    {item.label}
                    {active ? (
                      <motion.span
                        layoutId="nav-active-dot"
                        className="ml-auto size-1.5 rounded-full bg-primary"
                        transition={{ type: "spring", stiffness: 500, damping: 32 }}
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authUser, setAuthUser] = useState<ClientAuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const result = useAuditResult();
  const query = useSearchQuery();

  useEffect(() => {
    let disposed = false;
    let idleTimer: number | undefined;
    let pollTimer: number | undefined;
    let statusTimer: number | undefined;
    let presenceTimer: number | undefined;
    let serverRunId: number | null = null;
    let lastInteractionAt = Date.now();
    let lastActivityPingAt = 0;
    let sessionTimeoutMinutes = 20;
    const clearCachedData = () => {
      clearSensitiveAuditCache();
      setSharedAuditResult(null);
    };
    const redirectToLogin = (reason?: "timeout") => {
      clearCachedData();
      window.location.assign(reason ? `/login?reason=${reason}` : "/login");
    };
    const logoutForTimeout = async () => {
      try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* navigate regardless */ }
      if (!disposed) redirectToLogin("timeout");
    };
    const scheduleIdleLogout = () => {
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { void logoutForTimeout(); }, sessionTimeoutMinutes * 60_000);
    };
    const syncCurrentAudit = async () => {
      if (Date.now() - lastInteractionAt > 90_000) return;
      const suffix = serverRunId === null ? "" : `?since=${serverRunId}`;
      const response = await fetch(`/api/current-audit${suffix}`, { cache: "no-store" });
      if (response.status === 401) {
        redirectToLogin("timeout");
        return;
      }
      if (!response.ok) return;
      const payload = await response.json() as { runId: number | null; result?: AuditResult | null; unchanged?: boolean };
      if (payload.unchanged) return;
      serverRunId = typeof payload.runId === "number" ? payload.runId : null;
      setSharedAuditResult(payload.result ?? null);
    };
    const onActivity = () => {
      lastInteractionAt = Date.now();
      scheduleIdleLogout();
      if (Date.now() - lastActivityPingAt >= 60_000) {
        lastActivityPingAt = Date.now();
        void fetch("/api/auth/activity", { method: "POST", cache: "no-store" }).then((response) => {
          if (response.status === 401 && !disposed) redirectToLogin("timeout");
        }).catch(() => undefined);
      }
    };
    const handleStartup = async () => {
      try {
        const isLoginPage = window.location.pathname === "/login";
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          if (isLoginPage) { clearCachedData(); if (!disposed) setAuthReady(true); return; }
          redirectToLogin();
          return;
        }
        const payload = await response.json() as { authenticated: boolean; user?: ClientAuthUser; sessionTimeoutMinutes?: number };
        if (!payload.authenticated || !payload.user) {
          if (isLoginPage) { clearCachedData(); if (!disposed) setAuthReady(true); return; }
          redirectToLogin();
          return;
        }
        if (isLoginPage && payload.user.forcePasswordChange) {
          clearCachedData();
          if (!disposed) setAuthReady(true);
          return;
        }
        if (payload.user.forcePasswordChange) {
          clearCachedData();
          window.location.assign("/login?mustChangePassword=1");
          return;
        }
        if (isLoginPage) {
          clearCachedData();
          const next = new URLSearchParams(window.location.search).get("next");
          const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !next.includes(String.fromCharCode(92));
          window.location.assign(safeNext ? next : firstAllowedClientPath(payload.user));
          return;
        }
        if (disposed) return;
        setAuthUser(payload.user);
        sessionTimeoutMinutes = [15, 20, 25, 30].includes(payload.sessionTimeoutMinutes ?? 20) ? payload.sessionTimeoutMinutes ?? 20 : 20;
        if (hasDataAccess(payload.user)) await syncCurrentAudit();
        else setSharedAuditResult(null);
        if (disposed) return;
        setAuthReady(true);
        scheduleIdleLogout();
        const pingPresence = async () => {
          try {
            const response = await fetch("/api/auth/presence", { method: "POST", cache: "no-store" });
            if (response.status === 401 && !disposed) redirectToLogin("timeout");
          } catch { /* the next heartbeat may succeed after a transient network failure */ }
        };
        void pingPresence();
        presenceTimer = window.setInterval(() => { void pingPresence(); }, 30_000);
        window.addEventListener("pointerdown", onActivity, { passive: true });
        window.addEventListener("keydown", onActivity);
        window.addEventListener("touchstart", onActivity, { passive: true });
        window.addEventListener("scroll", onActivity, { passive: true });
        pollTimer = window.setInterval(() => { void syncCurrentAudit(); }, 30_000);
        statusTimer = window.setInterval(async () => {
          try {
            const statusResponse = await fetch("/api/auth/status", { cache: "no-store" });
            if (!statusResponse.ok) { redirectToLogin("timeout"); return; }
            const status = await statusResponse.json() as { authenticated: boolean; sessionTimeoutMinutes?: number; forcePasswordChange?: boolean };
            if (!status.authenticated || status.forcePasswordChange) { redirectToLogin("timeout"); return; }
            if ([15, 20, 25, 30].includes(status.sessionTimeoutMinutes ?? sessionTimeoutMinutes)) {
              sessionTimeoutMinutes = status.sessionTimeoutMinutes ?? sessionTimeoutMinutes;
              if (idleTimer !== undefined) window.clearTimeout(idleTimer);
              const remaining = sessionTimeoutMinutes * 60_000 - (Date.now() - lastInteractionAt);
              idleTimer = window.setTimeout(() => { void logoutForTimeout(); }, Math.max(0, remaining));
            }
          } catch { /* temporary connection losses do not extend the server-side session */ }
        }, 30_000);
      } catch {
        if (!disposed) redirectToLogin();
      }
    };
    void handleStartup();
    return () => {
      disposed = true;
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      if (statusTimer !== undefined) window.clearInterval(statusTimer);
      if (presenceTimer !== undefined) window.clearInterval(presenceTimer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("scroll", onActivity);
    };
  }, []);

  useEffect(() => {
    if (result) {
      clearGlobalAuditFilters();
      setSearchQuery("");
    }
  }, [result]);

  const visibleResult = authReady ? result : null;

  const doLogout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally {
      clearSensitiveAuditCache();
      setSharedAuditResult(null);
      window.location.assign("/login");
    }
  };

  const hoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 shadow-[var(--shadow-chrome)]">
        <div className="bg-chrome text-chrome-foreground">
          <div className="app-topbar">
            <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="chrome"
              size="icon"
              aria-label="Abrir menu"
              onClick={() => setOpen(true)}
              className="text-chrome-foreground transition-transform duration-200 hover:scale-110 hover:bg-chrome-band active:scale-90 lg:hidden"
            >
              <Menu className="size-5" />
            </Button>

            <Link to="/" className="group flex shrink-0 items-center gap-2">
              <span className="app-mark flex shrink-0 items-center justify-center rounded-md btn-gradient text-chrome shadow transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110 group-active:scale-95">
                <BadgeCheck className="size-5" strokeWidth={2.5} />
              </span>
              <span className="app-brand font-bold transition-opacity group-hover:opacity-85">
                Audit<span className="text-primary">Ops</span>
              </span>
            </Link>
            </div>

            {hasDataAccess(authUser) ? <div className="app-desktop-search mx-auto hidden min-w-0 w-full max-w-3xl items-center gap-2 lg:flex">
              <div className="relative flex min-w-0 flex-1 overflow-hidden rounded-md transition-shadow duration-300 focus-within:shadow-[var(--shadow-card-hover)]">
                <Input
                  value={query}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  aria-label="Buscar nas tabelas"
                  placeholder="Buscar produto, código, classe, local, situação ou colaborador"
                  className="app-search rounded-none rounded-l-md border-0 bg-card text-foreground transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button
                  variant="audit"
                  type="button"
                  className="app-search-action shrink-0"
                  aria-label="Pesquisa global ativa"
                  title="Digite para pesquisar nas tabelas e registros"
                >
                  <Search
                    className={cn(
                      "size-4.5 transition-transform duration-300",
                      query ? "scale-110" : "",
                    )}
                    strokeWidth={2.5}
                  />
                </Button>
              </div>
              <GlobalFilterToggle open={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} />
            </div> : null}

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full bg-chrome-band px-3 py-1.5 text-xs font-semibold sm:inline-flex">
                {hoje}
              </span>
              <span className="inline-flex max-w-40 items-center gap-1.5 truncate rounded-full bg-chrome-band px-3 py-1.5 text-xs font-semibold" title={authUser?.username ?? ""}>
                <UserRound className="size-3.5 shrink-0" />
                <span className="truncate">{authUser?.displayName ?? "Verificando acesso…"}</span>
              </span>
              {authUser ? <Button variant="chrome" size="icon" aria-label="Encerrar sessão" title="Encerrar sessão" onClick={() => void doLogout()}><LogOut className="size-4" /></Button> : null}
            </div>
          </div>
        </div>

        <div className="theme-toolbar">
          <ThemeSwitcher />
        </div>

        <div className="bg-chrome-band text-chrome-foreground">
          <div className="app-statusbar overflow-hidden">
            <AnimatePresence mode="wait">
              {visibleResult ? (
                <motion.span
                  key="loaded"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                >
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-primary-foreground opacity-60" />
                    <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
                  </span>
                  <BarChart3 className="size-3.5" />
                  Auditoria {visibleResult.auditoria}
                </motion.span>
              ) : (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-full bg-chrome px-3 py-1 text-xs font-semibold"
                >
                  Nenhuma auditoria carregada
                </motion.span>
              )}
            </AnimatePresence>
            {visibleResult ? (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="min-w-0 truncate text-sm text-chrome-foreground/80"
              >
                {visibleResult.origem} · {visibleResult.sku.toLocaleString("pt-BR")} SKU · data{" "}
                {visibleResult.dataAuditoria}
              </motion.span>
            ) : null}
          </div>
        </div>

        {hasDataAccess(authUser) ? <div className="lg:hidden">
          <div className="flex items-center gap-2 bg-chrome-band px-3 pb-3">
            <Input
              value={query}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Buscar nas tabelas"
              placeholder="Buscar nas tabelas"
              className="app-search min-w-0 border-0 bg-card text-foreground"
            />
            <GlobalFilterToggle open={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} />
          </div>
        </div> : null}
        {hasDataAccess(authUser) ? <GlobalFilterPanel open={filtersOpen} result={visibleResult} /> : null}
      </header>

      <div className="app-workspace">
        <aside className="app-sidebar hidden lg:block">
          <NavLinks user={authUser} />
        </aside>

        <main id="conteudo" className="min-w-0">{authReady ? children : <div className="flex min-h-[55vh] items-center justify-center px-6"><div className="max-w-sm text-center"><div className="mx-auto size-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" /><p className="mt-4 font-semibold">Verificando sessão e carregando dados compartilhados</p><p className="mt-1 text-sm text-muted-foreground">O AuditOps está validando suas permissões e sincronizando o último processamento.</p></div></div>}</main>
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 bg-foreground/50 lg:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto bg-sidebar p-4 shadow-xl lg:hidden"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="text-lg font-bold">
                  Audit<span className="text-primary">Ops</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar menu"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-5" />
                </Button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} user={authUser} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <footer className="border-t bg-chrome py-6 text-center text-xs text-chrome-foreground/70">
        AuditOps · plataforma de auditoria de estoque · histórico persistido em banco SQL local
      </footer>
    </div>
  );
}
