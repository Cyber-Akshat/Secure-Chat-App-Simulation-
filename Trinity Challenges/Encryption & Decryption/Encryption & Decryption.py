from cryptography.fernet import Fernet

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

generate_key()

key = load_key()

encrypt = encrypt_message("I Love Maths", key)
print("Encrypted: " + encrypt.decode())

decrypted = decrypt_message(encrypt, key)
print("Decrypted: " + decrypted)
