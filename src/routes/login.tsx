import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, UserRound, Smartphone, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Entrar · AuditOps" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LoginPage,
});

type LoginResponse = {
  ok?: boolean;
  error?: string;
  mustChangePassword?: boolean;
  requiresOtp?: boolean;
  challengeToken?: string;
  sessionTimeoutMinutes?: number;
  user?: {
    forcePasswordChange: boolean;
    role?: "master" | "custom";
    permissions?: Record<string, boolean>;
  };
};

type LoginMode = "login" | "otp" | "change";

function getSafeNext(user?: LoginResponse["user"]): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes(String.fromCharCode(92))) return next;
  if (user?.role === "master") return "/";
  const allowedRoutes: Array<[string, string]> = [
    ["overview", "/"], ["setores", "/setores"], ["colaboradores", "/colaboradores"],
    ["corredores", "/corredores"], ["calendar", "/atualizar-dados"], ["analysis", "/analise-auditorias"],
    ["reports", "/relatorios"], ["about", "/sobre"],
  ];
  return allowedRoutes.find(([key]) => user?.permissions?.[key])?.[1] ?? "/minha-conta";
}

function LoginPage() {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<LoginMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { authenticated?: boolean; user?: LoginResponse["user"] };
      if (cancelled) return;
      if (data.authenticated && data.user?.forcePasswordChange) setMode("change");
      else if (data.authenticated) window.location.replace(getSafeNext(data.user));
    }).catch(() => undefined).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as LoginResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
      if (data.requiresOtp && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setPassword("");
        setOtpCode("");
        setMode("otp");
      } else if (data.mustChangePassword) {
        setPassword("");
        setMode("change");
      } else {
        window.location.assign(getSafeNext(data.user));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally { setBusy(false); }
  };

  const submitOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/otp/verify-login", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeToken, code: otpCode }),
      });
      const data = await response.json() as LoginResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível validar o autenticador.");
      setChallengeToken("");
      setOtpCode("");
      if (data.mustChangePassword) setMode("change");
      else window.location.assign(getSafeNext(data.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao validar o código.");
    } finally { setBusy(false); }
  };

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 12) { setError("Use pelo menos 12 caracteres na nova senha."); return; }
    if (newPassword !== confirmPassword) { setError("A confirmação não corresponde à nova senha."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newPassword }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a senha.");
      const profileResponse = await fetch("/api/auth/me", { cache: "no-store" });
      const profile = profileResponse.ok ? await profileResponse.json() as { user?: LoginResponse["user"] } : {};
      window.location.assign(getSafeNext(profile.user));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao trocar a senha.");
    } finally { setBusy(false); }
  };

  const goBackToLogin = () => { setMode("login"); setChallengeToken(""); setOtpCode(""); setError(null); };

  const logo = <div className="flex items-center gap-3">
    <motion.span
      className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"
      animate={reduceMotion ? undefined : { rotate: [0, -5, 5, 0], scale: [1, 1.04, 1] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
    ><BadgeCheck className="size-7" /></motion.span>
    <span className="text-2xl font-bold tracking-tight">Audit<span className="text-primary">Ops</span></span>
  </div>;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-130px)] w-full max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
      <motion.div
        className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border/80 bg-card shadow-2xl shadow-black/10 md:grid-cols-[1.04fr_0.96fr]"
        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative hidden min-h-[680px] flex-col justify-between overflow-hidden bg-chrome p-10 text-chrome-foreground lg:flex xl:p-12">
          <motion.div className="absolute -right-28 -top-28 size-[26rem] rounded-full border border-white/10" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 42, repeat: Infinity, ease: "linear" }} />
          <motion.div className="absolute -right-10 -top-10 size-[19rem] rounded-full border border-white/10" animate={reduceMotion ? undefined : { rotate: -360 }} transition={{ duration: 58, repeat: Infinity, ease: "linear" }} />
          <div className="relative">{logo}</div>
          <div className="relative max-w-lg">
            <motion.div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10" animate={reduceMotion ? undefined : { y: [0, -5, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}><ShieldCheck className="size-7" /></motion.div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-primary">Auditoria · inteligência · controle</p>
            <h1 className="text-4xl font-bold leading-[1.13] tracking-tight xl:text-5xl">Auditorias com dados confiáveis e acesso controlado.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-chrome-foreground/70">Informações compartilhadas, permissões por usuário e uma camada extra de segurança com autenticação por aplicativo.</p>
            <div className="mt-7 flex flex-wrap gap-2 text-xs text-chrome-foreground/75">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Histórico SQL</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Perfis personalizados</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">OTP autenticador</span>
            </div>
          </div>
          <p className="relative text-xs text-chrome-foreground/50">AuditOps · Acesso protegido para sua operação</p>
        </div>

        <div className="flex min-h-[640px] flex-col justify-center p-6 sm:p-10 lg:p-12">
          <div className="mb-9 lg:hidden">{logo}</div>
          <AnimatePresence mode="wait" initial={false}>
            {mode === "change" ? (
              <motion.div key="change-password" initial={reduceMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-6" /></div>
                <h2 className="text-3xl font-bold tracking-tight">Crie sua nova senha</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Por segurança, a senha inicial precisa ser trocada antes de acessar o painel. Use pelo menos 12 caracteres.</p>
                <form onSubmit={submitPasswordChange} className="mt-7 space-y-5">
                  <div className="space-y-2"><label htmlFor="new-password" className="text-sm font-semibold">Nova senha</label><Input id="new-password" autoComplete="new-password" type="password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={busy} className="h-12" /></div>
                  <div className="space-y-2"><label htmlFor="confirm-password" className="text-sm font-semibold">Confirmar nova senha</label><Input id="confirm-password" autoComplete="new-password" type="password" minLength={12} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required disabled={busy} className="h-12" /></div>
                  {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
                  <Button type="submit" className="h-12 w-full text-base" disabled={busy || checking}>{busy ? "Salvando…" : "Salvar nova senha e continuar"}</Button>
                </form>
              </motion.div>
            ) : mode === "otp" ? (
              <motion.div key="otp-login" initial={reduceMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Smartphone className="size-6" /></div>
                <h2 className="text-3xl font-bold tracking-tight">Verifique sua identidade</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Digite o código de seis dígitos do aplicativo autenticador. Você também pode usar um código de recuperação que ainda não tenha sido utilizado.</p>
                <form onSubmit={submitOtp} className="mt-7 space-y-5">
                  <div className="space-y-2"><label htmlFor="otp-code" className="text-sm font-semibold">Código autenticador ou recuperação</label><Input id="otp-code" autoComplete="one-time-code" inputMode="text" autoFocus className="h-14 text-center font-mono text-xl tracking-[0.22em]" value={otpCode} onChange={(event) => setOtpCode(event.target.value.toUpperCase().slice(0, 40))} required maxLength={40} disabled={busy} placeholder="000000" /></div>
                  {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
                  <Button type="submit" className="h-12 w-full text-base" disabled={busy || checking || !otpCode}>{busy ? "Validando…" : "Confirmar e entrar"}</Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={goBackToLogin} disabled={busy}><ArrowLeft className="mr-2 size-4" />Voltar para o login</Button>
                </form>
                <div className="mt-5 rounded-xl border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mr-2 inline size-4" />Esta etapa expira em cinco minutos e aceita no máximo cinco tentativas.</div>
              </motion.div>
            ) : (
              <motion.div key="login" initial={reduceMotion ? false : { opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -10 }} transition={{ duration: 0.22 }}>
                <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="size-6" /></div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Bem-vindo de volta</p>
                <h2 className="text-3xl font-bold tracking-tight">Entrar no AuditOps</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Entre com a conta cadastrada pelo usuário mestre para acessar apenas as áreas autorizadas.</p>
                <form onSubmit={submitLogin} className="mt-7 space-y-5">
                  <div className="space-y-2"><label htmlFor="username" className="text-sm font-semibold">Usuário</label><div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="username" autoComplete="username" className="h-12 pl-10" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={32} disabled={busy} placeholder="Digite seu usuário" /></div></div>
                  <div className="space-y-2"><label htmlFor="password" className="text-sm font-semibold">Senha</label><div className="relative"><Input id="password" autoComplete="current-password" type={showPassword ? "text" : "password"} className="h-12 pr-11" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={128} disabled={busy} placeholder="Digite sua senha" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
                  {new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("reason") === "timeout" ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">Sua sessão foi encerrada por inatividade. Entre novamente.</p> : null}
                  {error ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
                  <motion.div whileHover={reduceMotion ? undefined : { scale: 1.01 }} whileTap={reduceMotion ? undefined : { scale: 0.99 }}><Button type="submit" className="h-12 w-full text-base" disabled={busy || checking}>{busy ? "Verificando…" : "Entrar"}</Button></motion.div>
                </form>
                <div className="mt-6 flex items-start gap-2.5 rounded-xl border bg-muted/40 p-4 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><span>Após cinco tentativas incorretas, a conta é bloqueada temporariamente. Usuários com autenticador ativo precisarão confirmar o código no próximo passo.</span></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
