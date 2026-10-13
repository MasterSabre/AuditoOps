import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CircleSlash,
  PackageCheck,
  PackageX,
  ScanLine,
  TagsIcon,
  Users,
} from "lucide-react";
import { PageHeader, PageTransition } from "@/components/PageTransition";
import { WeeklyCalendarOverview } from "@/components/WeeklyCalendarOverview";
import { ProductTable } from "@/components/ProductTable";
import { ProgressRing } from "@/components/ProgressRing";
import { RequireAudit } from "@/components/RequireAudit";
import { SectionCard } from "@/components/SectionCard";
import { StatCard, type StatTone } from "@/components/StatCard";
import { AuditDetailDialog } from "@/components/AuditDetailDialog";
import { SkuSectorDialog } from "@/components/SkuSectorDialog";
import { ClasseDonut } from "@/components/charts/ClasseDonut";
import { FluxoChart } from "@/components/charts/FluxoChart";
import { useGlobalAuditFilters, useSearchQuery } from "@/lib/search-store";
import { applyGlobalAuditFilters, applyGlobalFiltersToProducts, getGlobalFlowRows, getGlobalSectorRows, hasActiveGlobalFilters } from "@/lib/audit/global-filters";
import { getDashboardDetailRows, type DashboardDetailKind } from "@/lib/audit/dashboard-details";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Visão geral · AuditOps" },
      {
        name: "description",
        content:
          "Painel de auditoria de estoque AuditOps: parcial de leitura, fluxo de escaneamentos, pendências por setor e produtos sem leitura com alto estoque.",
      },
      { property: "og:title", content: "Visão geral · AuditOps" },
      {
        property: "og:description",
        content:
          "Indicadores operacionais da auditoria de estoque: parcial, não lidos, colaboradores ativos e fluxo de leituras.",
      },
    ],
  }),
  component: Dashboard,
});

type DashboardPanel = DashboardDetailKind | "sku" | null;
type DashboardCardAction = DashboardDetailKind | "sku" | "colaboradores";

function getDetailCopy(
  panel: DashboardDetailKind,
  result: Parameters<typeof getDashboardDetailRows>[0],
  rowCount: number,
) {
  const copies: Record<DashboardDetailKind, { title: string; description: string; emptyMessage: string }> = {
    parcial: {
      title: "Itens que compõem o parcial",
      description: `O parcial de ${result.parcial.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% mantém a regra original: ${result.naoLidos.toLocaleString("pt-BR")} itens não lidos ÷ ${result.sku.toLocaleString("pt-BR")} SKU. Esta janela mostra os registros que compõem o numerador do cálculo.`,
      emptyMessage: "Não há registros individuais de pendências disponíveis para esta auditoria.",
    },
    "nao-lidos": {
      title: "Itens não lidos",
      description: `Foram encontrados ${rowCount.toLocaleString("pt-BR")} registros individuais com a situação de pendência usada nesta auditoria (${result.auditoria}).`,
      emptyMessage: "Não há registros individuais classificados como não lidos para esta auditoria.",
    },
    "lidos-com-estoque": {
      title: "Itens lidos com estoque",
      description: result.auditoria === "Etiqueta"
        ? `A lista contém ${rowCount.toLocaleString("pt-BR")} registros identificados como lidos com estoque. Quando a exportação não traz esse status explicitamente, a consulta recupera registros com estoque positivo e situação compatível, excluindo não lidos, sem estoque e não pertencentes. O indicador original continua calculado como SKU da base menos itens não lidos (${result.lidosComEstoque.toLocaleString("pt-BR")}); a fórmula não foi alterada.`
        : result.auditoria === "Ruptura"
          ? `Registros identificados como situação regular de estoque na auditoria de Ruptura: ${rowCount.toLocaleString("pt-BR")}.`
          : `Registros identificados como “Com Presença e Com Estoque”: ${rowCount.toLocaleString("pt-BR")}. O painel mantém o total e os critérios originais da auditoria.`,
      emptyMessage: "Não foram encontrados registros explicitamente identificados como lidos com estoque na planilha.",
    },
    "lidos-sem-estoque": {
      title: "Itens lidos sem estoque",
      description: `Registros individuais com situação indicando leitura sem estoque: ${rowCount.toLocaleString("pt-BR")}.`,
      emptyMessage: "Não há registros individuais identificados como lidos sem estoque.",
    },
    "etiquetas-desatualizadas": {
      title: "Etiquetas desatualizadas",
      description: `Registros individuais cuja situação indica etiqueta desatualizada: ${rowCount.toLocaleString("pt-BR")}.`,
      emptyMessage: "Nenhuma etiqueta desatualizada foi identificada nos registros disponíveis.",
    },
    "lidos-nao-pertence": {
      title: "Itens lidos que não pertencem",
      description: `Registros individuais classificados como “Lido não pertence”: ${rowCount.toLocaleString("pt-BR")}.`,
      emptyMessage: "Não há registros classificados como “Lido não pertence”.",
    },
  };
  return copies[panel];
}

