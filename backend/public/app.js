// ============================================================================
// ONLINE USERS FUNCTIONS
// ============================================================================

// Updates the list of online users with status indicators and clean circular profile avatars
function updateUserList(usernames) {
  const userList = document.getElementById("users");

  // Remove old nodes before rebuilding
  userList.replaceChildren();

  for (const username of usernames) {
    const listItem = document.createElement("li");
    listItem.style.display = "flex";
    listItem.style.alignItems = "center";
    listItem.style.width = "100%";

    // 1. Generate a circular avatar using the user's initials
    const avatarImg = document.createElement("img");
    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff&rounded=true&size=32`;
    avatarImg.alt = `${username}'s avatar`;
    avatarImg.style.width = "32px";
    avatarImg.style.height = "32px";
    avatarImg.style.marginRight = "12px";
    avatarImg.style.display = "block";

    // 2. Setup text name layout
    const nameSpan = document.createElement("span");
    nameSpan.textContent = username;
    nameSpan.style.flex = "1"; // Automatically pushes the green status dot to the right margin

    // 3. Status indicator dot node
    const statusDot = document.createElement("span");
    statusDot.style.width = "8px";
    statusDot.style.height = "8px";
    statusDot.style.backgroundColor = "#10b981"; // Emerald Green
    statusDot.style.borderRadius = "50%";
    statusDot.style.display = "inline-block";

    listItem.setAttribute("title", `${username} is connected and active.`);

    // Attach elements to list container
    listItem.appendChild(avatarImg);
    listItem.appendChild(nameSpan);
    listItem.appendChild(statusDot);
    userList.appendChild(listItem);
  }
}

// ============================================================================
// TYPING INDICATOR FUNCTIONS
// ============================================================================

// This place ensures we show a friendly message when another user is typing!
function showUserIsTyping(username) {
  const typingIndicator = document.getElementById("typing-indicator");
  typingIndicator.textContent = `${username} is typing...`;
}

// This place ensures the text clears out and goes invisible when they stop typing
function clearTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  typingIndicator.textContent = "";
}

// ============================================================================
// CHAT CONVERSATION FUNCTIONS
// ============================================================================

// This place ensures that whenever a message is rendered, it gets structured like a proper bubble layout
function addMessageToChat(username, messageText) {
  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");
  const messageClone = template.content.cloneNode(true);

  const rowDiv = messageClone.querySelector(".message-row");
  const nameSpan = messageClone.querySelector(".sender-name");
  const textParagraph = messageClone.querySelector(".message-text");

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

  conversationBox.appendChild(messageClone);
  conversationBox.scrollTop = conversationBox.scrollHeight;
}

// ============================================================================
// EVENT LISTENERS & INITIATIONS
// ============================================================================

// Grab the text entry box and the form from our HTML structure
const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");
let typingTimeout;

// This place ensures we notice every single keystroke when YOU type a message
messageInput.addEventListener("input", () => {
  console.log("You are typing...");
  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    console.log("You stopped typing.");
  }, 1500);
});

// This place handles form submission cleanly and triggers a simulated friend reply
chatForm.addEventListener("submit", (event) => {
  // CRITICAL: Stops the browser from submitting the form data to a new blank window/reloading!
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (messageText !== "") {
    // 1. Send your message to the screen instantly
    addMessageToChat("You", messageText);
    messageInput.value = "";
    clearTimeout(typingTimeout);

    // 2. Choose a random friend from your list to reply
    const friends = ["Alice Johnson", "Robert Fox", "Cameron Williamson", "Devon Lane"];
    const randomFriend = friends[Math.floor(Math.random() * friends.length)];

    // 3. After 1 second, show that your friend is typing...
    setTimeout(() => {
      showUserIsTyping(randomFriend);

      // 4. After 2 more seconds of typing, clear the indicator and drop their reply!
      setTimeout(() => {
        clearTypingIndicator();

        // A list of fun responses they can give back
        const replies = [
          "Wow, that sounds amazing!",
          "Haha totally agree. What are you up to today?",
          "Awesome! Let me check on that and get back to you.",
          "Nice! Did you see the new dashboard updates? Looks super clean.",
          "I'm working on the backend code right now! 🚀"
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];

        // Add their message as a received (left-aligned) bubble
        addMessageToChat(randomFriend, randomReply);
      }, 2000);

    }, 1000);
  }
});

// ----------------------------------------------------------------------------
// Test run to see our gorgeous new UI list design in action upon load!
// ----------------------------------------------------------------------------
updateUserList(["Alice Johnson", "Robert Fox", "Cameron Williamson", "Devon Lane"]);