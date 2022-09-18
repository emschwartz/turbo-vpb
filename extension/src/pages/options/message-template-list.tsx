import { FunctionComponent } from "preact";
import { Signal, batch } from "@preact/signals";
import { PlusCircleIcon } from "@heroicons/react/20/solid";
import MessageTemplate from "../../components/message-template";
import { MessageTemplateDetails } from "../../lib/types";

function editTemplate(
  templates: Signal<MessageTemplateDetails[]>,
  index: number,
  template: Partial<MessageTemplateDetails>
) {
  batch(() => {
    Object.assign(templates.value[index], template);
    templates.value = [...templates.value];
  });
}

function deleteTemplate(
  templates: Signal<MessageTemplateDetails[]>,
  index: number
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
}> = ({ templates }) => {
  return (
    <div>
      <h3 class="text-lg font-medium leading-6 text-gray-900">
        Message Templates
      </h3>

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

      <div class="mt-4">
        <button
          className="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-3 py-2 text-sm font-medium leading-4 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          type="button"
          onClick={() => addTemplate(templates)}
        >
          <PlusCircleIcon className="-ml-0.5 mr-2 h-4 w-4" aria-hidden="true" />
          Add Message Template
        </button>
      </div>
    </div>
  );
};

export default MessageTemplateList;
