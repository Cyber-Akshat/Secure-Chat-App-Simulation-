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
let activeRecipient = null; // 🎯 Tracks who we are privately messaging
let allChatLogs = [];       // 🗄️ Locally cached logs for smooth user switching

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
    // Live Incoming Private Message Interceptor
    else if (data.event === "send-message") {
      allChatLogs.push({
        id: data.id,
        sender: data.username,
        recipient: data.recipient,
        encrypted_message: data.message,
        gif_url: data.gifUrl
      });
      await renderConversation();
    }
    // 📜 Incoming Chat History Batch Handler
    else if (data.event === "chat-history") {
      allChatLogs = data.messages;
      await renderConversation();
    }
    // 🛡️ Error Catching (Spam Protection)
    else if (data.event === "error") {
      const systemId = "sys-" + Date.now();
      addMessageToChat(systemId, "System Guard", data.message, null);
      return;
    }
    // 🗑️ Live Message Deletion Event Handler
    else if (data.event === "delete-message") {
      allChatLogs = allChatLogs.filter(msg => msg.id !== data.id);
      await renderConversation();
    }
    // 🧹 GLOBAL PURGE INTERCEPTION
    else if (data.event === "clear-all-messages") {
      allChatLogs = [];
      await renderConversation();
    }
  } catch (err) {
    console.error("Inbound routing parsing layout error:", err);
  }
};

function updateUserList(usernames) {
  const userList = document.getElementById("users");
  if (!userList) return;
  userList.replaceChildren();

  // 1. First loop: Render all OTHER users (Make them clickable targets)
  for (const username of usernames) {
    if (username === myUsername) continue;

    const listItem = document.createElement("li");
    listItem.style.display = "flex";
    listItem.style.alignItems = "center";
    listItem.style.width = "100%";
    listItem.style.cursor = "pointer";
    listItem.style.padding = "8px";
    listItem.style.borderRadius = "6px";
    listItem.style.transition = "background 0.2s";

    if (activeRecipient === username) {
      listItem.style.backgroundColor = "#f0f2f5";
    }

    listItem.addEventListener("click", async () => {
      activeRecipient = username;
      updateUserList(usernames);
      await renderConversation();
    });

    const avatarImg = document.createElement("img");
    avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff&rounded=true&size=32`;
    avatarImg.style.width = "32px";
    avatarImg.style.height = "32px";
    avatarImg.style.marginRight = "12px";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = username;
    nameSpan.style.flex = "1";
    nameSpan.style.fontWeight = (activeRecipient === username) ? "700" : "500";

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

  // 2. Second phase: Append YOUR name safely at the bottom (Unclickable)
  if (usernames.includes(myUsername)) {
    const myItem = document.createElement("li");
    myItem.style.display = "flex";
    myItem.style.alignItems = "center";
    myItem.style.width = "100%";
    myItem.style.padding = "8px";
    myItem.style.borderRadius = "6px";
    myItem.style.opacity = "0.85"; // Gives a slight visual distinction

    const myAvatar = document.createElement("img");
    myAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(myUsername)}&background=9333ea&color=fff&rounded=true&size=32`;
    myAvatar.style.width = "32px";
    myAvatar.style.height = "32px";
    myAvatar.style.marginRight = "12px";

    const myNameSpan = document.createElement("span");
    myNameSpan.textContent = `${myUsername} (You)`;
    myNameSpan.style.flex = "1";
    myNameSpan.style.fontWeight = "500";

    const myStatusDot = document.createElement("span");
    myStatusDot.style.width = "8px";
    myStatusDot.style.height = "8px";
    myStatusDot.style.backgroundColor = "#10b981";
    myStatusDot.style.borderRadius = "50%";

    myItem.appendChild(myAvatar);
    myItem.appendChild(myNameSpan);
    myItem.appendChild(myStatusDot);
    userList.appendChild(myItem);
  }
}

// 🛡️ Filters data logs dynamically so only the sender and target recipient see the text
async function renderConversation() {
  const conversationBox = document.getElementById("conversation");
  if (!conversationBox) return;
  conversationBox.replaceChildren();

  // If no user clicked yet, fall back to showing your splash screen logo loop
  if (!activeRecipient) {
    const welcomeDiv = document.createElement("div");
    welcomeDiv.className = "welcome-placeholder";
    welcomeDiv.style.textAlign = "center";
    welcomeDiv.style.marginTop = "20px";
    welcomeDiv.innerHTML = `
      <h2 style="color: #333d47; margin-bottom: 8px;"><img src="C-removebg-preview.png" height="500" width="auto"></h2>
      <p style="color: #8c96a3; font-size: 0.95rem;">Select an online user from the sidebar to chat privately.</p>
    `;
    conversationBox.appendChild(welcomeDiv);
    return;
  }

  // Filter conditions: (Me -> Them) OR (Them -> Me)
  const privateThread = allChatLogs.filter(msg =>
    (msg.sender === myUsername && msg.recipient === activeRecipient) ||
    (msg.sender === activeRecipient && msg.recipient === myUsername)
  );

  for (const msg of privateThread) {
    const senderDisplay = (msg.sender === myUsername) ? "You" : msg.sender;
    const clearTextMessage = await decryptText(msg.encrypted_message);
    addMessageToChat(msg.id, senderDisplay, clearTextMessage, msg.gif_url);
  }
}

function addMessageToChat(msgId, username, messageText, gifUrl = null) {
  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");
  if (!conversationBox || !template) return;

  if (conversationBox.querySelector('.welcome-placeholder')) {
    conversationBox.replaceChildren();
  }

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

  conversationBox.appendChild(messageClone);
  conversationBox.scrollTop = conversationBox.scrollHeight;
}

// ============================================================================
// 🧹 LOCAL CLEAR CHAT ENGINE
// ============================================================================
document.getElementById("clear-btn")?.addEventListener("click", () => {
  if (!activeRecipient) {
    alert("Please select a user from the sidebar whose chat you want to clear.");
    return;
  }

  if (confirm(`Are you sure you want to clear your conversation history with ${activeRecipient}? This will only clear it on your screen.`)) {
    // Filter out and remove only the messages between you and the active recipient locally
    allChatLogs = allChatLogs.filter(msg =>
      !((msg.sender === myUsername && msg.recipient === activeRecipient) ||
        (msg.sender === activeRecipient && msg.recipient === myUsername))
    );

    // Re-render the conversation area to reflect your cleared screen instantly
    renderConversation();
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
      if (!activeRecipient) {
        alert("Please select an online user from the sidebar before sending a GIF.");
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        const blankEncrypted = await encryptText(" ");
        socket.send(JSON.stringify({
          event: "send-message",
          recipient: activeRecipient,
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

  if (!activeRecipient) {
    alert("Please click on an online user from the sidebar to text them directly.");
    return;
  }

  if (messageText !== "" && socket.readyState === WebSocket.OPEN) {
    try {
      const encryptedPayload = await encryptText(messageText);
      if (!encryptedPayload) return;

      socket.send(JSON.stringify({
        event: "send-message",
        recipient: activeRecipient,
        message: encryptedPayload,
        gifUrl: null
      }));
      messageInput.value = "";
    } catch (err) {
      console.error("Critical error during transmission submission loop:", err);
    }
  }
});