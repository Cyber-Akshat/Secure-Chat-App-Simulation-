import json
import os
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        # Dictionary structure tracking live connected users: { "username": WebSocket }
        self.connected_clients: dict[str, WebSocket] = {}

        # Define the path for your human-readable users.json storage file
        self.json_file_path = os.path.join(os.getcwd(), "users.json")

        # Automatically make sure the JSON file exists on boot
        self.init_json_file()

    def init_json_file(self):
        """Creates the users.json file with an empty list if it doesn't exist yet."""
        if not os.path.exists(self.json_file_path):
            with open(self.json_file_path, "w") as file:
                json.dump([], file, indent=4)
            print("Created a fresh users.json file!")
        else:
            print("Found existing users.json file.")

    def save_user_to_json(self, username: str):
        """Reads the JSON file, adds the new username if unique, and saves it back."""
        try:
            # 1. Open and read the current list of users
            with open(self.json_file_path, "r") as file:
                registered_users = json.load(file)

            # 2. Add the username if it isn't already in the list
            if username not in registered_users:
                registered_users.append(username)

                # 3. Write the updated list back to the file with clean text indents
                with open(self.json_file_path, "w") as file:
                    json.dump(registered_users, file, indent=4)
                print(f"Physically saved '{username}' into users.json!")
            else:
                print(f"User '{username}' was already registered in users.json.")

        except Exception as e:
            print(f"Error writing to JSON file: {e}")

    async def handle_connection(self, websocket: WebSocket):
        """Manages the full lifecycle of a single user connecting via WebSockets."""
        username = websocket.query_params.get("username")

        import re

        # Validation Check 1: Reject usernames containing HTML or illegal characters
        if not re.match(r'^[a-zA-Z0-9_\-]{1,30}$', username):
            await websocket.close(code=1003, reason="Username contains invalid characters.")
            return

        # Validation Check 2: Did they provide a username?
        if not username:
            await websocket.close(code=1003, reason="Username is required.")
            return

        # Validation Check 3: Is someone already logged into this username right now?
        if username in self.connected_clients:
            await websocket.close(code=1008, reason=f"Username '{username}' is already online.")
            return

        # Accept the connection handshake
        await websocket.accept()

        # Physically save the username into your text-based users.json file
        self.save_user_to_json(username)

        # Map the active WebSocket stream into our active global tracking list
        self.connected_clients[username] = websocket
        print(f"Client connected: {username}")

        # Broadcast the new online user list out to all active panels
        await self.broadcast_usernames()

        try:
            # Main event listening loop keeping the socket connection open
            while True:
                raw_message = await websocket.receive_text()
                await self.receive_message(username, raw_message)

        except WebSocketDisconnect:
            # Gracefully clear out profiles if their browser tab closes
            await self.client_disconnected(username)

    async def receive_message(self, username: str, raw_message: str):
        """Parses and distributes incoming chat messages."""
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError:
            return  # Safely ignore bad text streams

        if data.get("event") != "send-message":
            return

        # Broadcast the sanitized text out to every single person in the chat
        await self.broadcast({
            "event": "send-message",
            "username": username,
            "message": data.get("message"),
        })

    async def client_disconnected(self, username: str):
        """Removes user from the active memory collection on drop."""
        if username in self.connected_clients:
            del self.connected_clients[username]

        print(f"Client disconnected: {username}")
        # Refresh everyone's active sidebar list panel
        await self.broadcast_usernames()

    async def broadcast_usernames(self):
        """Compiles and broadcasts the live array list of online users."""
        usernames = list(self.connected_clients.keys())
        await self.broadcast({
            "event": "update-users",
            "usernames": usernames
        })

    async def broadcast(self, message: dict):
        """Utility wrapper safely shipping JSON text strings out to all listeners."""
        message_string = json.dumps(message)

        for client_ws in list(self.connected_clients.values()):
            try:
                await client_ws.send_text(message_string)
            except Exception:
                # Catch closed socket write exceptions safely to keep the server running
                pass