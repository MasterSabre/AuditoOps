import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BadgeCheck,
  Boxes,
  Braces,
  ChartNoAxesCombined,
  Code2,
  Database,
  FileSpreadsheet,
  Github,
  HardDrive,
  Linkedin,
  MessageCircle,
  MonitorCog,
  Network,
  Server,
  ShieldCheck,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { SectionCard } from "@/components/SectionCard";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Sobre Douglas · MasterSabre" },
      {
        name: "description",
        content:
          "Perfil de Douglas dos Santos Freitas (MasterSabre): suporte de TI, desenvolvimento de ferramentas, automação de processos, análise de dados e infraestrutura.",
      },
      { property: "og:title", content: "Douglas dos Santos Freitas · MasterSabre" },
      {
        property: "og:description",
        content:
          "Suporte de TI, desenvolvimento de ferramentas, automação de processos, análise de dados e infraestrutura.",
      },
      { property: "og:image", content: "/douglas-profile.png" },
    ],
  }),
  component: SobrePage,
});

const TECH_GROUPS = [
  {
    title: "Desenvolvimento web",
    description: "Interfaces, dashboards e experiência de uso.",
    icon: Code2,
    items: [
      "HTML",
      "CSS",
      "JavaScript",
      "TypeScript",
      "React",
      "Vite",
      "TanStack Router",
      "Tailwind CSS",
      "shadcn/ui",
      "Framer Motion",
      "Recharts",
      "Lucide React",
    ],
  },
  {
    title: "Dados e automação",
    description: "Processamento de planilhas, integrações e persistência.",
    icon: Database,
    items: [
      "Node.js",
      "Express",
      "SQL",
      "SQLite",
      "SheetJS / XLSX",
      "APIs REST / JSON",
      "Baileys (WhatsApp)",
      "Excel e CSV",
    ],
  },
  {
    title: "Infraestrutura e ferramentas",
    description: "Ambientes, serviços, rede e operação de TI.",
    icon: Server,
    items: [
      "Windows",
      "PowerShell",
      "Linux / Ubuntu",
      "ZimaOS",
      "Docker",
      "Coolify",
      "Samba / compartilhamento de arquivos",
      "Git e GitHub",
      "Redes e servidores",
      "PDVs e periféricos de loja",
    ],
  },
];

const PROJECTS = [
  {
    icon: ChartNoAxesCombined,
    title: "AuditOps — auditoria e análise de estoque",
    label: "Dados · Dashboard · Relatórios",
    description:
      "Plataforma que transforma planilhas de auditoria em indicadores operacionais. Inclui contagem automática de SKUs, análise por setor e colaborador, calendário semanal, histórico em SQL, comparação entre auditorias, gráficos e exportação para PDF e Excel, além de recursos de backup e recuperação.",
  },
  {
    icon: Workflow,
    title: "Automação GETIS / RUB e WhatsApp",
    label: "Automação · Integrações",
    description:
      "Ferramentas para organizar consultas de preços, produtos e promotores, com fluxos pelo WhatsApp, histórico de consultas e separação das sessões por usuário. O objetivo é reduzir tarefas repetitivas e facilitar o acesso às informações operacionais.",
  },
  {
    icon: MonitorCog,
    title: "Monitoramento de impressoras",
    label: "Suporte · Alertas",
    description:
      "Estrutura de monitoramento para equipamentos Lexmark, com acompanhamento de toner e alertas de níveis baixos e de situações que precisam de atenção.",
  },
  {
    icon: HardDrive,
    title: "Laboratório doméstico e serviços próprios",
    label: "Infraestrutura · Self-hosting",
    description:
      "Configuração de serviços em servidor próprio, organização de armazenamento compartilhado, execução de aplicações em contêineres e experimentos com ZimaOS, Docker, Coolify, Linux e Samba.",
  },
];

const EXPERIENCE_POINTS = [
  "Formatação, preparação e configuração de computadores administrativos e PDVs.",
  "Atendimento de chamados, diagnóstico de falhas e resolução de solicitações técnicas.",
  "Suporte a balanças, antenas, switches, periféricos e equipamentos de loja.",
  "Apoio à operação de servidores, organização de backups e rotinas de infraestrutura.",
  "Criação de ferramentas para organizar dados, automatizar tarefas e gerar relatórios que apoiem decisões.",
];

function ExternalProfileLink({
  href,
  icon: Icon,
  label,
  detail,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  detail: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="group inline-flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background/70 px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/60"
    >
      <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </a>
  );
}

