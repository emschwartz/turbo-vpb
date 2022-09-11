export type PhonebankType = "openvpb" | "everyaction" | "bluevote";

export type ConnectionStatus =
  | "connectingToServer"
  | "waitingForMessage"
  | "connected"
  | "disconnected";

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
