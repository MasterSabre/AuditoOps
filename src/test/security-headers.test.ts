import { describe, expect, it } from "vitest";
import server from "../server";

describe("proteções HTTP", () => {
  it("bloqueia POSTs de origem externa antes de chegar à API", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://site-malicioso.example",
          "sec-fetch-site": "cross-site",
        },
      }),
      undefined,
      undefined,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("CSRF") });
  });

  it("bloqueia uma origem diferente mesmo sem Sec-Fetch-Site", async () => {
    const response = await server.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { origin: "https://site-malicioso.example" },
      }),
      undefined,
      undefined,
    );

    expect(response.status).toBe(403);
  });
});
