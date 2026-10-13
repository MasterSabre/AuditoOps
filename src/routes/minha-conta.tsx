import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/minha-conta")({
  head: () => ({ meta: [{ title: "Minha conta · AuditOps" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: MyAccountPage,
});

type ApiError = { error?: string };
type OtpStatus = { enabled: boolean; recoveryCodesRemaining: number };
type OtpSetup = { secret: string; otpauthUri: string; expiresAt: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  const payload = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(payload.error || `Erro HTTP ${response.status}`);
  return payload;
}

function MyAccountPage() {
  const [status, setStatus] = useState<OtpStatus>({ enabled: false, recoveryCodesRemaining: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [setup, setSetup] = useState<OtpSetup | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const loadStatus = async () => {
    try {
      const data = await requestJson<OtpStatus>("/api/auth/otp/status");
      setStatus(data);
    } catch (error) {
      toast.error("Não foi possível carregar a segurança da conta", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadStatus(); }, []);

  const startSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await requestJson<OtpSetup>("/api/auth/otp/setup", { method: "POST", body: JSON.stringify({ currentPassword }) });
      const qr = await QRCode.toDataURL(data.otpauthUri, { width: 280, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0b1220", light: "#ffffff" } });
      setSetup(data);
      setQrDataUrl(qr);
      setSetupCode("");
      setRecoveryCodes([]);
      setCurrentPassword("");
      toast.success("Autenticador preparado", { description: "Escaneie o QR e confirme o código gerado pelo aplicativo." });
    } catch (error) {
      toast.error("Não foi possível iniciar a configuração", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setBusy(false); }
  };

  const verifySetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await requestJson<{ ok: boolean; enabled: boolean; recoveryCodes: string[] }>("/api/auth/otp/verify-setup", { method: "POST", body: JSON.stringify({ code: setupCode }) });
      setStatus({ enabled: data.enabled, recoveryCodesRemaining: data.recoveryCodes.length });
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      setQrDataUrl("");
      setSetupCode("");
      toast.success("Autenticação em duas etapas ativada", { description: "Guarde os códigos de recuperação exibidos nesta tela." });
    } catch (error) {
      toast.error("Não foi possível confirmar o autenticador", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setBusy(false); }
  };

  const disableOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await requestJson<{ ok: boolean }>("/api/auth/otp/disable", { method: "POST", body: JSON.stringify({ currentPassword: disablePassword, code: disableCode }) });
      setStatus({ enabled: false, recoveryCodesRemaining: 0 });
      setDisablePassword(""); setDisableCode(""); setRecoveryCodes([]);
      toast.success("Autenticador desativado");
      await loadStatus();
    } catch (error) {
      toast.error("Não foi possível desativar", { description: error instanceof Error ? error.message : "Erro desconhecido." });
    } finally { setBusy(false); }
  };

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      toast.success("Códigos copiados", { description: "Guarde-os em um local seguro; cada código pode ser usado uma vez." });
    } catch { toast.error("Não foi possível copiar. Selecione os códigos e copie manualmente."); }
  };

  return <PageTransition>
    <PageHeader title="Minha conta" subtitle="Gerencie a proteção da sua conta e configure um aplicativo autenticador para confirmar o login." />

    <div className="mt-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <SectionCard title="Autenticação em duas etapas" description="Use um aplicativo autenticador compatível com TOTP, como Google Authenticator, Microsoft Authenticator, Aegis ou 1Password.">
        <div className="p-5">
          <div className="flex items-start gap-3 rounded-xl border p-4">
            <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${status.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
              {loading ? <LoaderCircle className="size-5 animate-spin" /> : status.enabled ? <ShieldCheck className="size-5" /> : <Smartphone className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{loading ? "Verificando status…" : status.enabled ? "Autenticador ativo" : "Autenticador não configurado"}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{status.enabled ? `O login exige um código do aplicativo ou um código de recuperação. Restam ${status.recoveryCodesRemaining} códigos de recuperação.` : "Depois de ativar, a senha sozinha não será suficiente para entrar nesta conta."}</p>
            </div>
          </div>

          {!status.enabled && !setup ? <form onSubmit={startSetup} className="mt-5 space-y-4">
            <div className="space-y-2"><Label htmlFor="otp-current-password">Confirme sua senha atual</Label><Input id="otp-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={12} maxLength={128} required disabled={busy} placeholder="Senha da sua conta" /></div>
            <Button type="submit" disabled={busy || loading || currentPassword.length < 12} className="w-full"><KeyRound className="mr-2 size-4" />{busy ? "Preparando…" : "Configurar aplicativo autenticador"}</Button>
            <p className="text-xs leading-5 text-muted-foreground">O segredo do autenticador é criptografado no servidor. O QR é gerado localmente nesta página e não é enviado a um site externo.</p>
          </form> : null}

          {setup ? <div className="mt-5 space-y-5">
            <div className="grid gap-5 md:grid-cols-[auto_1fr] md:items-start">
              <div className="mx-auto rounded-2xl border bg-white p-3"><img src={qrDataUrl} alt="QR code de configuração do autenticador" className="size-56 max-w-full" /></div>
              <div className="space-y-3">
                <p className="font-semibold">1. Escaneie este QR code</p>
                <p className="text-sm leading-6 text-muted-foreground">No seu aplicativo autenticador, adicione uma conta e use “Ler QR code”. Se não puder escanear, escolha configuração manual e informe a chave abaixo.</p>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Chave manual</p><p className="mt-1 break-all font-mono text-sm font-semibold tracking-wider">{setup.secret}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void navigator.clipboard.writeText(setup.secret).then(() => toast.success("Chave copiada")).catch(() => toast.error("Não foi possível copiar a chave"))}><Copy className="mr-2 size-3.5" />Copiar chave</Button></div>
                <p className="text-xs text-muted-foreground">Por segurança, conclua a configuração em até 10 minutos.</p>
              </div>
            </div>
            <form onSubmit={verifySetup} className="space-y-3 border-t pt-4">
              <p className="font-semibold">2. Confirme com o código do aplicativo</p>
              <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Código de verificação do autenticador" autoComplete="one-time-code" inputMode="numeric" value={setupCode} onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, "").slice(0, 6))} minLength={6} maxLength={6} required placeholder="Código de 6 dígitos" disabled={busy} className="h-11 font-mono tracking-[0.25em]" /><Button type="submit" disabled={busy || setupCode.length !== 6}><Check className="mr-2 size-4" />{busy ? "Validando…" : "Ativar autenticador"}</Button></div>
              <Button type="button" variant="ghost" onClick={() => { setSetup(null); setQrDataUrl(""); setSetupCode(""); }} disabled={busy}>Cancelar configuração</Button>
            </form>
          </div> : null}

          {status.enabled ? <form onSubmit={disableOtp} className="mt-5 space-y-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div><p className="font-semibold">Desativar autenticador</p><p className="mt-1 text-xs leading-5 text-muted-foreground">É necessário confirmar a senha atual e um código novo do autenticador ou um código de recuperação ainda não utilizado.</p></div>
            <div className="space-y-2"><Label htmlFor="disable-current-password">Senha atual</Label><Input id="disable-current-password" type="password" autoComplete="current-password" value={disablePassword} onChange={(event) => setDisablePassword(event.target.value)} minLength={12} maxLength={128} required disabled={busy} /></div>
            <div className="space-y-2"><Label htmlFor="disable-otp-code">Código TOTP ou recuperação</Label><Input id="disable-otp-code" autoComplete="one-time-code" value={disableCode} onChange={(event) => setDisableCode(event.target.value.toUpperCase().slice(0, 40))} maxLength={40} required disabled={busy} placeholder="Código do app ou ABCD-EFGH-IJKL" /></div>
            <Button type="submit" variant="outline" disabled={busy || disablePassword.length < 12 || !disableCode}><Trash2 className="mr-2 size-4" />Desativar autenticação</Button>
          </form> : null}
        </div>
      </SectionCard>

      <SectionCard title="Códigos de recuperação" description="Códigos de uso único para recuperar o acesso caso você perca o dispositivo autenticador.">
        <div className="space-y-4 p-5">
          {recoveryCodes.length > 0 ? <>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><p className="font-semibold text-emerald-700">Salve estes códigos agora</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Eles só são mostrados uma vez. Cada código pode ser usado em um único login e não será possível visualizá-los novamente depois de sair desta tela.</p></div>
            <div className="grid gap-2 sm:grid-cols-2">{recoveryCodes.map((code) => <code key={code} className="rounded-lg border bg-muted/30 px-3 py-2.5 text-center font-mono font-semibold tracking-wider">{code}</code>)}</div>
            <Button type="button" variant="outline" onClick={() => void copyRecoveryCodes()}><Copy className="mr-2 size-4" />Copiar todos os códigos</Button>
          </> : <div className="rounded-xl border border-dashed p-5 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mb-2 size-5" />{status.enabled ? `Há ${status.recoveryCodesRemaining} códigos de recuperação ainda disponíveis. Por segurança, o sistema não permite consultar novamente os códigos já gerados.` : "Ao ativar o autenticador, serão gerados códigos de recuperação. Guarde-os fora do computador que utiliza o AuditOps."}</div>}
          <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Não compartilhe o QR, a chave manual ou os códigos de recuperação. O suporte não precisa conhecer esses segredos.</div>
        </div>
      </SectionCard>
    </div>
  </PageTransition>;
}
