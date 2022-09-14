import { useComputed, Signal, batch } from "@preact/signals";
import { FunctionComponent } from "preact";
import MessageTemplate from "../../components/message-template";
import { MessageTemplateDetails } from "../../lib/types";

const SUBSTITUTION_REGEX = /([\[\{\<]+[\w\s]+[\]\}\>])+/g;

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
  const showReplacementTextNote = useComputed(
    () =>
      templates.value.length === 1 &&
      !SUBSTITUTION_REGEX.test(templates.value[0].message)
  );
  return (
    <div>
      <h5>Message Templates</h5>

      {showReplacementTextNote.value ? (
        <div class="alert alert-warning">
          Note: To use TurboVPB's Automatic Text Replacement, you need to
          include the field name and the brackets (for example, "Hi [Their
          Name]...") so that TurboVPB knows where to insert the appropriate
          values.
        </div>
      ) : null}

      {templates.value.map((messageTemplate, index) => (
        <MessageTemplate
          messageTemplate={messageTemplate}
          editTemplate={(template) => editTemplate(templates, index, template)}
          deleteTemplate={() => deleteTemplate(templates, index)}
        />
      ))}

      <button class="btn btn-primary" onClick={() => addTemplate(templates)}>
        Add Another Message Template
      </button>
    </div>
  );
};

export default MessageTemplateList;
