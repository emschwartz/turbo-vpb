import { h, FunctionComponent } from "preact";
import { ExtensionSettings, MessageTemplateDetails } from "src/lib/types";
import { batch, effect, Signal, signal } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import MessageTemplateList from "./message-template-list";
import ShareSettingsButton from "./share-settings-button";
import "../../index.css";
import { InformationCircleIcon } from "@heroicons/react/24/solid";

const serverUrl = signal("");
const yourName = signal("");
const messageTemplates = signal<MessageTemplateDetails[]>([
  {
    label: "",
    message: "",
    sendTextedResult: false,
  },
]);

// Load the settings from storage
batch(() =>
  browser.storage.local
    .get(["messageTemplates", "serverUrl", "yourName"])
    .then((settings: ExtensionSettings) => {
      serverUrl.value = settings.serverUrl || "";
      yourName.value = settings.yourName || "";
      if (settings.messageTemplates?.length > 0) {
        messageTemplates.value = settings.messageTemplates;
      }
    })
);
effect(() => {
  const settings: ExtensionSettings = {
    serverUrl: serverUrl.value,
    yourName: yourName.value,
    messageTemplates: messageTemplates.value.filter(
      (template) => !!template.label && !!template.message
    ),
  };
  console.log("Saving settings", settings);
  return browser.storage.local.set(settings);
});

function setServerUrl(url: string) {
  serverUrl.value = url;
}
function setYourName(name: string) {
  yourName.value = name;
}

const TextMessageSettings: FunctionComponent = () => (
  <div class="space-y-8 divide-gray-200">
    <div>
      <h3 class="text-lg leading-6 font-medium text-gray-900">
        Text Message Settings
      </h3>
      <p class="mt-1 text-sm leading-5 text-gray-500">
        Create message templates below to enable 2-click texting. Buttons to
        send each message will appear on TurboVPB on your phone.
      </p>

      <p class="mt-2">
        <ShareSettingsButton
          templates={messageTemplates}
          serverUrl={serverUrl}
        />
      </p>
    </div>
  </div>
);

const TextReplacement: FunctionComponent = () => (
  <div>
    <div>
      <h3 class="text-lg leading-6 font-medium text-gray-900">
        Automatic Text Replacement
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        TurboVPB automatically personalizes your messages by replacing keywords
        from your message templates with your name and the contact's details.
      </p>
    </div>

    <div class="mt-6">
      <label
        htmlFor="first-name"
        class="block text-sm font-medium text-gray-700"
      >
        Your Name
      </label>
      <div class="mt-1">
        <input
          type="text"
          name="first-name"
          id="first-name"
          autoComplete="given-name"
          class="block max-w-lg rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="Enter your first name"
          value={yourName as unknown as string}
          onInput={(e) => setYourName((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>

    <div class="mt-6 rounded-md bg-blue-50 p-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <InformationCircleIcon
            class="h-5 w-5 text-blue-400"
            aria-hidden="true"
          />
        </div>
        <div class="ml-3 flex-1">
          <p class="text-sm text-blue-700">
            <p>
              The name you enter above will be inserted wherever the text{" "}
              <b>[Your Name]</b> appears in a message template.{" "}
              <b>[Their Name]</b> will be replaced by the contact's first name.
              Other details can be inserted in the same way, for example{" "}
              <b>[City]</b> or <b>[Polling Location]</b>.
            </p>
          </p>
        </div>
      </div>
    </div>
  </div>
);

const AdvancedSettings: FunctionComponent = () => (
  <div>
    <div>
      <h3 class="text-lg leading-6 font-medium text-gray-900">
        Advanced Settings
      </h3>
    </div>

    <div class="mt-6">
      <label
        htmlFor="server-url"
        class="block text-sm font-medium text-gray-700"
      >
        TurboVPB Server URL
      </label>
      <div class="mt-1">
        <input
          type="text"
          name="server-url"
          id="server-url"
          class="block max-w-lg rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          value={serverUrl as unknown as string}
          onInput={(e) => setServerUrl((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>
  </div>
);

const OptionsPage: FunctionComponent = () => {
  return (
    <div class="container p-8 space-y-8 divide-gray-200">
      <TextMessageSettings />

      <TextReplacement />

      <MessageTemplateList templates={messageTemplates} />

      <hr />

      <AdvancedSettings />

      <p class="font-medium text-sm text-gray-500 mt-6">
        Settings are saved automatically.
      </p>
    </div>
  );
};

export default OptionsPage;
