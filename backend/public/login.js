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

// Real-Time Password Tick Box Validation Feature
const registerPasswordInput = document.getElementById("register-password");
const registerSubmitButton = registerForm.querySelector(".auth-submit");

const reqLength = document.getElementById("req-length");
const reqCase = document.getElementById("req-case");
const reqNumber = document.getElementById("req-number");
const reqSymbol = document.getElementById("req-symbol");

registerPasswordInput.addEventListener("input", () => {
  const value = registerPasswordInput.value;

  const hasLength = value.length >= 12 && value.length <= 16;
  const hasCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[^A-Za-z0-9]/.test(value);

  // Toggle tick box element states dynamically
  reqLength.checked = hasLength;
  reqLength.parentElement.classList.toggle("valid-req", hasLength);

  reqCase.checked = hasCase;
  reqCase.parentElement.classList.toggle("valid-req", hasCase);

  reqNumber.checked = hasNumber;
  reqNumber.parentElement.classList.toggle("valid-req", hasNumber);

  reqSymbol.checked = hasSymbol;
  reqSymbol.parentElement.classList.toggle("valid-req", hasSymbol);

  // Restrict core submit mechanics until safety guidelines match
  if (hasLength && hasCase && hasNumber && hasSymbol) {
    registerSubmitButton.disabled = false;
    registerSubmitButton.style.opacity = "1";
    registerSubmitButton.style.cursor = "pointer";
  } else {
    registerSubmitButton.disabled = true;
    registerSubmitButton.style.opacity = "0.5";
    registerSubmitButton.style.cursor = "not-allowed";
  }
});