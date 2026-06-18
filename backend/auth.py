import json
import os
import re
import hashlib
import secrets

# Same file your project tree already shows: "User Data.json"
USER_DATA_FILE = "User Data.json"

# Keep this in sync with the sanitizeUsername() regex in app.js
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{1,30}$")
MIN_PASSWORD_LENGTH = 4


def _load_users() -> list[dict]:
    """Reads every saved account from User Data.json (creates the file if missing)."""
    if not os.path.exists(USER_DATA_FILE):
        with open(USER_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)
        return []

    with open(USER_DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def _save_users(users: list[dict]) -> None:
    with open(USER_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=4)


def _hash_password(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    """PBKDF2-SHA256 hash. Generates a fresh random salt unless one is supplied."""
    if salt_hex is None:
        salt_hex = secrets.token_hex(16)

    hashed = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        100_000,
    )
    return salt_hex, hashed.hex()


def find_user(users: list[dict], username: str) -> dict | None:
    target = username.strip().lower()
    for user in users:
        if user["username"].lower() == target:
            return user
    return None


def user_exists(username: str) -> bool:
    return find_user(_load_users(), username) is not None


def register_user(username: str, password: str) -> dict:
    username = (username or "").strip()
    password = password or ""

    if not USERNAME_PATTERN.match(username):
        return {
            "ok": False,
            "message": "Usernames can only use letters, numbers, _ and - (max 30 characters).",
        }
    if len(password) < MIN_PASSWORD_LENGTH:
        return {
            "ok": False,
            "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        }

    users = _load_users()
    if find_user(users, username):
        return {"ok": False, "message": "User already exists. Please log in."}

    salt_hex, password_hash = _hash_password(password)
    users.append({"username": username, "salt": salt_hex, "password_hash": password_hash})
    _save_users(users)

    return {"ok": True, "message": "Account created. You can log in now."}


def verify_user(username: str, password: str) -> dict:
    username = (username or "").strip()
    password = password or ""

    users = _load_users()
    user = find_user(users, username)

    if not user:
        return {"ok": False, "message": "User does not exist. Please sign up."}

    _, password_hash = _hash_password(password, user["salt"])
    if password_hash != user["password_hash"]:
        return {"ok": False, "message": "Incorrect password. Please try again."}

    return {"ok": True, "message": "Login successful."}