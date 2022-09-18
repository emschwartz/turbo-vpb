import { FunctionComponent } from "preact";
import { MessageTemplateDetails } from "src/lib/types";
import { TrashIcon, XMarkIcon } from "@heroicons/react/20/solid";

const SelectTexted: FunctionComponent<{
  selectTexted: boolean;
  editTemplate: (template: Partial<MessageTemplateDetails>) => void;
}> = ({ selectTexted, editTemplate }) => (
  <div className="relative flex items-start mt-2">
    <div
      className="flex h-5 items-center"
      onClick={() => editTemplate({ sendTextedResult: !selectTexted })}
    >
      <input
        id="select-texted"
        aria-describedby="select-texted-description"
        name="select-texted"
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        checked={selectTexted}
      />
    </div>
    <div className="ml-3 text-sm">
      <span id="select-texted-description" className="text-gray-700">
        Select <b>Texted</b> result code when sending this message
      </span>
    </div>
  </div>
);

const MessageTemplate: FunctionComponent<{
  messageTemplate: MessageTemplateDetails;
  editTemplate: (messageTemplate: Partial<MessageTemplateDetails>) => void;
  deleteTemplate: () => void;
}> = ({ messageTemplate, editTemplate, deleteTemplate }) => {
  return (
    <div class="">
      <div class="relative mt-1 -space-y-px rounded-md bg-white shadow-sm">
        <input
          type="text"
          name="template-label"
          class="relative block w-full rounded-md rounded-b-none border-gray-300 bg-transparent focus:z-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          placeholder="Template label to appear on TurboVPB button"
          value={messageTemplate.label}
          onInput={(e) => editTemplate({ label: e.currentTarget.value })}
        />
        <button
          class="absolute inset-y-0 right-0 pr-3 flex items-center"
          onClick={deleteTemplate}
          title="Delete template"
        >
          <TrashIcon class="h-5 w-5 text-gray-400" aria-hidden="true" />
        </button>
      </div>
      <div class="relative rounded-md -space-y-px rounded-t-none border border-gray-300 px-3 py-2 focus-within:z-10 focus-within:border-indigo-600 focus-within:ring-1 focus-within:ring-indigo-600">
        <textarea
          class="block w-full border-0 p-0 text-gray-900 placeholder-gray-500 focus:ring-0"
          rows={3}
          placeholder={
            "Message Contents\n\nHi [Their Name], this is [Your Name] from..."
          }
          onInput={(e) =>
            editTemplate({ message: (e.target as HTMLTextAreaElement).value })
          }
        >
          {messageTemplate.message}
        </textarea>
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
