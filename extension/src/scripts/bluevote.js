function getContactDetails() {
  // Create TurboVPB Container
  if (!document.getElementById("turbovpbcontainer")) {
    const sidebarContainer = document.querySelector(".caller-info");
    if (sidebarContainer) {
      const qrCode = createQrCode();
      qrCode.setAttribute("min-width", "100px");
      if (qrCode) {
        const container = document.createElement("div");
        container.id = "turbovpbcontainer";
        container.className = "additional-info";

        const content = document.createElement("div");
        content.className = "mb-20";
        container.appendChild(content);

        const title = createTitleElement("label");
        content.appendChild(title);

        content.appendChild(qrCode);
        sidebarContainer.appendChild(container);
      }
    }
  }

  if (!window.sessionStorage.getItem("turboVpbResultCodes")) {
    getResultCodes();
  }

  // Find phone number
  const currentPhoneNumber = (
    document.getElementById("main-phone") ||
    Array.from(document.getElementsByTagName("a")).find((a) =>
      a.href.startsWith("tel:")
    ) ||
    {}
  ).innerText;

  const contactName =
    (document.getElementById("voter-name") &&
      document.getElementById("voter-name").innerText.replace(/\s\*/, "")) ||
    null;

  // Figure out if this is a new contact
  if (contactName && currentPhoneNumber && isNewContact(currentPhoneNumber)) {
    couldntReachContact = false;

    try {
      // Determine if they couldn't reach the contact
      for (let radio of nonContactRadioButtons()) {
        radio.addEventListener("click", () => {
          couldntReachContact = true;

          document
            .querySelector(".clearNonContact")
            .addEventListener("click", () => {
              couldntReachContact = false;
            });
        });
      }

      // Log successful calls
      if (saveNextButton()) {
        saveNextButton().addEventListener("click", async () => {
          if (couldntReachContact) {
            // TODO save actual result
            await saveCall("NotContacted");
          } else {
            await saveCall("Contacted");
          }
        });
      }
    } catch (err) {
      console.error(err);
    }

    handleContact(contactName, currentPhoneNumber);
  }
}
