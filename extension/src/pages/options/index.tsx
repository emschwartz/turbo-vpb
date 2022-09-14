import { h, FunctionComponent } from "preact";
import { ExtensionSettings, MessageTemplateDetails } from "src/lib/types";
import { batch, effect, signal } from "@preact/signals";
import { browser } from "webextension-polyfill-ts";
import MessageTemplateList from "./message-template-list";
import ShareSettingsButton from "./share-settings-button";
import "../../scss/main.scss";

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

const RightArrow: FunctionComponent = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 16 16"
    class="bi bi-arrow-right"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      d="M10.146 4.646a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L12.793 8l-2.647-2.646a.5.5 0 0 1 0-.708z"
    />
    <path
      fill-rule="evenodd"
      d="M2 8a.5.5 0 0 1 .5-.5H13a.5.5 0 0 1 0 1H2.5A.5.5 0 0 1 2 8z"
    />
  </svg>
);

const OptionsPage: FunctionComponent = () => {
  return (
    <div class="container container-md py-3">
      <div class="row align-items-center mb-4">
        <div class="col">
          <h4>Text Message Settings</h4>
        </div>
        <div class="col text-right">
          <ShareSettingsButton
            templates={messageTemplates}
            serverUrl={serverUrl}
          />
        </div>
      </div>
      <p>
        Create one or more message templates below to enable 2-click texting.
        <br />A button to send each message will appear on TurboVPB on your
        phone.
      </p>

      <h5 class="mt-4">Automatic Text Replacement</h5>
      <p>
        TurboVPB will automatically replace the following keywords (including
        the brackets) in the message templates with the value on the right:
      </p>
      <table class="table">
        <tbody>
          <tr>
            <td class="align-middle text-center">
              <code>[Your Name]</code>
            </td>
            <td class="align-middle text-center">
              <RightArrow />
            </td>
            <td class="align-middle text-center">
              <input
                type="text"
                class="form-control"
                placeholder="Your first name"
                // TODO fix this when the Preact Signals types allow passing a signal to a value prop
                value={yourName as any as string}
                onInput={(e) =>
                  setYourName((e.target as HTMLInputElement).value)
                }
              />
            </td>
          </tr>
          <tr class="align-middle text-center">
            <td class="align-middle text-center">
              <code>[Their Name]</code>
            </td>
            <td class="align-middle text-center">
              <RightArrow />
            </td>
            <td class="align-middle text-center">
              <input
                type="text"
                class="form-control"
                placeholder="(Contact's first name)"
                disabled
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Fields from the <b>Additional Info</b> panel in VAN or the{" "}
        <b>About {"{{ Name }}"}</b> sidebar in OpenVPB can also be automatically
        inserted. For example, <code>[County]</code> will be replaced with the
        contact's county if that field is set to be displayed in the phone bank.
      </p>
      <br />

      <MessageTemplateList templates={messageTemplates} />

      <div class="row align-items-center my-4">
        <div class="col">
          <h4>Advanced Settings</h4>
        </div>
      </div>
      <h5 class="mt-4">TurboVPB Server URL</h5>
      <p>If you are using a self-hosted TurboVPB server, set the URL here.</p>
      <input
        type="text"
        class="form-control"
        placeholder="https://turbovpb.com"
        // TODO fix this when the Preact Signals types allow passing a signal to a value prop
        value={serverUrl as any as string}
        onInput={(e) => setServerUrl((e.target as HTMLInputElement).value)}
      />
      <p class="text-muted mt-5">
        <small>Settings are saved automatically.</small>
      </p>
    </div>
  );
};

export default OptionsPage;
