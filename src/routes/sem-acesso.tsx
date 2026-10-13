import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";

export const Route = createFileRoute("/sem-acesso")({
  head: () => ({ meta: [{ title: "Acesso não autorizado · AuditOps" }] }),
  component: NoAccessPage,
});

function NoAccessPage() {
  return <PageTransition><div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center px-6 text-center"><div className="flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600"><ShieldAlert className="size-7" /></div><h1 className="mt-5 text-2xl font-bold">Acesso não autorizado</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Seu perfil não tem permissão para abrir esta área. Peça ao usuário mestre para ajustar seus acessos na categoria Acessos e usuários.</p><Button asChild className="mt-5"><Link to="/login">Voltar ao login</Link></Button></div></PageTransition>;
}
