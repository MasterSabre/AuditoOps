import { computeAudit } from "./engine";
import { SETORES, type AuditResult, type RawRow } from "./types";

const USUARIOS = [
  "ana.souza",
  "carlos.lima",
  "dayane.rocha",
  "eduardo.melo",
  "fabiana.dias",
  "gustavo.pires",
  "helena.matos",
  "igor.castro",
];

const LOCAIS = Array.from({ length: 24 }, (_, i) => `Corredor ${String(i + 1).padStart(2, "0")}`);

const PRODUTOS = [
  "Arroz Tipo 1 5kg",
  "Feijão Carioca 1kg",
  "Óleo de Soja 900ml",
  "Açúcar Refinado 1kg",
  "Café Torrado 500g",
  "Leite Integral 1L",
  "Detergente Neutro 500ml",
  "Sabão em Pó 1,6kg",
  "Refrigerante 2L",
  "Biscoito Recheado 130g",
  "Molho de Tomate 340g",
  "Papel Higiênico 12un",
  "Queijo Mussarela kg",
  "Presunto Cozido kg",
  "Banana Prata kg",
  "Tomate Italiano kg",
  "Frango Congelado kg",
  "Margarina 500g",
  "Macarrão Espaguete 500g",
  "Farinha de Trigo 1kg",
];

/** Deterministic pseudo-random generator so the demo dataset is stable. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export function buildMockResult(dataAuditoria?: string): AuditResult {
  const random = makeRandom(20260830);
  const situacoes = [
    "Com Presença e Com Estoque",
    "Com Presença e Com Estoque",
    "Com Presença e Com Estoque",
    "Com Presença e Sem Estoque",
    "Sem Presença e Com Estoque",
    "Sem Presença e Com Estoque",
    "Lido não pertence",
  ];

  const rows: RawRow[] = [];
  const total = 2400;
  for (let i = 0; i < total; i += 1) {
    const situacao =
      situacoes[Math.floor(random() * situacoes.length)] ?? "Com Presença e Com Estoque";
    const minute = 7 * 60 + Math.floor(random() * 260);
    rows.push({
      Código: 100000 + i,
      Produto: PRODUTOS[Math.floor(random() * PRODUTOS.length)] ?? "Produto",
      "Classe de Produto Raiz": SETORES[Math.floor(random() * SETORES.length)] ?? "DIVERSOS",
      Local: LOCAIS[Math.floor(random() * LOCAIS.length)] ?? "Corredor 01",
      Situação: situacao,
      "Estoque atual": Math.floor(random() * 900) + 1,
      Usuário:
        situacao === "Sem Presença e Com Estoque" && random() < 0.85
          ? null
          : (USUARIOS[Math.floor(random() * USUARIOS.length)] ?? "ana.souza"),
      "Auditado em.1": `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:00`,
      "Dias sem venda": random() < 0.35 ? 0 : Math.floor(random() * 60) + 1,
    });
  }

  const hoje = dataAuditoria ?? new Date().toISOString().slice(0, 10);

  return computeAudit({
    auditoria: "Presença",
    sku: 3200,
    dataAuditoria: hoje,
    origem: "Dados de exemplo (demonstração)",
    rows,
  });
}
