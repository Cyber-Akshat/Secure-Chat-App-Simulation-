import os
from cryptography.fernet import Fernet

# ==========================================
# 🔑 AKSHAT'S ENCRYPTION MECHANISMS
# ==========================================

def generate_key():
    key = Fernet.generate_key()
    with open("secret.key", "wb") as key_file:
        key_file.write(key)

def load_key():
    return open("secret.key", "rb").read()

def encrypt_message(message, key):
    encoded_message = message.encode()
    f = Fernet(key)
    encrypted_message = f.encrypt(encoded_message)
    return encrypted_message.decode()

def decrypt_message(encrypted_message, key):
    f = Fernet(key)
    decrypt_message = f.decrypt(encrypted_message)
    return decrypt_message.decode()

# ==========================================
# 💾 MITCHELL'S SECURE MESSAGE LOGGING SYSTEM
# ==========================================
def save_history(username, plaintext_message, encryption_key):
    encrypted_string = encrypt_message(plaintext_message, encryption_key)
    with open("secure_chat_history.txt", "a") as file:
        file.write(f"{username}:{encrypted_string}\n")
def load_and_display_history(encryption_key):
    if not os.path.exists("secure_chat_history.txt"):
        return
    with open("secure_chat_history.txt", "r") as file:
        for line in file:
            parts = line.strip().split(":",1)
            if len(parts) ==2:
                user = parts[0]
                encrypted_payload = parts[1]
                readable_message = decrypt_message(encrypted_payload, encryption_key)
                print(f"[{user}]: {readable_message}")

# ==========================================
# 🧪 LIVE SIMULATION OF YOUR FUNCTIONS (PASTE HERE)
# ==========================================
generate_key()
key = load_key()
save_history("Jo", "I love Maths", key)
save_history("Fred", "Me too! It's the best subject", key)
load_and_display_history(key)

