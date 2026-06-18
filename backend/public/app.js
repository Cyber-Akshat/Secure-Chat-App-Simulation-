function sanitizeUsername(raw) {
  if (!raw) return "";
  const noTags = raw.replace(/<[^>]*>/g, "");
  return noTags.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 30);
}

// ============================================================================
// 🔐 SESSION CHECKING
// ============================================================================
const storedUsername = sessionStorage.getItem("hichat_username") || localStorage.getItem("hichat_username");

if (!storedUsername) {
  window.location.href = "login.html";
  throw new Error("No active credentials found — routing to authentication page.");
}

const myUsername = sanitizeUsername(storedUsername);

document.getElementById("logout-btn")?.addEventListener("click", () => {
  sessionStorage.removeItem("hichat_username");
  localStorage.removeItem("hichat_username");
  window.location.href = "login.html";
});

// ============================================================================
// 🔒 END-TO-END ENCRYPTION (AES-GCM ENGINE)
// ============================================================================
const ENCRYPTION_PASSPHRASE = "SuperSecretChatRoomKey123!";

async function getEncryptionKey() {
  const enc = new TextEncoder();
  const hashedKeyMaterial = await window.crypto.subtle.digest("SHA-256", enc.encode(ENCRYPTION_PASSPHRASE));
  return await window.crypto.subtle.importKey(
    "raw", hashedKeyMaterial, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
  );
}

async function encryptText(plainText) {
  if (!plainText) return "";
  try {
    const key = await getEncryptionKey();
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(plainText));
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    return `${ivBase64}:${dataBase64}`;
  } catch (err) {
    return "[Encryption Failed]";
  }
}

async function decryptText(encryptedPayload) {
  if (!encryptedPayload || !encryptedPayload.includes(":")) return encryptedPayload;
  try {
    const key = await getEncryptionKey();
    const [ivBase64, dataBase64] = encryptedPayload.split(":");
    const iv = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
    const encryptedData = new Uint8Array(atob(dataBase64).split("").map(c => c.charCodeAt(0)));
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedData);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    return "[Encrypted Message]";
  }
}

// ============================================================================
// 📡 WEB_SOCKET COMMUNICATIONS HANDLER
// ============================================================================
const socket = new WebSocket(`ws://${window.location.host}/start_web_socket?username=${encodeURIComponent(myUsername)}`);

socket.onmessage = async function(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.event === "update-users") {
      updateUserList(data.usernames);
    }
    // Live Incoming Message Handler
    else if (data.event === "send-message") {
      const senderDisplay = (data.username === myUsername) ? "You" : data.username;
      const clearTextMessage = await decryptText(data.message);
      addMessageToChat(data.id, senderDisplay, clearTextMessage, data.gifUrl);
    }
    // 📜 Incoming Chat History Batch Handler
    else if (data.event === "chat-history") {
      const conversationBox = document.getElementById("conversation");
      if (data.messages.length > 0) {
        conversationBox.replaceChildren(); // clear splash info text
        for (const msg of data.messages) {
          const senderDisplay = (msg.sender === myUsername) ? "You" : msg.sender;
          const clearTextMessage = await decryptText(msg.encrypted_message);
          addMessageToChat(msg.id, senderDisplay, clearTextMessage, msg.gif_url);
        }
      }
    }
    // 🛡️ Catches the 10-second spam error from Patric's server smoothly
    else if (data.event === "error") {
      const systemId = "sys-" + Date.now();
      addMessageToChat(systemId, "System Guard", data.message, null);
      return;
    }
    // 🗑️ Live Message Deletion Event Handler
    else if (data.event === "delete-message") {
      const targetBubble = document.querySelector(`[data-msg-id="${data.id}"]`);
      if (targetBubble) {
        targetBubble.remove();
      }
    }
    // 🧹 GLOBAL PURGE INTERCEPTION: Listens for the backend confirmation broadcast
    else if (data.event === "clear-all-messages") {
      const conversationBox = document.getElementById("conversation");
      if (conversationBox) {
        conversationBox.replaceChildren(); // Empties the chat container clean for everyone online!
      }
    }
  } catch (err) {
    console.error("Inbound routing parsing layout error:", err);
  }
};

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

