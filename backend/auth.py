import sqlite3
import bcrypt

DB_FILE = "user_auth.db"


def init_auth_database():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
                   CREATE TABLE IF NOT EXISTS users
                   (
                       username      TEXT PRIMARY KEY,
                       password_hash TEXT NOT NULL
                   )
                   """)
    conn.commit()
    conn.close()


init_auth_database()


def register_user(username: str, password: str) -> dict:
    normalized_username = username.strip().lower()
    if not normalized_username or not password:
        return {"ok": False, "message": "Username and password cannot be empty."}

    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (normalized_username, password_hash)
        )
        conn.commit()
        return {"ok": True, "message": "Registration successful."}
    except sqlite3.IntegrityError:
        return {"ok": False, "message": "Username is already taken."}
    finally:
        conn.close()


def verify_user(username: str, password: str) -> dict:
    normalized_username = username.strip().lower()

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT password_hash, username FROM users WHERE username = ?", (normalized_username,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"ok": False, "message": "Invalid username or password."}

    # FIX: No .encode() method called directly on the object.
    # We grab row explicitly and turn it into raw bytes inline.
    stored_bash, db_username = row
    stored_hash_bytes = stored_bash.encode('utf-8')

    if bcrypt.checkpw(password.encode('utf-8'), stored_hash_bytes):
        return {"ok": True, "message": "Login successful.", "db_username": db_username}

    return {"ok": False, "message": "Invalid username or password."}