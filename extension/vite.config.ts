import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [
    preact(),
    webExtension()
  ],
});
