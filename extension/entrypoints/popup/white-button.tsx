import { FunctionComponent, VNode } from "preact";

const WhiteButton: FunctionComponent<{
  text: string;
  icon: VNode;
  title?: string;
  onClick: () => void;
}> = ({ text, icon, onClick, title }) => (
  <button
    onClick={onClick}
    title={title}
    class="inline-flex items-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
  >
    <div class="-ml-1 mr-3 h-6 w-6 flex-shrink-0">{icon}</div>
    {text}
  </button>
);

export default WhiteButton;