function Dashboard() {
  const query = useSearchQuery();
  const globalFilters = useGlobalAuditFilters();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<DashboardPanel>(null);

  return (
    <RequireAudit>
      {(result) => {
        const cards: Array<{
          label: string;
          value: number;
          icon: typeof Boxes;
          tone: StatTone;
          decimals?: number;
          suffix?: string;
          hint?: string;
          action: DashboardCardAction;
          actionLabel?: string;
          opensDialog?: boolean;
        }> = [
          { label: "SKU da base", value: result.sku, icon: Boxes, tone: "neutral", hint: "Distribuição por setor", action: "sku", actionLabel: "Ver itens por setor" },
          {
            label: "Parcial",
            value: result.parcial,
            icon: AlertTriangle,
            tone: "primary",
            decimals: 2,
            suffix: "%",
            hint: "Não lidos ÷ SKU",
            action: "parcial",
            actionLabel: "Ver cálculo e itens",
          },
          { label: "Não lidos", value: result.naoLidos, icon: PackageX, tone: "critical", action: "nao-lidos", actionLabel: "Ver itens não lidos" },
          {
            label: "Lidos com estoque",
            value: result.lidosComEstoque,
            icon: PackageCheck,
            tone: "success",
            action: "lidos-com-estoque",
            actionLabel: "Ver registros",
          },
          {
            label: "Lidos sem estoque",
            value: result.lidosSemEstoque,
            icon: CircleSlash,
            tone: "link",
            action: "lidos-sem-estoque",
            actionLabel: "Ver registros",
          },
          ...(result.auditoria === "Etiqueta"
            ? [
                {
                  label: "Etiquetas desatualizadas",
                  value: result.etiquetasDesatualizadas,
                  icon: TagsIcon,
                  tone: "primary" as StatTone,
                  action: "etiquetas-desatualizadas" as const,
                  actionLabel: "Ver etiquetas",
                },
              ]
            : []),
          {
            label: "Lidos não pertence",
            value: result.lidosNaoPertence,
            icon: ScanLine,
            tone: "neutral",
            action: "lidos-nao-pertence",
            actionLabel: "Ver registros",
          },
          {
            label: "Colaboradores ativos",
            value: result.colaboradoresAtivos,
            icon: Users,
            tone: "success",
            hint: "Usuários registrados na auditoria",
            action: "colaboradores",
            actionLabel: "Abrir colaboradores",
            opensDialog: false,
          },
        ];

        const details = result.detalhesRegistros ?? [];
        const hasFilters = hasActiveGlobalFilters(globalFilters, query);
        const filteredDetails = applyGlobalAuditFilters(details, globalFilters, query);
        const activeRows = activePanel && activePanel !== "sku"
          ? applyGlobalAuditFilters(getDashboardDetailRows(result, activePanel), globalFilters, query)
          : [];
        const detailCopy = activePanel && activePanel !== "sku" ? getDetailCopy(activePanel, result, activeRows.length) : null;
        const sectorsForView = getGlobalSectorRows(result, globalFilters, query);
        const flowForView = hasFilters
          ? getGlobalFlowRows(details, result.dataAuditoria, globalFilters, query)
          : result.fluxo;
        const productsForView = applyGlobalFiltersToProducts(result.produtosSemLeitura, details, globalFilters);
        const productsWithSalesForView = applyGlobalFiltersToProducts(result.semLeituraComVendas, details, globalFilters);

        return (
          <PageTransition>
            <PageHeader
              title="Visão geral"
              subtitle={`Auditoria de ${result.auditoria} · ${result.dataAuditoria}`}
            />

            <WeeklyCalendarOverview />

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 2xl:gap-5">
              {cards.map((card, index) => (
                <StatCard
                  key={card.label}
                  index={index}
                  {...card}
                  onClick={() => {
                    if (card.action === "colaboradores") {
                      navigate({ to: "/colaboradores" });
                    } else {
                      setActivePanel(card.action);
                    }
                  }}
                />
              ))}
            </div>

            {hasFilters ? <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Recorte global ativo.</strong> Os cartões principais continuam mostrando os indicadores originais; gráficos, listas e consultas refletem a busca/filtros aplicados.
            </div> : null}

            <div className="grid gap-8 xl:grid-cols-3">
              <SectionCard
                title="Fluxo de leituras"
                description={hasFilters ? "Fluxo reconstruído apenas com os registros que correspondem à busca e aos filtros globais" : "Leituras registradas por minuto durante a auditoria"}
                className="xl:col-span-2"
                delay={0.1}
              >
                <FluxoChart data={flowForView} details={hasFilters ? filteredDetails : details} />
              </SectionCard>

              <SectionCard
                title="Progresso da auditoria"
                description="Percentual pendente de leitura"
                delay={0.16}
              >
                <div className="chart-frame flex items-center justify-center">
                  <ProgressRing
                    value={result.parcial}
                    caption={`${result.naoLidos.toLocaleString("pt-BR")} itens pendentes de ${result.sku.toLocaleString("pt-BR")} SKU`}
                  />
                </div>
              </SectionCard>
            </div>

            <SectionCard
              title="Distribuição por classe de produto"
              description="Pendências concentradas nas principais classes raiz"
              delay={0.2}
            >
              <ClasseDonut data={sectorsForView} />
            </SectionCard>

            <SectionCard
              title="Produtos sem leitura · alto estoque"
              description="30 itens com maior estoque atual sem leitura"
              delay={0.24}
            >
              <ProductTable rows={productsForView} query={query} />
            </SectionCard>

            {result.auditoria === "Presença" ? (
              <SectionCard
                title="Sem leitura · com vendas"
                description="Itens sem presença, com estoque e venda no dia (dias sem venda = 0)"
                delay={0.28}
              >
                <ProductTable rows={productsWithSalesForView} query={query} />
              </SectionCard>
            ) : null}

            <SkuSectorDialog
              open={activePanel === "sku"}
              onOpenChange={(open) => { if (!open) setActivePanel(null); }}
              skuBase={result.sku}
              rows={filteredDetails}
            />
            {activePanel && activePanel !== "sku" && detailCopy ? (
              <AuditDetailDialog
                open
                onOpenChange={(open) => { if (!open) setActivePanel(null); }}
                title={detailCopy.title}
                description={detailCopy.description}
                rows={activeRows}
                recordsAvailable={Array.isArray(result.detalhesRegistros)}
                legacyMessage="Esta auditoria foi salva antes do detalhamento individual. Reimporte a planilha para habilitar a consulta completa dos registros."
                emptyMessage={detailCopy.emptyMessage}
              />
            ) : null}
          </PageTransition>
        );
      }}
    </RequireAudit>
  );
}
