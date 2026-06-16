
def vulnerable_login(username, password):
    # This is how the SQL query would be constructed (insecurely)
    query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
    print("\n📜 Simulated SQL Query:")
    print(query)

    # Simulate evaluation
    if username == 'admin' and password == 'admin123':
        return "✅ Access Granted: Welcome admin!"
    elif "' OR '1'='1" in password or '" OR "1"="1' in password:
        return "🔓 Access Granted! (This is a vulnerability!)"
    else:
        return "❌ Access Denied"


if __name__ == "__main__":
    username = input("Enter username: ")
    password = input("Enter password: ")

    result = vulnerable_login(username, password)
    print("\nResult:")
    print(result)