function SobrePage() {
  return (
    <PageTransition>
      <PageHeader
        title="Sobre mim"
        subtitle="Assistente de TI · Desenvolvimento e automação"
      />

      <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-center lg:justify-start"
          >
            <div className="relative">
              <img
                src="/douglas-profile.png"
                alt="Imagem de perfil de Douglas dos Santos Freitas"
                width={300}
                height={300}
                fetchPriority="high"
                className="size-36 rounded-full border-4 border-background object-cover shadow-xl ring-1 ring-border sm:size-44"
              />
              <span className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md" title="Perfil MasterSabre">
                <BadgeCheck className="size-4" />
              </span>
            </div>
          </motion.div>

          <div className="min-w-0 text-center lg:text-left">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                Assistente de TI · Automação · Dados
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                GitHub: MasterSabre
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Douglas dos Santos Freitas</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">MasterSabre</p>
            <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-muted-foreground lg:mx-0 sm:text-base">
              Profissional de TI com experiência em suporte técnico e operação de equipamentos de loja, que também desenvolve ferramentas para automatizar processos, organizar informações e transformar dados em painéis e relatórios úteis. Gosto de unir a resolução de problemas do dia a dia com tecnologia prática, interfaces claras e soluções que economizam tempo.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <ExternalProfileLink
                href="https://github.com/MasterSabre"
                icon={Github}
                label="GitHub"
                detail="github.com/MasterSabre"
              />
              <ExternalProfileLink
                href="https://www.linkedin.com/in/douglas-santos-hightech"
                icon={Linkedin}
                label="LinkedIn"
                detail="Perfil profissional"
              />
              <ExternalProfileLink
                href="https://wa.me/5541992706607"
                icon={MessageCircle}
                label="WhatsApp"
                detail="+55 (41) 99270-6607"
              />
            </div>
          </div>
        </div>
      </section>

      <SectionCard
        title="Minha trajetória e o que faço"
        description="Suporte técnico, automação e desenvolvimento aplicado a necessidades reais."
        delay={0.05}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Wrench className="size-5 text-primary" />
              <h3 className="text-sm font-bold sm:text-base">Experiência em TI</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Minha atuação profissional em TI de varejo envolve manter a operação funcionando: preparar computadores, apoiar os PDVs, atender chamados, diagnosticar falhas e prestar suporte a equipamentos e infraestrutura de loja.
            </p>
            <ul className="mt-4 space-y-2">
              {EXPERIENCE_POINTS.slice(0, 4).map((point) => (
                <li key={point} className="flex gap-2 text-sm leading-5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Braces className="size-5 text-primary" />
              <h3 className="text-sm font-bold sm:text-base">Como aplico tecnologia</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Nos projetos, foco em reduzir trabalho manual e deixar os dados mais fáceis de consultar. Estruturo fluxos de importação, validação, cálculos, indicadores, integrações e relatórios, pensando também em histórico, segurança e manutenção.
            </p>
            <ul className="mt-4 space-y-2">
              {EXPERIENCE_POINTS.slice(4).map((point) => (
                <li key={point} className="flex gap-2 text-sm leading-5">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
              <li className="flex gap-2 text-sm leading-5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>Organização de histórico, exportações em PDF/Excel e cópias de segurança.</span>
              </li>
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Tecnologias e ferramentas"
        description="Tecnologias utilizadas nos projetos e ambientes que desenvolvo e mantenho."
        delay={0.1}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {TECH_GROUPS.map((group, index) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.3, delay: index * 0.06 }}
              className="rounded-xl border border-border bg-background/60 p-4"
            >
              <div className="flex items-center gap-2">
                <group.icon className="size-5 text-primary" />
                <h3 className="text-sm font-bold">{group.title}</h3>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{group.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-border/80 bg-muted/50 px-2 py-1 text-xs font-medium text-foreground/90"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Projetos e experiências práticas"
        description="Algumas das soluções e ambientes em que venho trabalhando."
        delay={0.15}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {PROJECTS.map((project, index) => (
            <motion.article
              key={project.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.32, delay: index * 0.05 }}
              whileHover={{ y: -2 }}
              className="rounded-xl border border-border bg-background/60 p-4 transition-colors hover:border-primary/30 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <project.icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{project.label}</p>
                  <h3 className="mt-1 text-sm font-bold leading-5">{project.title}</h3>
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{project.description}</p>
            </motion.article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="O que busco construir" description="Tecnologia útil, confiável e pensada para quem usa." delay={0.2}>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Boxes,
              title: "Soluções integradas",
              text: "Ferramentas que conectam dados, processos e pessoas em um fluxo claro.",
            },
            {
              icon: FileSpreadsheet,
              title: "Dados compreensíveis",
              text: "Planilhas, indicadores e relatórios que ajudem a encontrar problemas e agir mais rápido.",
            },
            {
              icon: Network,
              title: "Operação confiável",
              text: "Sistemas com histórico, segurança, automação e infraestrutura organizada.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-background/60 p-4">
              <item.icon className="size-5 text-primary" />
              <h3 className="mt-2 text-sm font-bold">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold">Vamos conversar?</p>
            <p className="mt-1 text-xs text-muted-foreground">Acesse meus projetos ou entre em contato diretamente.</p>
          </div>
          <a
            href="https://github.com/MasterSabre"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Github className="size-4" />
            Ver GitHub
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </SectionCard>
    </PageTransition>
  );
}
