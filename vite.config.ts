import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "site",
  build: {
    outDir: "../site/dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "site/index.html"),
        land: resolve(__dirname, "site/land.html"),
        voting: resolve(__dirname, "site/voting.html"),
        soul: resolve(__dirname, "site/soul.html"),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
