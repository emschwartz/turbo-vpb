import { FunctionComponent } from "preact";
import { Signal, batch } from "@preact/signals";
import { PlusCircleIconSolid as PlusCircleIcon } from "../../components/icons";
import MessageTemplate from "../../components/message-template";
import { MessageTemplateDetails } from "../../lib/types";
import ShareSettingsButton from "./share-settings-button";

function editTemplate(
  templates: Signal<MessageTemplateDetails[]>,
  index: number,
  template: Partial<MessageTemplateDetails>,
) {
  batch(() => {
    Object.assign(templates.value[index], template);
    templates.value = [...templates.value];
  });
}

function deleteTemplate(
  templates: Signal<MessageTemplateDetails[]>,
  index: number,
) {
  templates.value.splice(index, 1);
  if (templates.value.length === 0) {
    templates.value.push({
      label: "",
      message: "",
      sendTextedResult: false,
    });
  }
  templates.value = [...templates.value];
}

function addTemplate(templates: Signal<MessageTemplateDetails[]>) {
  console.log("add template");
  templates.value.push({
    label: "",
    message: "",
    sendTextedResult: false,
  });
  templates.value = [...templates.value];
}

const MessageTemplateList: FunctionComponent<{
  templates: Signal<MessageTemplateDetails[]>;
  serverUrl: Signal<string>;
}> = ({ templates, serverUrl }) => {
  return (
    <div>
      <h3 class="text-lg font-semibold leading-6 text-slate-900">
        Text Message Templates
      </h3>

      <p class="mt-1 text-sm leading-5 text-slate-500">
        Create message templates to enable 2-click texting. Buttons to send each
        message will appear on TurboVPB on your phone.
      </p>

      <div class="flex flex-col mt-6 space-y-8">
        {templates.value.map((messageTemplate, index) => (
          <MessageTemplate
            messageTemplate={messageTemplate}
            editTemplate={(template) =>
              editTemplate(templates, index, template)
            }
            deleteTemplate={() => deleteTemplate(templates, index)}
          />
        ))}
      </div>

      <div class="mt-6 flex flex-row space-x-4">
        <button
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium leading-4 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          type="button"
          onClick={() => addTemplate(templates)}
        >
          <PlusCircleIcon
            class="-ml-1 mr-2 h-5 w-5 text-slate-400"
            aria-hidden={true}
          />
          Add Message Template
        </button>

        <ShareSettingsButton templates={templates} serverUrl={serverUrl} />
      </div>
    </div>
  );
};

export default MessageTemplateList;
