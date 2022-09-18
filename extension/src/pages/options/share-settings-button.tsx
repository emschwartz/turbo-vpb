import { FunctionComponent } from "preact";
import { CloudArrowUpIcon } from "@heroicons/react/20/solid";
import { useComputed, Signal } from "@preact/signals";
import { MessageTemplateDetails } from "../../lib/types";

const ShareSettingsButton: FunctionComponent<{
  templates: Signal<MessageTemplateDetails[]>;
  serverUrl: Signal<string>;
}> = ({ templates, serverUrl }) => {
  const url = useComputed(() => {
    let url: URL;
    try {
      url = new URL("/share", serverUrl.value);
    } catch (err) {
      url = new URL("/share", "https://turbovpb.com");
    }
    url.searchParams.append(
      "messageTemplates",
      JSON.stringify(templates.value)
    );
    return url.toString();
  });

  return (
    <a
      type="button"
      target="_blank"
      href={url.value}
      class="inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      <CloudArrowUpIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
      Share Templates
    </a>
  );
};

export default ShareSettingsButton;
