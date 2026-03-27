import { FunctionComponent } from "preact";
import TurboVpbIcon from "./turbovpb-icon";

const TurboVpbLogoAndName: FunctionComponent = () => (
  <a
    href="https://turbovpb.com"
    target="_blank"
    class="inline-flex flex-row items-center space-x-2 text-slate-900 hover:no-underline hover:text-slate-900 visited:no-underline visited:text-slate-900"
  >
    <TurboVpbIcon class="w-4" />
    <div class="text-lg font-semibold">TurboVPB</div>
  </a>
);

export default TurboVpbLogoAndName;
