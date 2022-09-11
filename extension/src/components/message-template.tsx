import { h, FunctionComponent } from "preact";
import { MessageTemplateDetails } from "src/lib/types";

const DeleteIcon: FunctionComponent = () => (
  <svg
    width=".8em"
    height=".8em"
    viewBox="0 0 16 16"
    class="bi bi-trash-fill"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z"
    />
  </svg>
);

const MessageTemplate: FunctionComponent<{
  messageTemplate: MessageTemplateDetails;
  editTemplate: (messageTemplate: Partial<MessageTemplateDetails>) => void;
  deleteTemplate: () => void;
}> = ({ messageTemplate, editTemplate, deleteTemplate }) => {
  return (
    <div class="card pt-2 px-2 mb-3 bg-light">
      <div class="form-row">
        <div class="col">
          <input
            type="text"
            class="form-control"
            placeholder="Message Label (e.g. Didn't Get Through Message, More Info, etc.)"
            value={messageTemplate.label as any as string}
            onInput={(e) =>
              editTemplate({ label: (e.target as HTMLInputElement).value })
            }
          />
        </div>
        <div class="col-auto">
          <button
            type="button btn-sm align-middle"
            class="close"
            aria-label="Delete message template"
            onClick={deleteTemplate}
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
      <textarea
        class="form-control"
        rows={4}
        placeholder="Message Contents
(for example: Hi [Their Name], this is [Your Name] from...)"
        onInput={(e) =>
          editTemplate({ message: (e.target as HTMLTextAreaElement).value })
        }
      >
        {messageTemplate.message}
      </textarea>
      <div class="form-group form-check form-check-inline">
        <input
          type="checkbox"
          class="form-check-input"
          checked={messageTemplate.sendTextedResult as any as boolean}
          onInput={(e) =>
            editTemplate({
              sendTextedResult: (e.target as HTMLInputElement).checked,
            })
          }
        />
        <label class="form-check-label">
          Select <code>Texted</code> result code and load next contact after
          sending?
        </label>
      </div>
    </div>
  );
};

export default MessageTemplate;
