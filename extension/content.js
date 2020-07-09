console.log("Content script loaded")

// TODO get a better way to find these details
const checkForDetailsInterval = setInterval(getContactDetails, 50)
let firstName
let phoneNumber

function getContactDetails() {
    if (document.getElementById('contactName').innerText && document.getElementById('openvpbphonelink').innerText !== phoneNumber) {
        firstName = document.getElementById('contactName').innerText.split(' ')[0]
        phoneNumber = document.getElementById('openvpbphonelink').innerText
        console.log(firstName, phoneNumber)
    }
}