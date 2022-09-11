import { ContactDetails, PhonebankType } from "../types";
import * as openvpb from "./openvpb";
import * as everyaction from "./everyaction";
import * as bluevote from "./bluevote";

interface VpbIntegration {
  scrapeContactDetails: () => ContactDetails | undefined;
  scrapeResultCodes: () => string[] | undefined;
  markResult(code: string): void;
}

const integrations: { [Property in PhonebankType]: VpbIntegration } = {
  openvpb: openvpb,
  everyaction: everyaction,
  bluevote: bluevote,
};

export default integrations;
