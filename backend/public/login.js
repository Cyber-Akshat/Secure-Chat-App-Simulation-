// ============================================================================
// LOGIN PAGE LOGIC
// ============================================================================
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");

// If someone is already logged in, skip straight to the chat
const existingUser = sessionStorage.getItem("hichat_username") || localStorage.getItem("hichat_username");
if (existingUser) {
  window.location.href = "index.html";
}

// Check if user just registered and pre-fill/show success message
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("registered") === "true") {
  const registeredUser = urlParams.get("username");
  showMessage("Account created. You can log in now.", "success");

  if (registeredUser) {
    document.getElementById("login-username").value = decodeURIComponent(registeredUser);
    document.getElementById("login-password").focus();
  }
}

function showMessage(text, type) {
  authMessage.textContent = text;
  authMessage.className = `auth-message ${type}`;
  authMessage.hidden = false;
}

function hideMessage() {
  authMessage.hidden = true;
}

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  let data = {};
  try {
    data = await response.json();
  } catch (err) {
    data = {};
  }

  return { ok: response.ok, data };
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const remember = document.getElementById("login-remember").checked;

  if (!username || !password) {
    showMessage("Enter both a username and a password.", "error");
    return;
  }

  const { ok, data } = await postJSON("/api/login", { username, password });

  if (!ok) {
    showMessage(data.detail || "User does not exist. Please sign up.", "error");
    return;
  }

  // "Remember me" keeps the session across browser restarts (localStorage),
  // otherwise it only lasts for this tab/session (sessionStorage)
  const store = remember ? localStorage : sessionStorage;
  store.setItem("hichat_username", data.username || username);

  window.location.href = "index.html";
});