import { FunctionComponent } from "preact";
import { MessageTemplateDetails } from "../lib/types";
import { TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";

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
    <div class="">
      <div class="relative mt-1 -space-y-px rounded-lg bg-white shadow-sm">
        <input
          type="text"
          name="template-label"
          class="relative block w-full rounded-lg rounded-b-none border-slate-300 bg-transparent focus:z-10 focus:border-blue-500 focus:ring-blue-500"
          placeholder="Template label to appear on TurboVPB button"
          value={messageTemplate.label}
          onInput={(e) => editTemplate({ label: e.currentTarget.value })}
        />
        <button
          class="absolute inset-y-0 right-0 pr-3 flex items-center"
          onClick={deleteTemplate}
          title="Delete template"
        >
          <TrashIcon class="h-5 w-5 text-slate-400" aria-hidden="true" />
        </button>
      </div>
      <div class="relative rounded-lg -space-y-px rounded-t-none border border-slate-300 px-3 py-2 focus-within:z-10 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600">
        <textarea
          class="block w-full border-0 p-0 text-slate-900 placeholder-slate-400 focus:ring-0"
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

      <div class="mt-2 mb-4">
        <SelectTexted
          editTemplate={editTemplate}
          selectTexted={messageTemplate.sendTextedResult}
        />
      </div>
    </div>
  );
};

export default MessageTemplate;
