function sanitizeUsername(raw) {
  const noTags = raw.replace(/<[^>]*>/g, "");
  return noTags.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 30);
}

const rawInput = prompt("Enter your username for Hi Chat:") ?? "";
const myUsername = sanitizeUsername(rawInput) || "User_" + Math.floor(Math.random() * 1000);

// ============================================================================
// 🔒 SECURE END-TO-END ENCRYPTION (AES-GCM BASE64 ENGINE)
// ============================================================================

// SECURITY FIX: In a real app, users would input this dynamically, not hardcoded!
const ENCRYPTION_PASSPHRASE = "SuperSecretChatRoomKey123!";

async function getEncryptionKey() {
  const enc = new TextEncoder();
  // We hash the password to ensure it is exactly 32 bytes long safely
  const hashedKeyMaterial = await window.crypto.subtle.digest("SHA-256", enc.encode(ENCRYPTION_PASSPHRASE));

  return await window.crypto.subtle.importKey(
    "raw",
    hashedKeyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypts plain text into a secure Base64 string
async function encryptText(plainText) {
  if (!plainText) return "";
  try {
    const key = await getEncryptionKey();
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Secure Initialization Vector

    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(plainText)
    );

    // FIX: Using standardized Base64 instead of unpredictable hex loops
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const dataBase64 = btoa(String.fromCharCode(...new Uint8Array(encrypted)));

    return `${ivBase64}:${dataBase64}`;
  } catch (err) {
    console.error("Encryption error:", err);
    return "[Encryption Failed]";
  }
}

// Decrypts incoming Base64 strings back into plain text
async function decryptText(encryptedPayload) {
  if (!encryptedPayload || !encryptedPayload.includes(":")) return encryptedPayload;
  try {
    const key = await getEncryptionKey();
    const [ivBase64, dataBase64] = encryptedPayload.split(":");

    // Decode Base64 back into raw byte numbers
    const iv = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
    const encryptedData = new Uint8Array(atob(dataBase64).split("").map(c => c.charCodeAt(0)));

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("Could not decrypt message (key mismatch or format error).");
    return "[Encrypted Message]";
  }
}

/**
 * Decrypts incoming payloads back into plain text or a clickable GIF URL link
 */
async function decryptText(encryptedPayload) {
  if (!encryptedPayload || !encryptedPayload.includes(":")) return encryptedPayload;
  try {
    const key = await getEncryptionKey();
    const [ivBase64, dataBase64] = encryptedPayload.split(":");

    const iv = new Uint8Array(atob(ivBase64).split("").map(c => c.charCodeAt(0)));
    const encryptedData = new Uint8Array(atob(dataBase64).split("").map(c => c.charCodeAt(0)));

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedData
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("Could not decrypt payload.");
    return "[Encrypted Message]";
  }
}

// ============================================================================
// WEB_SOCKET EVENT LOOPS
// ============================================================================
const socket = new WebSocket(`ws://localhost:8080/start_web_socket?username=${encodeURIComponent(myUsername)}`);

socket.onmessage = async function(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.event === "update-users") {
      updateUserList(data.usernames);
    }
    else if (data.event === "send-message") {
      const senderDisplay = (data.username === myUsername) ? "You" : data.username;

      // 🔓 Decrypt the text before putting it on the screen
      const clearTextMessage = await decryptText(data.message);
      addMessageToChat(senderDisplay, clearTextMessage, data.gifUrl);
    }
  } catch (err) {
    console.error("Error parsing incoming socket JSON payload:", err);
  }
};

