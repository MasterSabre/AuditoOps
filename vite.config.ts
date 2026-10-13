import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Keep the custom SSR wrapper for request-level authorization and headers.
      server: { entry: "server" },
    }),
    nitro(),
    tsconfigPaths(),
    viteReact(),
  ],
});
