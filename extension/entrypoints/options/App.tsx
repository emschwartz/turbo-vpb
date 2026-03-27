import { FunctionComponent } from 'preact';
import { ExtensionSettings, MessageTemplateDetails } from '../../lib/types';
import { batch, effect, signal } from '@preact/signals';
import { browser } from 'wxt/browser';
import MessageTemplateList from './message-template-list';
import '../../assets/main.css';
import { InformationCircleIcon } from '@heroicons/react/24/solid';
import TurboVpbLogoAndName from '../../components/turbovpb-logo-and-name';

const serverUrl = signal("");
const yourName = signal("");
const messageTemplates = signal<MessageTemplateDetails[]>([
  {
    label: "",
    message: "",
    sendTextedResult: false,
  },
]);

// Load the settings from storage, then register the auto-save effect
let saveTimeout: ReturnType<typeof setTimeout> | undefined;
browser.storage.local
  .get(["messageTemplates", "serverUrl", "yourName"])
  .then((settings: ExtensionSettings) => {
    batch(() => {
      serverUrl.value = settings.serverUrl || "";
      yourName.value = settings.yourName || "";
      if (settings.messageTemplates?.length > 0) {
        messageTemplates.value = settings.messageTemplates;
      }
    });
    // Register the auto-save effect after the initial load completes
    effect(() => {
      const settings: ExtensionSettings = {
        serverUrl: serverUrl.value,
        yourName: yourName.value,
        messageTemplates: messageTemplates.value.filter(
          (template) => !!template.label && !!template.message,
        ),
      };
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        console.log("Saving settings", settings);
        browser.storage.local.set(settings).catch(console.error);
      }, 400);
    });
  });

function setServerUrl(url: string) {
  serverUrl.value = url;
}
function setYourName(name: string) {
  yourName.value = name;
}

const TextReplacement: FunctionComponent = () => (
  <div>
    <div>
      <h3 class="text-lg leading-6 font-semibold text-slate-900">
        Automatic Text Replacement
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        TurboVPB automatically personalizes your text messages by replacing
        keywords from your message templates with your name and the contact's
        details.
      </p>
    </div>

    <div class="mt-6">
      <label
        htmlFor="first-name"
        class="block text-sm font-medium text-slate-700"
      >
        Your Name
      </label>
      <div class="mt-1">
        <input
          type="text"
          name="first-name"
          id="first-name"
          autoComplete="given-name"
          class="block max-w-lg rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="Enter your first name"
          value={yourName as unknown as string}
          onInput={(e) => setYourName((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>

    <div class="mt-6 rounded-lg bg-blue-50 p-4 border-l-4 border-blue-400">
      <div class="flex">
        <div class="flex-shrink-0">
          <InformationCircleIcon
            class="h-5 w-5 text-blue-400"
            aria-hidden="true"
          />
        </div>
        <div class="ml-3 flex-1">
          <p class="text-sm text-blue-700">
              The name you enter above will be inserted wherever the text{" "}
              <b>[Your Name]</b> appears in a message template.{" "}
              <b>[Their Name]</b> will be replaced by the contact's first name.
              Other details can be inserted in the same way, for example{" "}
              <b>[City]</b> or <b>[Polling Location]</b>.
          </p>
        </div>
      </div>
    </div>
  </div>
);

const AdvancedSettings: FunctionComponent = () => (
  <div>
    <div>
      <h3 class="text-lg leading-6 font-semibold text-slate-900">
        Advanced Settings
      </h3>
    </div>

    <div class="mt-6">
      <label
        htmlFor="server-url"
        class="block text-sm font-medium text-slate-700"
      >
        TurboVPB Server URL
      </label>
      <div class="mt-1">
        <input
          type="text"
          name="server-url"
          id="server-url"
          class="block max-w-lg rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          value={serverUrl as unknown as string}
          onInput={(e) => setServerUrl((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>
  </div>
);

const OptionsPage: FunctionComponent = () => {
  return (
    <div>
      <nav class="border-b border-slate-200 bg-white px-8 py-3 flex items-center gap-3">
        <TurboVpbLogoAndName />
        <span class="text-sm text-slate-400">Settings</span>
      </nav>
      <div class="container p-8 space-y-8 divide-slate-200 mx-auto">
        <TextReplacement />
        <MessageTemplateList templates={messageTemplates} serverUrl={serverUrl} />
        <hr />
        <AdvancedSettings />
        <p class="font-medium text-sm text-slate-400 mt-6">
          Settings are saved automatically.
        </p>
      </div>
    </div>
  );
};

export default OptionsPage;
