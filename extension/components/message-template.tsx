import { FunctionComponent } from "preact";
import { MessageTemplateDetails } from "../lib/types";
import { TrashIcon } from "./icons";

let selectTextedCounter = 0;

const SelectTexted: FunctionComponent<{
  selectTexted: boolean;
  editTemplate: (template: Partial<MessageTemplateDetails>) => void;
}> = ({ selectTexted, editTemplate }) => {
  const id = `select-texted-${++selectTextedCounter}`;
  return (
    <div className="relative flex items-start mt-2">
      <div
        className="flex h-5 items-center"
        onClick={() => editTemplate({ sendTextedResult: !selectTexted })}
      >
        <input
          id={id}
          aria-describedby={`${id}-description`}
          name={id}
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={selectTexted}
        />
      </div>
      <div className="ml-3 text-sm">
        <span id={`${id}-description`} className="text-slate-700">
          Select <b>Texted</b> result code when sending this message
        </span>
      </div>
    </div>
  );
};

const MessageTemplate: FunctionComponent<{
  messageTemplate: MessageTemplateDetails;
  editTemplate: (messageTemplate: Partial<MessageTemplateDetails>) => void;
  deleteTemplate: () => void;
}> = ({ messageTemplate, editTemplate, deleteTemplate }) => {
  return (
    <div>
      <div class="rounded-lg border border-slate-300 bg-white shadow-sm overflow-hidden focus-within:border-blue-400 focus-within:shadow-md transition-shadow">
        <div class="relative flex items-center border-b border-slate-200 bg-slate-50">
          <input
            type="text"
            name="template-label"
            class="block w-full border-0 bg-transparent pl-4 pr-12 py-3.5 font-medium text-slate-900 placeholder-slate-400 focus:ring-0 focus:outline-none sm:text-sm"
            placeholder="Button label"
            value={messageTemplate.label}
            onInput={(e) => editTemplate({ label: e.currentTarget.value })}
          />
          <button
            class="absolute right-0 px-4 flex items-center focus:outline-none"
            onClick={deleteTemplate}
            title="Delete template"
          >
            <TrashIcon
              class="h-5 w-5 text-slate-400 hover:text-slate-600"
              aria-hidden={true}
            />
          </button>
        </div>
        <div class="px-4 py-3">
          <textarea
            class="block w-full border-0 p-0 text-slate-900 placeholder-slate-400 focus:ring-0 focus:outline-none sm:text-sm"
            rows={3}
            placeholder={
              "Message Contents\n\nHi [Their Name], this is [Your Name] from..."
            }
            value={messageTemplate.message}
            onInput={(e) =>
              editTemplate({ message: (e.target as HTMLTextAreaElement).value })
            }
          />
        </div>
      </div>

      <div class="mt-3 mb-4">
        <SelectTexted
          editTemplate={editTemplate}
          selectTexted={messageTemplate.sendTextedResult}
        />
      </div>
    </div>
  );
};

export default MessageTemplate;
