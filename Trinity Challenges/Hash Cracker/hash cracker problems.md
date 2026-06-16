# Why This Won't Work

Currently, the code uses **bcrypt hashing**, which is a **one-way process**. You can verify a message against a hash, but you **cannot decrypt it back to the original message**.

## Why?

Hashing is designed for verification, not recovery. Once data is hashed, the original content cannot be retrieved from the hash.

### Current Flow (Hashing)

```
Message → bcrypt hash → stored
```

You can only check:

```
Does this message match this hash?
```

Result:

- Yes ✅
- No ❌

You **cannot recover the original message** from the stored hash.

---

## If You Want Decryption

To decrypt and view the original message later, you need **encryption**, not hashing.

### Requirements

1. Use an encryption algorithm such as **Fernet** from the `cryptography` library.
2. Store the encrypted message.
3. Store or securely manage a secret encryption key.
4. Use the same key later to decrypt the message and retrieve the original content.

### Alternative Flow (Encryption)

```
Message → Encrypt with Key → Store Ciphertext
```

Later:

```
Ciphertext + Same Key → Decrypt → Original Message
```

### Example

Original Message:

```
Hello World
```

Encrypted:

```
gAAAAABo...
```

Stored:

```
Encrypted Message + Secret Key
```

Decrypted Later:

```
Hello World
```

---

## Summary

| Feature | Hashing (bcrypt) | Encryption (Fernet) |
|----------|----------|----------|
| One-way process | ✅ | ❌ |
| Can verify data | ✅ | ✅ |
| Can recover original message | ❌ | ✅ |
| Suitable for passwords | ✅ | ❌ |
| Suitable for encrypted chat messages | ❌ | ✅ |

For a secure chat application where users need to read messages later, **encryption (e.g., Fernet)** should be used instead of **bcrypt hashing**.
