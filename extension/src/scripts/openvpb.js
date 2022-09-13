function getContactDetails() {
  // Figure out if this is a new contact
  if (contactName && currentPhoneNumber && isNewContact(currentPhoneNumber)) {
    couldntReachContact = false;

    // Determine if they couldn't reach the contact
    if (couldntReachButton()) {
      couldntReachButton().addEventListener("click", async () => {
        couldntReachContact = true;
        console.log(`couldn't reach contact: ${couldntReachContact}`);

        const [cancelButton, saveNextButton] = await Promise.all([
          waitForButton([
            "contactresultscancelbutton",
            "contactResultsCancelButton",
          ]),
          waitForButton([
            "contactresultssavenextbutton",
            "contactResultsSaveNextButton",
          ]),
        ]);
        cancelButton.addEventListener("click", () => {
          couldntReachContact = false;
          console.log(`couldn't reach contact: ${couldntReachContact}`);
        });
        saveNextButton.addEventListener("click", onSaveNextClick);
      });
    } else {
      console.warn("could not find couldnt reach button");
    }

    // Log successful calls
    if (saveNextButton()) {
      saveNextButton().addEventListener("click", onSaveNextClick);
    } else {
      console.warn("could not find save next button");
    }

    handleContact(contactName, currentPhoneNumber, additionalFields);
  }
}

async function onSaveNextClick() {
  console.log("saving contact result");
  if (couldntReachContact) {
    // TODO save actual result
    await saveCall("NotContacted");
  } else {
    await saveCall("Contacted");
  }

  if (firstCall) {
    firstCall = false;
    const nextCallButton = await waitForButton([
      "firstcallmodalnextcallbutton",
      "firstCallModalNextCallButton",
    ]);
    nextCallButton.click();
    console.log("clicking through first call pop up");
  }
}
