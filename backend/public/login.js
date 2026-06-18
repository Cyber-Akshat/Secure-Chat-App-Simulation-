// ============================================================================
// LOGIN / REGISTER PAGE LOGIC
// ============================================================================
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");

const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const authMessage = document.getElementById("auth-message");

const toggleToRegister = document.getElementById("toggle-to-register");
const toggleToLogin = document.getElementById("toggle-to-login");

// If someone is already logged in, skip straight to the chat
const existingUser = sessionStorage.getItem("hichat_username") || localStorage.getItem("hichat_username");
if (existingUser) {
  window.location.href = "index.html";
}

document.getElementById("show-register").addEventListener("click", () => switchMode("register"));
document.getElementById("show-login").addEventListener("click", () => switchMode("login"));

function switchMode(mode) {
  const isLogin = mode === "login";

  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  toggleToRegister.hidden = !isLogin;
  toggleToLogin.hidden = isLogin;

  authTitle.textContent = isLogin ? "Welcome back" : "Create your account";
  authSubtitle.textContent = isLogin ? "Log in to keep chatting" : "Join the conversation";

  hideMessage();
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

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();

  const username = document.getElementById("register-username").value.trim();
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-confirm").value;

  if (!username || !password) {
    showMessage("Enter both a username and a password.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Passwords don't match.", "error");
    return;
  }

  const { ok, data } = await postJSON("/api/register", { username, password });

  if (!ok) {
    showMessage(data.detail || "User already exists. Please log in.", "error");
    return;
  }

  showMessage("Account created. You can log in now.", "success");
  switchMode("login");
  document.getElementById("login-username").value = username;
  document.getElementById("login-password").focus();
});