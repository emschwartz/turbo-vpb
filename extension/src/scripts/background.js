import browser from "webextension-polyfill";
import "content-scripts-register-polyfill";
const TURBOVPB_SHARE_ORIGIN = "https://turbovpb.com/share*";

// const DEFAULT_SERVER_URL = 'https://turbovpb.com'
const DEFAULT_SERVER_URL = "http://localhost:8080";

// Stored as:
//   sessionId -> [ timestamp, duration, result, textedTimestamp ]
const sessionRecords = {};
let totalCalls = 0;
let totalTexts = 0;
const TIMESTAMP_INDEX = 0;
const DURATION_INDEX = 1;
const RESULT_INDEX = 2;
const TEXTED_TIMESTAMP_INDEX = 3;
const RESULT_CODES = {
  Contacted: 1,
  NotContacted: 2,
  Texted: 3,
};

// Run when installed or updated
browser.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  const { statsStartDate } = await browser.storage.local.get([
    "statsStartDate",
  ]);
  if (!statsStartDate) {
    console.log("setting stats start date");
    await browser.storage.local.set({
      statsStartDate: new Date().toISOString(),
    });
  }

  if (typeof browser.browserAction.openPopup === "function") {
    browser.browserAction.openPopup();
  }
});

async function injectShareScript() {
  console.log("Registering share integration content script");
  await browser.contentScripts.register({
    matches: [TURBOVPB_SHARE_ORIGIN],
    js: [{ file: "./share-integration.js" }],
    css: [{ file: "../../node_modules/tingle.js/dist/tingle.css" }],
  });
}

// This comes from the mobile page
async function saveCallRecord({ sessionId, callNumber, timestamp, duration }) {
  console.log(
    `saving call record for session: ${sessionId} call ${callNumber}, duration: ${duration}`
  );
  if (!sessionRecords[sessionId]) {
    sessionRecords[sessionId] = [];
  }
  if (!sessionRecords[sessionId][callNumber]) {
    sessionRecords[sessionId][callNumber] = [];
  }
  sessionRecords[sessionId][callNumber][TIMESTAMP_INDEX] = timestamp;
  sessionRecords[sessionId][callNumber][DURATION_INDEX] = duration;
  totalCalls += 1;

  // TODO make sure we don't run out of storage space
  await browser.storage.local.set({ sessionRecords, totalCalls });
}

// This comes from the content script
async function saveCallResult({ sessionId, callNumber, result }) {
  console.log(
    `saving call result for session: ${sessionId} call ${callNumber}, result: ${result}`
  );
  if (!sessionRecords[sessionId]) {
    sessionRecords[sessionId] = [];
  }
  if (!sessionRecords[sessionId][callNumber]) {
    sessionRecords[sessionId][callNumber] = [];
  }
  if (!sessionRecords[sessionId][callNumber][TIMESTAMP_INDEX]) {
    sessionRecords[sessionId][callNumber][TIMESTAMP_INDEX] = Date.now();
  }
  if (!sessionRecords[sessionId][callNumber][RESULT_INDEX]) {
    sessionRecords[sessionId][callNumber][RESULT_INDEX] =
      RESULT_CODES[result] || result;
  }

  await browser.storage.local.set({ sessionRecords });
}

// This comes from the mobile site
async function saveTextRecord({ sessionId, callNumber, timestamp }) {
  console.log(`saving text for session: ${sessionId} call ${callNumber}`);
  if (!sessionRecords[sessionId]) {
    sessionRecords[sessionId] = [];
  }
  if (!sessionRecords[sessionId][callNumber]) {
    sessionRecords[sessionId][callNumber] = [];
  }

  sessionRecords[sessionId][callNumber][RESULT_INDEX] = RESULT_CODES.Texted;
  sessionRecords[sessionId][callNumber][TEXTED_TIMESTAMP_INDEX] = timestamp;
  totalTexts += 1;

  await browser.storage.local.set({ sessionRecords, totalTexts });
}

function getTotalCalls() {
  return totalCalls;
}
