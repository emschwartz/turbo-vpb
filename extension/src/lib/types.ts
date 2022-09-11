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
