import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [
    preact(),
    webExtension({
      browser: process.env.TARGET || "chrome",
      webExtConfig: {
        startUrl: "http://localhost:8080/test-phonebank",
      },
    }),
  ],
});
