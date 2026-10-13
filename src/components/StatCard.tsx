import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { CountUp } from "./CountUp";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "primary" | "success" | "critical" | "link";

const toneRing: Record<StatTone, string> = {
  neutral: "bg-muted text-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/12 text-success",
  critical: "bg-critical/12 text-critical",
  link: "bg-link/12 text-link",
};

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: StatTone;
  decimals?: number;
  suffix?: string;
  hint?: string;
  index?: number;
  onClick: () => void;
  actionLabel?: string;
  opensDialog?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  decimals = 0,
  suffix = "",
  hint,
  index = 0,
  onClick,
  actionLabel = "Ver detalhamento",
  opensDialog = true,
}: StatCardProps) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      aria-label={`${label}: ${value.toLocaleString("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${suffix}. ${actionLabel}.`}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      className={cn(
        "stat-card surface-card group block w-full cursor-pointer text-left transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        `stat-${tone}`,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="stat-label min-w-0">{label}</p>
        <span
          className={cn(
            "stat-icon flex shrink-0 items-center justify-center rounded-md transition-transform duration-200 group-hover:scale-110",
            toneRing[tone],
          )}
        >
          <Icon className="size-4.5" strokeWidth={2.2} />
        </span>
      </div>
      <p className="stat-number">
        <CountUp value={value} decimals={decimals} suffix={suffix} />
      </p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-85 transition-opacity group-hover:opacity-100">
        {actionLabel}<ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </span>
    </motion.button>
  );
}