function addMessageToChat(msgId, username, messageText, gifUrl = null) {
  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");
  if (!conversationBox || !template) return;

  const messageClone = template.content.cloneNode(true);
  const rowDiv = messageClone.querySelector(".message-row");
  const nameSpan = messageClone.querySelector(".sender-name");
  const textParagraph = messageClone.querySelector(".message-text");
  const gifImage = messageClone.querySelector(".message-gif");
  const deleteBtn = messageClone.querySelector(".delete-btn");

  rowDiv.setAttribute("data-msg-id", msgId);
  nameSpan.textContent = username;

  if (gifUrl) {
    gifImage.src = gifUrl;
    gifImage.style.display = "block";
    textParagraph.style.display = messageText ? "block" : "none";
  }

  textParagraph.textContent = messageText || "";

  if (username === "You") {
    rowDiv.classList.add("sent");
    if (deleteBtn) {
      deleteBtn.style.display = "inline-block";
      deleteBtn.addEventListener("click", () => {
        if (confirm("Are you sure you want to delete this message?")) {
          socket.send(JSON.stringify({
            event: "delete-message",
            id: msgId
          }));
        }
      });
    }
  } else {
    rowDiv.classList.add("received");
    if (deleteBtn) deleteBtn.remove();
  }

  // Clear onboarding splash headers if an actual conversation begins
  if (conversationBox.querySelector('.welcome-placeholder')) {
    conversationBox.replaceChildren();
  }

  conversationBox.appendChild(messageClone);
  conversationBox.scrollTop = conversationBox.scrollHeight;
}

// ============================================================================
// 🧹 GLOBAL SYNC CLEAR CHAT ENGINE
// ============================================================================
// FIXED: Changed ID to "clear-btn" to link up with your HTML exactly
document.getElementById("clear-btn")?.addEventListener("click", () => {
  if (confirm("Are you sure you want to completely wipe the conversation history for everyone?")) {
    if (socket.readyState === WebSocket.OPEN) {
      // Dispatches request directly up the WebSocket pipeline to Case C in Python
      socket.send(JSON.stringify({ event: "clear-chat" }));
    }
  }
});

// ============================================================================
// GIF DRAWER MANAGEMENT
// ============================================================================
const gifToggleBtn = document.getElementById("gif-toggle-btn");
const gifDrawer = document.getElementById("gif-drawer");
const closeGifBtn = document.getElementById("close-gif-btn");
const gifGrid = document.getElementById("gif-grid");

if (gifToggleBtn && gifDrawer) {
  gifToggleBtn.addEventListener("click", () => {
    if (gifDrawer.style.display === "none" || !gifDrawer.style.display) {
      gifDrawer.style.display = "flex";
      loadOpenAccessGifs();
    } else {
      gifDrawer.style.display = "none";
    }
  });
}

if (closeGifBtn && gifDrawer) {
  closeGifBtn.addEventListener("click", () => {
    gifDrawer.style.display = "none";
  });
}

function loadOpenAccessGifs() {
  if (!gifGrid) return;
  gifGrid.replaceChildren();

  const stableOpenUrls = [
    "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXdxYW0zMnBiejAwamQ4M2xneHcybzk5b3IxbG5odnNva2xzYjI4cCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XMMUWcz4XtDTNgZj22/giphy.gif",
    "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExODJpZHhkaWJ1cGtoNTR3dDV2a3I3dnI3YmczOXRpZm5tOGtza3QzZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OuQmhmAAdJFLi/giphy.gif",
    "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTRxY240YTVqZWRnajdrMnlpczA2anc3NHF5NWlza29laGlmOHFraiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yWku98eNsMSZOEEWnC/giphy.gif"
  ];

  stableOpenUrls.forEach(url => {
    const img = document.createElement("img");
    img.src = url;
    img.style.width = "100%";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "4px";
    img.style.cursor = "pointer";

    img.addEventListener("click", async () => {
      if (socket.readyState === WebSocket.OPEN) {
        // Pass an explicitly encrypted placeholder space instead of raw text
        const blankEncrypted = await encryptText(" ");
        socket.send(JSON.stringify({
          event: "send-message",
          message: blankEncrypted,
          gifUrl: url
        }));
        gifDrawer.style.display = "none";
      }
    });
    gifGrid.appendChild(img);
  });
}

// ============================================================================
// CHAT FORM SUBMISSION
// ============================================================================
const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (messageText !== "" && socket.readyState === WebSocket.OPEN) {
    try {
      const encryptedPayload = await encryptText(messageText);
      if (!encryptedPayload) return;

      socket.send(JSON.stringify({
        event: "send-message",
        message: encryptedPayload,
        gifUrl: null
      }));
      messageInput.value = "";
    } catch (err) {
      console.error("Critical error during transmission submission loop:", err);
    }
  }
});