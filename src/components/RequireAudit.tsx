import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuditHydrated, useAuditResult } from "@/lib/audit/store";
import type { AuditResult } from "@/lib/audit/types";

/** Renders children only when an audit result exists; otherwise sends the user to the upload page. */
export function RequireAudit({ children }: { children: (result: AuditResult) => React.ReactNode }) {
  const result = useAuditResult();
  const hydrated = useAuditHydrated();
  const navigate = useNavigate();

  useEffect(() => {
    if (hydrated && !result) {
      navigate({ to: "/atualizar-dados", replace: true });
    }
  }, [hydrated, result, navigate]);

  if (!result) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
      >
        <Loader2 className="size-5 animate-spin text-primary" />
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          Carregando auditoria…
        </motion.span>
      </motion.div>
    );
  }

  return <>{children(result)}</>;
}
