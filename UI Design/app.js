// ============================================================================
// ONLINE USERS FUNCTIONS
// ============================================================================

// Updates the list of online users displayed in the sidebar
function updateUserList(usernames) {

  // Get the <ul> element that contains the user list
  const userList = document.getElementById("users");

  // Remove all existing user entries before rebuilding the list
  userList.replaceChildren();

  // Loop through each username received from the server
  for (const username of usernames) {

    // Create a new <li> element for this user
    const listItem = document.createElement("li");

    // Set the visible text of the list item to the username
    listItem.textContent = username;

    // Add a tooltip that appears when the user hovers over the username
    // Example: "Alice is connected and active in this server."
    listItem.setAttribute(
      "title",
      `${username} is connected and active in this server.`
    );

    // Add the completed list item to the online users list
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
// EVENT LISTENERS (Capturing User Actions)
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
  // this place ensures we tell the server you have stopped typing.
  typingTimeout = setTimeout(() => {
    // Example: socket.emit("client-stopped-typing");
    console.log("You stopped typing.");
  }, 1500);
});

// This place ensures that when you actually hit "Send", the typing indicator resets instantly
chatForm.addEventListener("submit", (event) => {
  // Prevents the webpage from doing a full refresh on submit
  event.preventDefault();

  // Clear the timeout tracking since the message is officially sent
  clearTimeout(typingTimeout);

  // Reset your input field or tell the server you are done typing
  // Example: socket.emit("client-stopped-typing");
});