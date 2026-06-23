// ============================================================================
// CLEAN STRUCTURAL UTILITIES
// ============================================================================
function sanitizeUsername(raw) {
  if (!raw) return "";
  const noTags = raw.replace(/<[^>]*>/g, "");
  return noTags.replace(/[^a-zA-Z0-9_\-]/g, "").slice(0, 30);
}

// ============================================================================
// LIGHT MODE / DARK MODE LOCAL LIFECYCLE
// ============================================================================
const themeSwitch = document.getElementById('theme-switch');

if (localStorage.getItem('darkmode') === 'active') {
  document.body.classList.add('darkmode');
}

themeSwitch?.addEventListener("click", () => {
  const isDarkNow = document.body.classList.toggle('darkmode');
  localStorage.setItem('darkmode', isDarkNow ? 'active' : 'inactive');
});

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
let unreadCounts = {};      // 🛑 Tracks unread message tallies per user handle

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

function refreshUserListUI() {
  const onlineUsers = Array.from(document.querySelectorAll("#users li span[data-username]")).map(el => el.getAttribute("data-username"));
  const combinedUsernames = onlineUsers.length ? onlineUsers : Object.keys(unreadCounts).concat([myUsername]);
  updateUserList(combinedUsernames);
}

socket.onmessage = async function(event) {
  try {
    const data = JSON.parse(event.data);

    if (data.event === "update-users") {
      updateUserList(data.usernames);
    }
    // ============================================================================
    // 🛑 USER INTERFACE: BACKGROUND UNREAD MESSAGE COUNTER (INBOUND INCOMING ALERT)
    // ============================================================================
    else if (data.event === "send-message") {
      // 1. SAVE TO HISTORY: The app always takes the incoming message and adds it to the chat history log.
      allChatLogs.push({
        id: data.id,
        sender: data.username,
        recipient: data.recipient,
        encrypted_message: data.message,
        gif_url: data.gifUrl,
        is_deleted: data.is_deleted || false,
        timestamp: data.timestamp || (Date.now() / 1000) // Fallback to current local time
      });

      // 2. ALERT CHECK: The app checks if someone is texting you while you are looking away.
      if (data.recipient === myUsername && data.username !== myUsername && data.username !== activeRecipient) {
        // 3. ADD TO TALLY: It adds +1 to the unread message counter for that specific sender.
        unreadCounts[data.username] = (unreadCounts[data.username] || 0) + 1;
        // 4. SHOW RED BADGE: It refreshes your sidebar, turning on a bright red notification bubble.
        refreshUserListUI();
      }
      // 5. UPDATE SCREEN: Keeps your current active chat conversation updated in real time.
      await renderConversation();
    }
    else if (data.event === "chat-history") {
      allChatLogs = data.messages;
      await renderConversation();
    }
    else if (data.event === "error") {
      const systemId = "sys-" + Date.now();
      addMessageToChat(systemId, "System Guard", data.message, null);
      return;
    }
    else if (data.event === "delete-message") {
      const targetMsg = allChatLogs.find(msg => msg.id === data.id);
      if (targetMsg) {
        targetMsg.is_deleted = true;
        targetMsg.encrypted_message = "";
        targetMsg.gif_url = null;
      }
      await renderConversation();
    }
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

  for (const username of usernames) {
    if (username === myUsername) continue;

    if (unreadCounts[username] === undefined) {
      unreadCounts[username] = 0; //sets the unread counts of the user to 0
    }

    const listItem = document.createElement("li");
    if (activeRecipient === username) {
      listItem.style.backgroundColor = "rgba(128, 128, 128, 0.15)";
    }

    // ============================================================================
    // 🛑 USER ACTION: SWITCHING CHATS AND CLEARING NOTIFICATION BADGES
    // ============================================================================
    listItem.addEventListener("click", async () => {
      activeRecipient = username;
      unreadCounts[username] = 0;
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
    nameSpan.setAttribute("data-username", username);
    nameSpan.style.fontWeight = (activeRecipient === username) ? "700" : "500";

    const badgeWrapper = document.createElement("div");
    badgeWrapper.style.display = "flex";
    badgeWrapper.style.alignItems = "center";
    badgeWrapper.style.gap = "8px";

    if (unreadCounts[username] > 0) {
      const unreadBadge = document.createElement("span");
      unreadBadge.textContent = unreadCounts[username];
      unreadBadge.style.backgroundColor = "#ef4444";
      unreadBadge.style.color = "#ffffff";
      unreadBadge.style.fontSize = "0.75rem";
      unreadBadge.style.fontWeight = "bold";
      unreadBadge.style.padding = "2px 6px";
      unreadBadge.style.borderRadius = "10px";
      unreadBadge.style.lineHeight = "1";
      badgeWrapper.appendChild(unreadBadge);
    }

    const statusDot = document.createElement("span");
    statusDot.style.width = "8px";
    statusDot.style.height = "8px";
    statusDot.style.backgroundColor = "#10b981";
    statusDot.style.borderRadius = "50%";
    badgeWrapper.appendChild(statusDot);

    listItem.appendChild(avatarImg);
    listItem.appendChild(nameSpan);
    listItem.appendChild(badgeWrapper);
    userList.appendChild(listItem);
  }

  if (usernames.includes(myUsername)) {
    const myItem = document.createElement("li");
    myItem.style.opacity = "0.85";
    myItem.style.cursor = "default";

    const myAvatar = document.createElement("img");
    myAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(myUsername)}&background=9333ea&color=fff&rounded=true&size=32`;
    myAvatar.style.width = "32px";
    myAvatar.style.height = "32px";
    myAvatar.style.marginRight = "12px";

    const myNameSpan = document.createElement("span");
    myNameSpan.textContent = `${myUsername} (You)`;
    myNameSpan.setAttribute("data-username", myUsername);

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

async function renderConversation() {
  const conversationBox = document.getElementById("conversation");
  if (!conversationBox) return;
  conversationBox.replaceChildren();

  if (!activeRecipient) {
    const welcomeDiv = document.createElement("div");
    welcomeDiv.className = "welcome-placeholder";
    welcomeDiv.style.textAlign = "center";
    welcomeDiv.style.marginTop = "20px";
    welcomeDiv.innerHTML = `
      <h2> 
        <img src="C-removebg-preview.png" height="400" width="auto">
      </h2>
      <p style="color: var(--text-muted); font-size: 0.95rem;">Select an online user from the sidebar to chat privately.</p>
    `;
    conversationBox.appendChild(welcomeDiv);
    return;
  }

  const privateThread = allChatLogs.filter(msg =>
    (msg.sender === myUsername && msg.recipient === activeRecipient) ||
    (msg.sender === activeRecipient && msg.recipient === myUsername)
  );

  for (const msg of privateThread) {
    const senderDisplay = (msg.sender === myUsername) ? "You" : msg.sender;

    if (msg.is_deleted) {
      addMessageToChat(msg.id, senderDisplay, "This message has been deleted", null, true, msg.timestamp);
    } else {
      const clearTextMessage = await decryptText(msg.encrypted_message);
      addMessageToChat(msg.id, senderDisplay, clearTextMessage, msg.gif_url, false, msg.timestamp);
    }
  }
}

function addMessageToChat(msgId, username, messageText, gifUrl = null, isDeleted = false, timestamp = null) {
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

  if (gifUrl && !isDeleted) {
    gifImage.src = gifUrl;
    gifImage.style.display = "block";
    textParagraph.style.display = messageText ? "block" : "none";
  }

  textParagraph.textContent = messageText || "";

  if (isDeleted) {
    textParagraph.style.fontStyle = "italic";
    textParagraph.style.opacity = "0.7";
  }

  // ============================================================================
  // 🕒 TIMESTAMP INJECTION ENGINE
  // ============================================================================
  if (timestamp) {
    const timeContainer = document.createElement("span");
    timeContainer.className = "chat-timestamp";
    timeContainer.textContent = formatChatTimestamp(timestamp);

    timeContainer.style.display = "block";
    timeContainer.style.fontSize = "0.72rem";
    timeContainer.style.marginTop = "4px";
    timeContainer.style.opacity = "0.6";

    const bubbleContainer = messageClone.querySelector(".message-bubble") || rowDiv;
    bubbleContainer.appendChild(timeContainer);
  }

  // ============================================================================
  // 🗑️ USER ACTION: THREE-BUTTON DELETION INTERCEPTOR (PERMANENT / TEMPORARY / CANCEL)
  // ============================================================================
  // 1. IDENTITY CHECK: Ensures you can only delete your own messages.
  if (username === "You") {
    rowDiv.classList.add("sent");

    // 2. GUARD CLAUSE: Checks if the delete button exists and if the message is active.
    if (deleteBtn && !isDeleted) {
      // Unhide the main delete icon/button for your active message row.
      deleteBtn.style.display = "inline-block";

      // 3. ACTION MENU INJECTOR: Spawns three true interactive options on click.
      deleteBtn.addEventListener("click", () => {
        // Prevent duplicate menus from stacking up if clicked twice
        if (rowDiv.querySelector(".custom-delete-menu")) return;

        // Create a temporary layout container row
        const menuContainer = document.createElement("div");
        menuContainer.className = "custom-delete-menu";
        menuContainer.style.cssText = "display: flex; gap: 5px; margin-top: 5px; font-size: 12px;";

        // Button A: Delete Permanently
        const btnPermanent = document.createElement("button");
        btnPermanent.textContent = "🗑️ Permanently";
        btnPermanent.style.cssText = "background: #ff4d4d; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;";
        btnPermanent.addEventListener("click", () => {
          socket.send(JSON.stringify({ event: "delete-message", id: msgId, mode: "permanent" }));
          menuContainer.remove();
        });

        // Button B: Delete Temporarily
        const btnTemporary = document.createElement("button");
        btnTemporary.textContent = "⏱️ Temporarily";
        btnTemporary.style.cssText = "background: #ffcc00; color: black; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;";
        btnTemporary.addEventListener("click", () => {
          socket.send(JSON.stringify({ event: "delete-message", id: msgId, mode: "temporary" }));
          menuContainer.remove();
        });

        // Button C: Cancel
        const btnCancel = document.createElement("button");
        btnCancel.textContent = "❌ Cancel";
        btnCancel.style.cssText = "background: #ccc; color: black; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;";
        btnCancel.addEventListener("click", () => {
          menuContainer.remove(); // Safely closes the choices without actions
        });

        // Assemble the buttons into the card view container
        menuContainer.appendChild(btnPermanent);
        menuContainer.appendChild(btnTemporary);
        menuContainer.appendChild(btnCancel);

        // Inject the choice interface right inside the active message row block layout
        rowDiv.appendChild(menuContainer);
      });

    } else if (deleteBtn) {
      deleteBtn.remove();
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
    allChatLogs = allChatLogs.filter(msg =>
      !((msg.sender === myUsername && msg.recipient === activeRecipient) ||
        (msg.sender === activeRecipient && msg.recipient === myUsername))
    );
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
    "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTRxY240YTVqZWRnajdrMnlpczA2anc3NHF5NWlza29laGlmOHFraiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/yWku98eNsMSZOEEWnC/giphy.gif",
    "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzNlYWQzNWQ1MnVsZ2U1ZGk3aWk3am54OXFvcmR1dWx4c2h2cjZ1YSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xlGYf1RUbYYes/giphy.gif",
    "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExenVscGF2dWI5bmI4cGlrY3owMGVmYTdtMjY5cjlrem9rZ29yNnd0cSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Nwz6NZkToYC4M/giphy.gif",
    "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExaXM5ZDBuajhkNGJsdWk4ZDBjbHBsbXZnczlkcW5ydW0yNDk5aXhyMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XHeLeuirRbwptHhSWd/giphy.gif",
    "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMTRrZm02djJyamNycGpxNmhiemEwYjk3NWVjMHB1ZWFxbWwya3l4ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/pj6kX3c8bRijBrl6yR/giphy.gif",
    "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExbjhiaG9xMHoxemNweDRiOGN1NnZ4ZjR3ZmRwNnB1dnl4eDZpZ2h2biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zVN0OolkDHmbC/giphy.gif",
    "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExODBvZHlnMWJobGgyMmRmYml5bzhqNWxza3d1d2NuczdsMzhmeWhrdiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o72FfM5HJydzafgUE/giphy.gif",
    "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2Vocng2YnVkY2F1cm4wZHNnaW0zdTlzMXkwNThreWF2amExbmxmcCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/okfvUCpgArv3y/giphy.gif"
  ];

  stableOpenUrls.forEach(url => {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "GIF Alternative option";
    img.style.width = "100%";
    img.style.borderRadius = "4px";
    img.style.cursor = "pointer";

    img.addEventListener("click", async () => {
      if (!activeRecipient) {
        alert("Select an online user from the sidebar to send a GIF.");
        return;
      }

      socket.send(JSON.stringify({
        event: "send-message",
        recipient: activeRecipient,
        message: "",
        gifUrl: url
      }));
      gifDrawer.style.display = "none";
    });

    gifGrid.appendChild(img);
  });
}

// ============================================================================
// CHAT FORM INPUT SUBMIT ACTION
// ============================================================================
document.getElementById("form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("data");
  if (!input) return;
  const rawText = input.value.trim();

  if (!rawText) return;
  if (!activeRecipient) {
    alert("Please select a user from the sidebar to chat privately.");
    return;
  }

  try {
    const securePayload = await encryptText(rawText);
    socket.send(JSON.stringify({
      event: "send-message",
      recipient: activeRecipient,
      message: securePayload,
      gifUrl: null
    }));

    input.value = "";
    input.focus();
  } catch (err) {
    console.error("Critical error preparing outbound message transmission: ", err);
  }
});

// ============================================================================
// EMOJI PICKER
// ============================================================================
const EMOJI_CATEGORIES = {
  smileys:    ["😀","😁","😂","🤣","😊","😇","🙂","😉","😍","🥰","😘","😜","🤔","😐","😑","😶","🙄","😏","😒","😞","😔","😟","😕","🙁","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤯","😳","🥴","😵","🤐","😷","🤒","🤕"],
  gestures:   ["👋","🤚","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","🤲","🤝","🙏","💪","🦾","🫱","🫲","🫳","🫴","🫵"],
  hearts:     ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","❤️‍🔥","❤️‍🩹","🫀"],
  animals:    ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦗","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔"],
  food:       ["🍕","🍔","🌮","🌯","🥗","🍜","🍣","🍱","🍛","🍲","🥘","🍝","🍠","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🧃","🥤","🧋","☕","🍵","🧉","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾","🧊","🥄","🍴","🍽️"],
  activities: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥅","⛳","🎣","🤿","🎽","🎿","🛷","🥌","🎯","🪃","🏹","🎣","🤿","🎽","🎮","🕹️","🎲","🧩","🧸","♟️","🃏","🀄","🎴","🎭","🎨","🖼️","🎰","🎳"],
  symbols:    ["✅","❌","⭕","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔲","🔳","▪️","▫️","◾","◽","◼️","◻️","🔈","🔉","🔊","📢","📣","🔔","🔕","🎵","🎶","💯","🔥","✨","🌟","⭐","🌈","☀️","🌤️","⛅","🌧️","⛈️","🌩️","❄️","🌊","💧","🌸","🌺","🌻","🌹","🍀","🌿","🍃"],
};

let currentEmojiCategory = "smileys";

const emojiToggleBtn  = document.getElementById("emoji-toggle-btn");
const emojiDrawer     = document.getElementById("emoji-drawer");
const closeEmojiBtn   = document.getElementById("close-emoji-btn");
const emojiGrid       = document.getElementById("emoji-grid");
const messageInput    = document.getElementById("data");

function renderEmojiGrid(category) {
  if (!emojiGrid) return;
  emojiGrid.replaceChildren();

  // Highlight the active tab
  document.querySelectorAll(".emoji-tab-btn").forEach(btn => {
    btn.style.opacity    = btn.dataset.category === category ? "1" : "0.45";
    btn.style.transform  = btn.dataset.category === category ? "scale(1.2)" : "scale(1)";
  });

  EMOJI_CATEGORIES[category].forEach(emoji => {
    const btn = document.createElement("button");
    btn.type        = "button";
    btn.textContent = emoji;
    btn.title       = emoji;
    btn.style.cssText = "background:none;border:none;font-size:1.4rem;cursor:pointer;padding:4px;border-radius:6px;transition:background 0.15s;";
    btn.addEventListener("mouseenter", () => btn.style.background = "rgba(128,128,128,0.15)");
    btn.addEventListener("mouseleave", () => btn.style.background = "none");

    // Insert the emoji at the cursor position rather than always appending to the end
    btn.addEventListener("click", () => {
      const start = messageInput.selectionStart ?? messageInput.value.length;
      const end   = messageInput.selectionEnd   ?? messageInput.value.length;
      messageInput.value = messageInput.value.slice(0, start) + emoji + messageInput.value.slice(end);
      // Restore cursor position just after the inserted emoji
      const newCursor = start + emoji.length;
      messageInput.setSelectionRange(newCursor, newCursor);
      messageInput.focus();
    });

    emojiGrid.appendChild(btn);
  });
}

// Tab switching
document.querySelectorAll(".emoji-tab-btn").forEach(btn => {
  btn.style.cssText = "background:none;border:none;font-size:1.3rem;cursor:pointer;padding:4px 6px;border-radius:6px;transition:transform 0.15s,opacity 0.15s;";
  btn.addEventListener("click", () => {
    currentEmojiCategory = btn.dataset.category;
    renderEmojiGrid(currentEmojiCategory);
  });
});

// Toggle open/close
emojiToggleBtn?.addEventListener("click", () => {
  const isHidden = emojiDrawer.style.display === "none" || !emojiDrawer.style.display;
  emojiDrawer.style.display = isHidden ? "flex" : "none";
  if (isHidden) renderEmojiGrid(currentEmojiCategory);
  // Close the GIF drawer if it's open at the same time
  if (gifDrawer) gifDrawer.style.display = "none";
});

closeEmojiBtn?.addEventListener("click", () => {
  emojiDrawer.style.display = "none";
});

// Close emoji drawer if user clicks outside it
document.addEventListener("click", (e) => {
  if (emojiDrawer && emojiDrawer.style.display === "flex") {
    if (!emojiDrawer.contains(e.target) && e.target !== emojiToggleBtn) {
      emojiDrawer.style.display = "none";
    }
  }
});

// ============================================================================
// 🕒 TIMESTAMP FORMATTING UTILITY
// ============================================================================
function formatChatTimestamp(unixTimestamp) {
  if (!unixTimestamp) return "";

  const date = new Date(unixTimestamp * 1000); // Convert seconds to milliseconds
  const now = new Date();

  // Format the time part (e.g., "3:15 PM")
  const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Check if it's today
  if (date.toDateString() === now.toDateString()) {
    return `Today at ${timeString}`;
  }

  // Check if it's yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${timeString}`;
  }

  // Otherwise, return full date and time (e.g., "Jun 22, 3:15 PM")
  const dateOptions = { month: 'short', day: 'numeric' };
  return `${date.toLocaleDateString([], dateOptions)}, ${timeString}`;
}