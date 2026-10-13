import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { KeyRound, LockKeyhole, RefreshCw, ShieldCheck, ShieldOff, UserPlus, Users, UnlockKeyhole } from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/acessos")({
  head: () => ({ meta: [{ title: "Acessos e usuários · AuditOps" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AccessManagementPage,
});

type PermissionKey = "overview" | "setores" | "colaboradores" | "corredores" | "calendar" | "analysis" | "reports" | "about";
type Permissions = Record<PermissionKey, boolean>;
type AccessUser = {
  id: number;
  username: string;
  displayName: string;
  role: "master" | "custom";
  active: boolean;
  forcePasswordChange: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  failedAttempts: number;
  permissions: Permissions;
  online?: boolean;
  otpEnabled: boolean;
};
type ApiError = { error?: string };

const PERMISSION_OPTIONS: Array<{ key: PermissionKey; label: string; hint: string }> = [
  { key: "overview", label: "Visão geral", hint: "Indicadores e detalhes do painel" },
  { key: "setores", label: "Setores", hint: "Indicadores e registros por setor" },
  { key: "colaboradores", label: "Colaboradores", hint: "Leituras e dados dos colaboradores" },
  { key: "corredores", label: "Corredores", hint: "Detalhamento por corredor" },
  { key: "calendar", label: "Calendário semanal", hint: "Criar auditorias e importar planilhas" },
  { key: "analysis", label: "Análise de Auditorias", hint: "Histórico, comparação e gráficos" },
  { key: "reports", label: "Exportações", hint: "Gerar PDF e Excel" },
  { key: "about", label: "Sobre", hint: "Perfil e apresentação do projeto" },
];
const EMPTY_PERMISSIONS: Permissions = { overview: false, setores: false, colaboradores: false, corredores: false, calendar: false, analysis: false, reports: false, about: false };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error || `Erro HTTP ${response.status}`);
  return payload;
}
function formatDate(value: string | null): string {
  if (!value) return "Nunca";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function defaultPermissions(): Permissions { return { ...EMPTY_PERMISSIONS }; }

function AccessManagementPage() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(20);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPermissions, setNewPermissions] = useState<Permissions>(defaultPermissions);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<Permissions>(defaultPermissions);
  const [draftName, setDraftName] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const selectedUser = useMemo(() => users.find((user) => user.id === selectedId && user.role !== "master") ?? null, [users, selectedId]);
  const activeUsers = users.filter((user) => user.active).length;
  const lockedUsers = users.filter((user) => user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()).length;

  const load = async () => {
    setLoading(true);
    try {
      const [usersPayload, settingsPayload] = await Promise.all([
        requestJson<{ users: AccessUser[] }>("/api/admin/users"),
        requestJson<{ sessionTimeoutMinutes: number }>("/api/admin/settings"),
      ]);
      setUsers(usersPayload.users);
      setSessionTimeoutMinutes(settingsPayload.sessionTimeoutMinutes);
      setSelectedId((previous) => previous && usersPayload.users.some((user) => user.id === previous && user.role !== "master") ? previous : null);
    } catch (error) {
      toast.error("Não foi possível carregar os acessos", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void requestJson<{ users: AccessUser[] }>("/api/admin/users").then((payload) => setUsers(payload.users)).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selectedUser) {
      setDraftPermissions({ ...selectedUser.permissions });
      setDraftName(selectedUser.displayName);
      setResetPassword("");
    }
  }, [selectedUser]);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = await requestJson<{ user: AccessUser }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ username, displayName: name, password: temporaryPassword, permissions: newPermissions }),
      });
      toast.success("Usuário cadastrado", { description: `${payload.user.username} deverá trocar a senha no primeiro acesso.` });
      setName(""); setUsername(""); setTemporaryPassword(""); setNewPermissions(defaultPermissions());
      await load();
    } catch (error) {
      toast.error("Não foi possível cadastrar o usuário", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setSaving(false); }
  };

  const saveUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await requestJson(`/api/admin/users/${selectedUser.id}`, { method: "PATCH", body: JSON.stringify({ displayName: draftName, permissions: draftPermissions }) });
      toast.success("Acessos atualizados", { description: `As permissões de ${selectedUser.username} foram salvas.` });
      await load();
    } catch (error) {
      toast.error("Não foi possível salvar os acessos", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setSaving(false); }
  };

  const toggleUser = async (user: AccessUser) => {
    if (user.role === "master") return;
    try {
      await requestJson(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ active: !user.active }) });
      toast.success(user.active ? "Acesso bloqueado" : "Acesso reativado", { description: user.username });
      await load();
    } catch (error) {
      toast.error("Não foi possível alterar o acesso", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    }
  };

  const unlockUser = async (user: AccessUser) => {
    try {
      await requestJson(`/api/admin/users/${user.id}/unlock`, { method: "POST" });
      toast.success("Bloqueio removido", { description: user.username });
      await load();
    } catch (error) { toast.error("Não foi possível desbloquear", { description: error instanceof Error ? error.message : "Erro desconhecido." }); }
  };

  const resetUserPassword = async () => {
    if (!selectedUser) return;
    if (resetPassword.length < 12) { toast.error("A senha temporária precisa ter pelo menos 12 caracteres."); return; }
    setSaving(true);
    try {
      await requestJson(`/api/admin/users/${selectedUser.id}/reset-password`, { method: "POST", body: JSON.stringify({ password: resetPassword }) });
      toast.success("Senha temporária definida", { description: `${selectedUser.username} será solicitado a criar outra senha ao entrar.` });
      setResetPassword("");
      await load();
    } catch (error) { toast.error("Não foi possível redefinir a senha", { description: error instanceof Error ? error.message : "Erro desconhecido." }); }
    finally { setSaving(false); }
  };

  const updateTimeout = async (value: number) => {
    setSessionTimeoutMinutes(value);
    try {
      await requestJson("/api/admin/settings", { method: "PUT", body: JSON.stringify({ sessionTimeoutMinutes: value }) });
      toast.success("Tempo de sessão atualizado", { description: `Logout por inatividade após ${value} minutos.` });
    } catch (error) { toast.error("Não foi possível salvar o tempo", { description: error instanceof Error ? error.message : "Erro desconhecido." }); await load(); }
  };

  const permissionGrid = (permissions: Permissions, onChange: (key: PermissionKey, checked: boolean) => void) => <div className="grid gap-3 sm:grid-cols-2">{PERMISSION_OPTIONS.map((option) => <label key={option.key} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={permissions[option.key]} onChange={(event) => onChange(option.key, event.target.checked)} /><span className="min-w-0"><span className="block text-sm font-semibold">{option.label}</span><span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.hint}</span></span></label>)}</div>;

  return <PageTransition>
    <PageHeader title="Acessos e usuários" subtitle="Cadastre contas, configure exatamente quais áreas cada pessoa pode visualizar e controle a duração das sessões." action={<Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Atualizar</Button>} />

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article className="surface-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" />Contas cadastradas</div><p className="mt-3 text-3xl font-bold">{users.length}</p><p className="mt-1 text-xs text-muted-foreground">Inclui a conta mestre</p></article>
      <article className="surface-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="size-4" />Contas ativas</div><p className="mt-3 text-3xl font-bold">{activeUsers}</p><p className="mt-1 text-xs text-muted-foreground">Podem iniciar sessão</p></article>
      <article className="surface-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" />Bloqueios de senha</div><p className="mt-3 text-3xl font-bold">{lockedUsers}</p><p className="mt-1 text-xs text-muted-foreground">Bloqueio temporário por tentativas</p></article>
      <article className="surface-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="size-4" />Sessão por inatividade</div><p className="mt-3 text-3xl font-bold">{sessionTimeoutMinutes} min</p><p className="mt-1 text-xs text-muted-foreground">Configurável entre 15 e 30 minutos</p></article>
    </div>

    <SectionCard className="mt-5" title="Configuração de sessão" description="A sessão expira por inatividade no servidor e a interface também encerra a sessão automaticamente.">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><Label htmlFor="session-timeout">Encerrar após</Label><p className="mt-1 text-xs text-muted-foreground">A configuração se aplica às contas e é verificada no servidor a cada requisição.</p></div><select id="session-timeout" value={sessionTimeoutMinutes} onChange={(event) => void updateTimeout(Number(event.target.value))} className="h-11 rounded-md border border-input bg-background px-3 text-sm sm:w-56"><option value={15}>15 minutos</option><option value={20}>20 minutos</option><option value={25}>25 minutos</option><option value={30}>30 minutos</option></select></div>
    </SectionCard>

    <div className="mt-5 grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <SectionCard title="Cadastrar novo acesso" description="Não existe cadastro público: apenas o usuário mestre pode criar contas.">
        <form onSubmit={createUser} className="space-y-4 p-4">
          <div className="space-y-2"><Label htmlFor="new-name">Nome completo ou identificação</Label><Input id="new-name" autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required disabled={saving} placeholder="Ex.: João Silva" /></div>
          <div className="space-y-2"><Label htmlFor="new-username">Nome de usuário</Label><Input id="new-username" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" required disabled={saving} placeholder="Ex.: joao.silva" /><p className="text-xs text-muted-foreground">3–32 caracteres; letras, números, ponto, hífen e sublinhado.</p></div>
          <div className="space-y-2"><Label htmlFor="new-password">Senha temporária</Label><Input id="new-password" autoComplete="new-password" type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} minLength={12} maxLength={128} required disabled={saving} placeholder="Mínimo de 12 caracteres" /><p className="text-xs text-muted-foreground">O usuário será obrigado a trocar essa senha no primeiro acesso.</p></div>
          <div className="space-y-2"><p className="text-sm font-semibold">Áreas permitidas</p>{permissionGrid(newPermissions, (key, checked) => setNewPermissions((current) => ({ ...current, [key]: checked })))}</div>
          <Button type="submit" variant="audit" disabled={saving} className="w-full"><UserPlus className="mr-2 size-4" />{saving ? "Salvando…" : "Criar acesso personalizado"}</Button>
        </form>
      </SectionCard>

      <SectionCard title="Usuários cadastrados" description="O mesmo conjunto de dados do painel é compartilhado; cada conta enxerga somente as áreas autorizadas.">
        {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Carregando usuários…</p> : <div className="space-y-3 p-4">{users.map((user) => {
          const locked = Boolean(user.lockedUntil && Date.parse(user.lockedUntil) > Date.now());
          const selected = selectedId === user.id;
          return <article key={user.id} className={`rounded-xl border p-4 ${selected ? "border-primary/50 bg-primary/5" : ""}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{user.displayName}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${user.role === "master" ? "bg-primary/10 text-primary" : user.active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{user.role === "master" ? "Mestre" : user.active ? "Ativo" : "Bloqueado"}</span><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${user.online ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${user.online ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />{user.online ? "Online" : "Offline"}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${user.otpEnabled ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{user.otpEnabled ? "OTP ativo" : "OTP desativado"}</span>{locked ? <span className="rounded-full bg-critical/10 px-2 py-0.5 text-[11px] font-semibold text-critical">Bloqueio por senha</span> : null}{user.forcePasswordChange ? <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Troca de senha pendente</span> : null}</div><p className="mt-1 text-sm text-muted-foreground">@{user.username} · último acesso: {formatDate(user.lastLoginAt)}</p><p className="mt-1 text-xs text-muted-foreground">{user.role === "master" ? "Acesso completo e gerenciamento de contas" : `${PERMISSION_OPTIONS.filter((option) => user.permissions[option.key]).length} área(s) autorizada(s)`}</p></div>
              <div className="flex flex-wrap gap-2">{user.role !== "master" ? <><Button size="sm" variant="outline" onClick={() => setSelectedId(selected ? null : user.id)}>{selected ? "Fechar edição" : "Editar"}</Button><Button size="sm" variant="outline" onClick={() => void toggleUser(user)}>{user.active ? <><ShieldOff className="mr-1.5 size-3.5" />Bloquear</> : <><ShieldCheck className="mr-1.5 size-3.5" />Ativar</>}</Button>{locked ? <Button size="sm" variant="outline" onClick={() => void unlockUser(user)}><UnlockKeyhole className="mr-1.5 size-3.5" />Desbloquear</Button> : null}</> : <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs"><ShieldCheck className="size-3.5" />Conta protegida</span>}</div>
            </div>
            {selected && user.role !== "master" ? <div className="mt-4 space-y-4 border-t pt-4">
              <div className="space-y-2"><Label htmlFor={`edit-name-${user.id}`}>Nome de exibição</Label><Input id={`edit-name-${user.id}`} value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={80} /></div>
              <div className="space-y-2"><p className="text-sm font-semibold">Permissões desta conta</p>{permissionGrid(draftPermissions, (key, checked) => setDraftPermissions((current) => ({ ...current, [key]: checked })))}</div>
              <Button variant="audit" onClick={() => void saveUser()} disabled={saving}>Salvar permissões</Button>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3"><p className="text-sm font-semibold">Redefinir senha</p><p className="mt-1 text-xs text-muted-foreground">Defina uma senha temporária de pelo menos 12 caracteres. O usuário precisará trocá-la no próximo login.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={12} maxLength={128} placeholder="Nova senha temporária" /><Button variant="outline" onClick={() => void resetUserPassword()} disabled={saving || resetPassword.length < 12}>Redefinir</Button></div></div>
            </div> : null}
          </article>;
        })}{users.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Ainda não há contas cadastradas.</p> : null}</div>}
      </SectionCard>
    </div>
    <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Proteções ativas</p><p className="mt-1 text-muted-foreground">Cinco tentativas de senha incorretas bloqueiam a conta por 15 minutos. Há também limitação por origem de rede. Senhas são armazenadas com hash scrypt e sal exclusivo; sessões usam cookie HttpOnly e expiração verificada no servidor. O painel nega acesso por padrão, inclusive em URLs e chamadas de API diretas.</p></div></div>
  </PageTransition>;
}
