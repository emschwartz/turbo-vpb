import { FunctionComponent } from "preact";
import TurboVpbIcon from "./turbovpb-icon";

const TurboVpbLogoAndName: FunctionComponent = () => (
  <a
    href="https://turbovpb.com"
    target="_blank"
    class="flex flex-row items-center space-x-2 text-gray-900 hover:no-underline hover:text-black"
  >
    <TurboVpbIcon class="w-4" />
    <div class="text-lg">TurboVPB</div>
  </a>
);

export default TurboVpbLogoAndName;
