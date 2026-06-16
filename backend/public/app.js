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
      addMessageToChat(senderDisplay, data.message);
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
    statusDot.style.borderRadius = "50%;"

    listItem.appendChild(avatarImg);
    listItem.appendChild(nameSpan);
    listItem.appendChild(statusDot);
    userList.appendChild(listItem);
  }
}

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

const messageInput = document.getElementById("data");
const chatForm = document.getElementById("form");

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const messageText = messageInput.value.trim();

  if (messageText !== "" && socket.readyState === WebSocket.OPEN) {
    const payload = {
      event: "send-message",
      message: messageText
    };
    socket.send(JSON.stringify(payload));
    messageInput.value = "";
  }
});