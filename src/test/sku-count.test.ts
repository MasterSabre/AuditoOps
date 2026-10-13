import { describe, expect, it } from "vitest";
import { countUniqueSkuCodes } from "@/lib/audit/parse";
import type { RawRow } from "@/lib/audit/types";

describe("automatic SKU count from the Código column", () => {
  it("counts each non-empty product code once, even when a code repeats", () => {
    const rows: RawRow[] = [
      { Código: " 123 " },
      { Código: 123 },
      { Código: "456" },
      { Código: "" },
      { Código: null },
      {},
    ];

    expect(countUniqueSkuCodes(rows)).toBe(2);
  });

  it("returns zero when no row has a product code", () => {
    expect(countUniqueSkuCodes([{ Produto: "Produto sem código" }, { Código: "   " }])).toBe(0);
  });
});