socket.onclose = function(event) {
  console.log("Disconnected from server. Reason:", event.reason);
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

function addMessageToChat(username, messageText, gifUrl = null) {
  const conversationBox = document.getElementById("conversation");
  const template = document.getElementById("message");
  if (!conversationBox || !template) return;

  const messageClone = template.content.cloneNode(true);
  const rowDiv = messageClone.querySelector(".message-row");
  const nameSpan = messageClone.querySelector(".sender-name");
  const textParagraph = messageClone.querySelector(".message-text");
  const gifImage = messageClone.querySelector(".message-gif");

  nameSpan.textContent = username;

  if (gifUrl) {
    gifImage.src = gifUrl;
    gifImage.style.display = "block";
    textParagraph.style.display = messageText ? "block" : "none";
  }

  textParagraph.textContent = messageText || "";

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
// GIF DRAWER & EVENTS
// ============================================================================
const gifToggleBtn = document.getElementById("gif-toggle-btn");
const gifDrawer = document.getElementById("gif-drawer");
const closeGifBtn = document.getElementById("close-gif-btn");
const gifGrid = document.getElementById("gif-grid");

gifToggleBtn.addEventListener("click", () => {
  if (gifDrawer.style.display === "none") {
    gifDrawer.style.display = "flex";
    loadOpenAccessGifs();
  } else {
    gifDrawer.style.display = "none";
  }
});

closeGifBtn.addEventListener("click", () => {
  gifDrawer.style.display = "none";
});

function loadOpenAccessGifs() {
  gifGrid.replaceChildren();

  const stableOpenUrls = [
    "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXdxYW0zMnBiejAwamQ4M2xneHcybzk5b3IxbG5odnNva2xzYjI4cCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XMMUWcz4XtDTNgZj22/giphy.gif",
    "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExODJpZHhkaWJ1cGtoNTR3dDV2a3I3dnI3YmczOXRpZm5tOGtza3QzZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OuQmhmAAdJFLi/giphy.gif",
    "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTRxY240YTVqZWRnajdrMnlpczA2anc3NHF5NWlza29laGlmOHFraiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yWku98eNsMSZOEEWnC/giphy.gif",
    "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExa284amJpOTY2cGtqdG96MWpyb3Ntc2t4bWVzMWhsaHg3dDhjZ3FuOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/AVP0kPZXRUxjRxCfng/giphy.gif",
    "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHZ3ZnZtcnlmN3ViYXphbmRnY2dsZ3JiNTRjdDliNHUwdTFsZ2MwbCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zrxazUScjhxo4/giphy.gif",
    "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExN3dxZXkxYXFjOWQ4dG54cG5ldW00NTZ3YTQyMHlhcDExa2N6M3V4eSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/pj6kX3c8bRijBrl6yR/giphy.gif",
    "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWtkZXV6NTg4aGZubDlwdTJlOHVibjVtaWFmYm1oMHZjY3ZkMWhuZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Irb20yXtA2QStkUnrE/giphy.gif",
    "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExNTJjdW5vbDJmeThvMDRldzJjNGJma2pvOXlsczBqMzRnMTZsNnVoMyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/kMZJErKgZtONJZOQE6/giphy.gif",
    "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3Nzd3azA1NDB3YjhiMzlndWZtNGN6MTllem0xMmI1Z25za3dwZGx0aSZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/acgXBmnZjOS0lYImih/giphy.gif",
    "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExN3E1YjUyaHU1b3AwOHdlcnBlamVqOHlzMmNod3V5eWV2ZnV0MmtkZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/kNpNw0eB1w4qDYA7hS/giphy.gif",
    "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2RiNmtrc254OGUyNHVtcHBoNWVscWh2ZzBodmJ3ZmRiYmQzMGptZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/45Ichy6GhmxZSdgxzC/giphy.gif"
  ]; //gifs

  stableOpenUrls.forEach(url => {
    const img = document.createElement("img");
    img.src = url;
    img.style.width = "100%";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "4px";
    img.style.cursor = "pointer";

    img.addEventListener("click", () => {
      sendGifMessage(url);
      gifDrawer.style.display = "none";
    });
    gifGrid.appendChild(img);
  });
}

function sendGifMessage(url) {
  if (socket.readyState === WebSocket.OPEN) {
    const payload = {
      event: "send-message",
      message: "",
      gifUrl: url
    };
    socket.send(JSON.stringify(payload));
  }
}

// ============================================================================
// TRANSMISSION SUBMISSIONS (CORRECTED ASYNC PIPELINE)
// ============================================================================
const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (messageText !== "" && socket.readyState === WebSocket.OPEN) {
    try {
      // 1. Force execution to pause until encryption finishes scrambling the text
      const encryptedPayload = await encryptText(messageText);

      // Guard check to make sure encryption yielded valid data
      if (!encryptedPayload) {
        console.error("Encryption returned an empty string. Aborting send.");
        return;
      }

      // 2. Package the scrambled "ivHex:dataHex" payload string
      const payload = {
        event: "send-message",
        message: encryptedPayload,
        gifUrl: null
      };

      // 3. Dispatch data straight over WebSocket channel
      socket.send(JSON.stringify(payload));
      messageInput.value = "";

    } catch (err) {
      console.error("Critical error during execution submission flow:", err);
    }
  }
});

