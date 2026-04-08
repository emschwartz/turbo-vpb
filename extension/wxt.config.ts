import { defineConfig } from "wxt";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  srcDir: ".",
  vite: () => ({
    plugins: [preact(), tailwindcss()],
  }),
  webExt: {
    startUrls: ["http://localhost:8080/test-phonebank"],
  },
  manifest: ({ browser, mode }) => ({
    name: "TurboVPB",
    description:
      "Turbocharge phone banking with OpenVPB, VAN, and BlueVote. Call and text with 2 clicks!",
    version: "0.11.3",
    author: "Evan Schwartz",
    homepage_url: "https://turbovpb.com",
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'",
    },
    web_accessible_resources: [
      {
        resources: ["content-scripts/content.css"],
        matches: ["<all_urls>"],
      },
    ],
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: [
      "https://www.openvpb.com/*",
      "https://*.everyaction.com/*",
      "https://www.votebuilder.com/*",
      "https://phonebank.bluevote.com/*",
      "https://*.turbovpb.com/*",
      "https://*/ContactDetailScript",
      ...(mode === "development"
        ? ["http://localhost/*", "http://localhost:8080/*"]
        : []),
    ],
    action: {
      default_title: "TurboVPB",
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "{5ac6de74-7640-4236-a7ed-e19b356b666b}",
              data_collection_permissions: {
                required: ["personallyIdentifyingInfo"],
              },
            },
            developer: {
              name: "Evan Schwartz",
              url: "https://emschwartz.me",
            },
          },
        }
      : {}),
  }),
});
