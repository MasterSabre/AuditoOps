import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { readTheme, resolveTheme, THEME_STORAGE_KEY } from "@/lib/theme";

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset["theme"]; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("AuditOps theme preferences", () => {
  it("keeps the original white theme as the default", () => {
    render(<ThemeSwitcher />);
    expect(document.documentElement.dataset["theme"]).toBe("white");
    expect(screen.getByRole("button", { name: "Tema Branco" }).getAttribute("aria-pressed")).toBe("true");
  });
  it.each([["Preto", "black"], ["Esmeralda", "emerald"], ["Branco", "white"]])("persists %s after remounting", (label, value) => {
    const view = render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: `Tema ${label}` }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(value);
    view.unmount();
    render(<ThemeSwitcher />);
    expect(document.documentElement.dataset["theme"]).toBe(value);
    expect(screen.getByRole("button", { name: `Tema ${label}` }).getAttribute("aria-pressed")).toBe("true");
  });
  it("falls back to white for invalid stored themes", () => {
    expect(resolveTheme("invalid")).toBe("white");
  });
  it("still allows switching when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readTheme()).toBe("white");
    render(<ThemeSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: "Tema Preto" }));
    expect(document.documentElement.dataset["theme"]).toBe("black");
  });
});