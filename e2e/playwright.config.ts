import { defineConfig } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPort = parseInt(process.env.TURBOVPB_TEST_PORT || "8089");
const serverDir = path.resolve(__dirname, "../server");

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Extensions require serial execution
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${serverPort}`,
    trace: "on-first-retry",
    video: "on-first-retry",
  },
  webServer: {
    command: `PORT=${serverPort} cargo run --manifest-path ${path.resolve(serverDir, "Cargo.toml")}`,
    port: serverPort,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: serverDir,
  },
});
