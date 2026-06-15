// ============================================================================
// ONLINE USERS FUNCTIONS
// ============================================================================

// Updates the list of online users displayed in the sidebar with matching status indicators
function updateUserList(usernames) {

  // Get the <ul> element that contains the user list
  const userList = document.getElementById("users");

  // Remove all existing user entries before rebuilding the list
  userList.replaceChildren();

  // Loop through each username received from the server
  for (const username of usernames) {

    // Create a new <li> element for this user wrapper
    const listItem = document.createElement("li");

    // Create a little span for the online status dot indicator seen in the design
    const statusDot = document.createElement("span");
    statusDot.style.width = "8px";
    statusDot.style.height = "8px";
    statusDot.style.backgroundColor = "#10b981"; // Vibrant emerald green dot
    statusDot.style.borderRadius = "50%";
    statusDot.style.marginRight = "12px";
    statusDot.style.display = "inline-block";

    // Create a span to hold the actual text name
    const nameSpan = document.createElement("span");
    nameSpan.textContent = username;

    // Add a tooltip that appears when the user hovers over the username
    listItem.setAttribute(
      "title",
      `${username} is connected and active in this server.`
    );

    // Assemble the components: Drop the dot and name inside the list item
    listItem.appendChild(statusDot);
    listItem.appendChild(nameSpan);

    // Add the completed item to the online users list panel
    userList.appendChild(listItem);
  }
}

// ============================================================================
// TYPING INDICATOR FUNCTIONS
// ============================================================================

// This place ensures we show a friendly message when another user is typing!
function showUserIsTyping(username) {

  // Grab our typing indicator div from the HTML layout
  const typingIndicator = document.getElementById("typing-indicator");

  // Change the blank space to say exactly who is working on a message
  typingIndicator.textContent = `${username} is typing...`;
}

// This place ensures the text clears out and goes invisible when they stop typing
function clearTypingIndicator() {

  // Grab that same typing indicator div
  const typingIndicator = document.getElementById("typing-indicator");

  // Make it completely blank again so it takes up no visual space
  typingIndicator.textContent = "";
}

// ============================================================================
// CHAT CONVERSATION FUNCTIONS
// ============================================================================

// This place ensures that whenever a message is rendered, it gets structured like a proper bubble layout
function addMessageToChat(username, messageText) {

  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");

  // Clone our updated template blueprint structure
  const messageClone = template.content.cloneNode(true);

  // Target our precise elements using the class selectors
  const rowDiv = messageClone.querySelector(".message-row");
  const nameSpan = messageClone.querySelector(".sender-name");
  const textParagraph = messageClone.querySelector(".message-text");

  // Fill in the details
  nameSpan.textContent = username;
  textParagraph.textContent = messageText;

  // Decide if this is a message sent by you or someone else to assign bubble styling
  if (username.toLowerCase() === "you") {
    rowDiv.classList.add("sent");
  } else {
    rowDiv.classList.add("received");
  }

  // Clear out the startup "Welcome" layout banner if this is the first message
  if (conversationBox.querySelector('h2')) {
    conversationBox.replaceChildren();
  }

  // Inject the message directly into the feed container!
  conversationBox.appendChild(messageClone);

  // Keep the viewport locked to the bottom scroll position
  conversationBox.scrollTop = conversationBox.scrollHeight;
}

// ============================================================================
// EVENT LISTENERS & INITIATIONS
// ============================================================================

// Grab the text entry box and the form from our HTML structure
const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");

// A handy timer variable to track when the user stops typing
let typingTimeout;

// This place ensures we notice every single keystroke when YOU type a message
messageInput.addEventListener("input", () => {

  // 1. This is where you notify your chat server that YOU are actively typing!
  // Example: socket.emit("client-is-typing");
  console.log("You are typing...");

  // 2. Clear any old countdown timer currently running
  clearTimeout(typingTimeout);

  // 3. Start a fresh countdown! If you don't press a key for 1.5 seconds,
  // this place ensures we assume you have paused or finished.
  typingTimeout = setTimeout(() => {
    // Example: socket.emit("client-stopped-typing");
    console.log("You stopped typing.");
  }, 1500);
});

// This place handles form submission cleanly without loading a whole new webpage
chatForm.addEventListener("submit", (event) => {
  // CRITICAL: Stops the browser from submitting the form data to a new blank window/reloading!
  event.preventDefault();

  const messageText = messageInput.value.trim();

  if (messageText !== "") {
    // Send it to the chat screen instantly as a formatted bubble
    addMessageToChat("You", messageText);

    // Clear out the text area so it's fresh for your next entry
    messageInput.value = "";

    // Reset our typing indicator tracker values
    clearTimeout(typingTimeout);
  }
});

// ----------------------------------------------------------------------------
// Test run to see our gorgeous new UI list design in action upon load!
// ----------------------------------------------------------------------------
updateUserList(["Alice Johnson", "Robert Fox", "Cameron Williamson", "Devon Lane"]);