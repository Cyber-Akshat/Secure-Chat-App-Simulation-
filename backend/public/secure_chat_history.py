import json
import os


def save_to_json_history(username, encrypted_payload):
    """
    Your Core Task: Saves the incoming scrambled message data structure
    safely into a structured JSON file format.
    """
    file_name = "Encryptedmsg.json"
    new_entry = {
        "user": username,
        "ciphertext": encrypted_payload
    }

    # 1. If the file already exists, read the existing list of messages first
    if os.path.exists(file_name):
        with open(file_name, "r") as file:
            try:
                data_list = json.load(file)
            except json.JSONDecodeError:
                data_list = []  # Reset if file got corrupted
    else:
        data_list = []

    # 2. Add our brand new encrypted message to the list
    data_list.append(new_entry)

    # 3. Save the updated list back into the JSON file with clean formatting
    with open(file_name, "w") as file:
        json.dump(data_list, file, indent=4)

    print(f"💾 Saved entry to {file_name} for user '{username}'")