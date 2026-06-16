// ============================================================================
// LIVE WEB_SOCKET CONNECTION & CONFIGURATION
// ============================================================================

// 1. Prompt the user for a username immediately upon landing
const myUsername = prompt("Enter your username for Hi Chat:") || "User_" + Math.floor(Math.random() * 1000);

// 2. Connect to your FastAPI Python endpoint passing the username as a query param
const socket = new WebSocket(`ws://localhost:8080/start_web_socket?username=${encodeURIComponent(myUsername)}`);

// 3. Listen for incoming live events from your ChatServer.py
socket.onmessage = function(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.event === "update-users") {
      // Feed the real array of connected users into your list-builder function
      updateUserList(data.usernames);
    }
    else if (data.event === "send-message") {
      // Display the real message. Check if sender matches current user.
      const senderDisplay = (data.username === myUsername) ? "You" : data.username;
      addMessageToChat(senderDisplay, data.message);
    }
  } catch (err) {
    console.error("Error parsing incoming socket JSON payload:", err);
  }
};

socket.onclose = function(event) {
  console.log("Disconnected from server. Reason:", event.reason);
  showUserIsTyping("SYSTEM: Server connection lost");
};

// ============================================================================
// ONLINE USERS FUNCTIONS
// ============================================================================

// Updates the list of online users with status indicators and clean circular profile avatars
function updateUserList(usernames) {
  const userList = document.getElementById("users");
  if (!userList) return;

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
    // Show a marker if the list item is the active client
    nameSpan.textContent = (username === myUsername) ? `${username} (You)` : username;
    nameSpan.style.flex = "1";

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

function showUserIsTyping(username) {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.textContent = `${username} is typing...`;
  }
}

function clearTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.textContent = "";
  }
}

// ============================================================================
// CHAT CONVERSATION FUNCTIONS
// ============================================================================

function addMessageToChat(username, messageText) {
  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");
  if (!conversationBox || !template) return;

  const messageClone = template.content.cloneNode(true);
  const rowDiv = messageClone.querySelector(".message-row");
  const nameSpan = messageClone.querySelector(".sender-name");
  const textParagraph = messageClone.querySelector(".message-text");

  nameSpan.textContent = username;
  textParagraph.textContent = messageText;

  // Assign bubble styling based on identity
  if (username === "You") {
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
// EVENT LISTENERS & FORM TRANSMISSION
// ============================================================================

const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");
let typingTimeout;

messageInput.addEventListener("input", () => {
  console.log("You are typing...");
  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    console.log("You stopped typing.");
  }, 1500);
});

// Sends the real content up to the Python Server via WebSockets
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  // Ensure message isn't blank and socket is open
  if (messageText !== "" && socket.readyState === WebSocket.OPEN) {

    // Construct the explicit JSON structure ChatServer.py requires
    const payload = {
      event: "send-message",
      message: messageText
    };

    // Ship it to the server!
    socket.send(JSON.stringify(payload));

    // Reset our text input UI field
    messageInput.value = "";
    clearTimeout(typingTimeout);
  }
});