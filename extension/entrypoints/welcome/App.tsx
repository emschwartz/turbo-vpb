import { FunctionComponent } from "preact";
import { signal } from "@preact/signals";
import { browser } from "wxt/browser";
import "../../assets/main.css";
import DataDisclosure from "../../components/data-disclosure";
import TurboVpbIcon from "../../components/turbovpb-icon";

const agreed = signal(false);

async function agree() {
  // Open phone bank tabs pick this up through storage.onChanged
  await browser.storage.local.set({ dataConsent: true });
  agreed.value = true;
}

const App: FunctionComponent = () => (
  <div class="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
    <h1 class="mb-6 text-slate-900">
      <div class="inline-flex items-center align-middle place-items-center mx-auto">
        <TurboVpbIcon class="w-8" />
        <span class="ml-3 text-4xl font-semibold">TurboVPB</span>
      </div>
    </h1>
    <div class="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
      <div class="flex flex-col space-y-4">
        {agreed.value ? (
          <p id="welcome-done" class="text-sm text-balance text-slate-700">
            Done. Open your phone bank page to get started.
          </p>
        ) : (
          <DataDisclosure onAgree={agree} />
        )}
      </div>
    </div>
  </div>
);

export default App;
