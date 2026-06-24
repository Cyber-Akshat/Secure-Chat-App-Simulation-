// ============================================================================
// REGISTER PAGE LOGIC
// ============================================================================
const registerForm = document.getElementById("register-form");
const authMessage = document.getElementById("auth-message");

// If someone is already logged in, skip straight to the chat
const existingUser = sessionStorage.getItem("hichat_username") || localStorage.getItem("hichat_username");
if (existingUser) {
  window.location.href = "index.html";
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

  // Redirect back to login screen, sending username along to pre-fill it
  const encodedUser = encodeURIComponent(username);
  window.location.href = `login.html?registered=true&username=${encodedUser}`;
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