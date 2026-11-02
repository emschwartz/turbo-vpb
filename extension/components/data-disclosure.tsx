import { ComponentChildren, FunctionComponent } from "preact";
import { CheckIcon } from "./icons";

// The disclosure shown before TurboVPB handles any contact details, with the
// button that records the user's agreement. Shared by the QR code modal and
// the welcome page so the wording lives in one place.

const CheckItem: FunctionComponent<{ children: ComponentChildren }> = ({
  children,
}) => (
  <li class="flex items-start space-x-2">
    <CheckIcon class="h-5 w-5 flex-none text-green-600" aria-hidden={true} />
    <span>{children}</span>
  </li>
);

const DataDisclosure: FunctionComponent<{ onAgree: () => void }> = ({
  onAgree,
}) => (
  <>
    <h3 class="text-lg font-semibold text-balance text-slate-900">
      Private and secure by design
    </h3>
    <p class="text-sm text-balance text-slate-700">
      TurboVPB sends the name, phone number, and other details of each contact
      on your phone bank page to your phone.
    </p>
    <ul class="space-y-2 text-left text-sm text-pretty text-slate-700">
      <CheckItem>
        <strong class="text-slate-900">End-to-end encrypted:</strong> only your
        computer and phone can read it
      </CheckItem>
      <CheckItem>
        <strong class="text-slate-900">We never see contact details:</strong>{" "}
        our server only passes along encrypted messages
      </CheckItem>
      <CheckItem>
        <strong class="text-slate-900">No accounts or ads</strong>
      </CheckItem>
    </ul>
    <button
      type="button"
      class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      onClick={onAgree}
    >
      Agree and connect
    </button>
    <a
      href="https://turbovpb.com/privacy"
      target="_blank"
      rel="noopener"
      class="block text-center text-xs text-slate-500 underline"
    >
      Privacy policy
    </a>
  </>
);

export default DataDisclosure;
