// ============================================================================
// LIVE WEB_SOCKET CONNECTION & CONFIGURATION
// ============================================================================

function sanitizeUsername(raw) {
  const noTags = raw.replace(/<[^>]*>/g, "");
  return noTags.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 30);
}

const rawInput = prompt("Enter your username for Hi Chat:") ?? "";
const myUsername = sanitizeUsername(rawInput) || "User_" + Math.floor(Math.random() * 1000);

const socket = new WebSocket(`ws://localhost:8080/start_web_socket?username=${encodeURIComponent(myUsername)}`);

socket.onmessage = function(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.event === "update-users") {
      updateUserList(data.usernames);
    }
    else if (data.event === "send-message") {
      const senderDisplay = (data.username === myUsername) ? "You" : data.username;
      addMessageToChat(senderDisplay, data.message, data.fileData, data.fileName, data.fileType);
    }
  } catch (err) {
    console.error("Error parsing incoming socket JSON payload:", err);
  }
};

socket.onclose = function(event) {
  console.log("Disconnected from server. Reason:", event.reason);
};

// ============================================================================
// ONLINE USERS FUNCTIONS
// ============================================================================

function updateUserList(usernames) {
  const userList = document.getElementById("users");
  if (!userList) return;
  userList.replaceChildren();

  for (const username of usernames) {
    const listItem = document.createElement("li");
    listItem.style.display = "flex";
    listItem.style.alignItems = "center";
    listItem.style.width = "100%";

    const avatarImg = document.createElement("img");
    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff&rounded=true&size=32`;
    avatarImg.alt = `${username}'s avatar`;
    avatarImg.style.width = "32px";
    avatarImg.style.height = "32px";
    avatarImg.style.marginRight = "12px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = (username === myUsername) ? `${username} (You)` : username;
    nameSpan.style.flex = "1";

    const statusDot = document.createElement("span");
    statusDot.style.width = "8px";
    statusDot.style.height = "8px";
    statusDot.style.backgroundColor = "#10b981";
    statusDot.style.borderRadius = "50%";

    listItem.appendChild(avatarImg);
    listItem.appendChild(nameSpan);
    listItem.appendChild(statusDot);
    userList.appendChild(listItem);
  }
}

// ============================================================================
// CHAT CONVERSATION & FILE RENDERING FUNCTIONS
// ============================================================================

function addMessageToChat(username, messageText, fileData = null, fileName = null, fileType = null) {
  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");
  if (!conversationBox || !template) return;

  const messageClone = template.content.cloneNode(true);
  const rowDiv = messageClone.querySelector(".message-row");
  const nameSpan = messageClone.querySelector(".sender-name");
  const textParagraph = messageClone.querySelector(".message-text");

  const attachmentContainer = messageClone.querySelector(".file-attachment-container");
  const attachedImage = messageClone.querySelector(".attached-image");
  const attachedFileLink = messageClone.querySelector(".attached-file-link");

  nameSpan.textContent = username;
  textParagraph.textContent = messageText || "";
  if (!messageText) textParagraph.style.display = "none";

  // If file metrics exist, process them beautifully
  if (fileData) {
    attachmentContainer.style.display = "block";

    if (fileType && fileType.startsWith("image/")) {
      // It's an image file: preview it inline!
      attachedImage.src = fileData;
      attachedImage.style.display = "block";
    } else {
      // It's a standard document/file: provide a download link
      attachedFileLink.href = fileData;
      attachedFileLink.download = fileName || "downloaded-file";
      attachedFileLink.textContent = `📁 Download: ${fileName || "Attached File"}`;
      attachedFileLink.style.display = "block";
    }
  }

  if (username === "You") {
    rowDiv.classList.add("sent");
  } else {
    rowDiv.classList.add("received");
  }

  if (conversationBox.querySelector('h2')) {
    conversationBox.replaceChildren();
  }

  conversationBox.appendChild(messageClone);
  conversationBox.scrollTop = conversationBox.scrollHeight;
}

// ============================================================================
// ATTACHMENT LOGIC HOOKS
// ============================================================================
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");

attachBtn.addEventListener("click", () => {
  fileInput.click(); // Open system local file windows
});

fileInput.addEventListener("change", () => {
  const selectedFile = fileInput.files;
  if (!selectedFile) return;

  // Enforce a sensible size ceiling (e.g., 5MB max) to prevent websocket congestion
  if (selectedFile.size > 5 * 1024 * 1024) {
    alert("File is too large! Please choose a file smaller than 5MB.");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Data = e.target.result; // Raw encoded file data string

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        event: "send-message",
        message: `Sent an attachment: ${selectedFile.name}`,
        fileData: base64Data,
        fileName: selectedFile.name,
        fileType: selectedFile.type
      }));
    }
    fileInput.value = ""; // Clear file buffer selection slot
  };

  reader.readAsDataURL(selectedFile); // Convert the system data stream to base64
});

// ============================================================================
// FORM TEXT TRANSMISSION
// ============================================================================
const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (messageText !== "" && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      event: "send-message",
      message: messageText,
      fileData: null,
      fileName: null,
      fileType: null
    }));
    messageInput.value = "";
  }
});