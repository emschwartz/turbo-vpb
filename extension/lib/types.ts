export type PhonebankType = "openvpb" | "everyaction" | "bluevote";

export type ServerStatus =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "error"; error: string };

export type PeerStatus = { state: "waiting" } | { state: "connected" };

export type ScrapingStatus =
  | { state: "searching" }
  | { state: "found" }
  | { state: "not_found"; platform: PhonebankType; pageHints: PageHints };

export type PageHints = {
  url: string;
  bodyClasses: string;
  elementIds: string[];
  selectorsExpected: string[];
  phoneNumberLocations: PhoneNumberLocation[];
  htmlStructure: string;
};

export type PhoneNumberLocation = {
  number: string;
  domPath: string;
};

export type ContactDetails = {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  additionalFields: { [key: string]: string };
};

export type Stats = {
  calls: number;
  successfulCalls: number;
  lastContactLoadTime?: number;
  startTime: number;
};

// This represents the date (YYYY-MM-DD) and the number of calls made on that day
export type DailyCallStats = [string, number];
export type DailyCallHistory = DailyCallStats[];

export type ConnectionDetails = {
  encryptionKey: string;
  sessionId: string;
  channelId: string;
};

export type MessageTemplateDetails = {
  label: string;
  message: string;
  sendTextedResult: boolean;
};

export type ExtensionSettings = {
  yourName?: string;
  messageTemplates?: MessageTemplateDetails[];
  serverUrl?: string;
};

export type SiteStatus = "enabled" | "disabled" | "unsupported";

export type ConnectionStatus =
  | "connectingToServer"
  | "waitingForMessage"
  | "connected"
  | "disconnected";
