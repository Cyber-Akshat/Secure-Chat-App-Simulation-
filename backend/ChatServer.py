import json
import os
import re
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
            print("📁 Created a fresh users.json file!")
        else:
            print("📁 Found existing users.json file.")

    def save_user_to_json(self, username: str):
        """Reads the JSON file, adds the new username if unique, and saves it back atomically."""
        try:
            if os.path.exists(self.json_file_path):
                with open(self.json_file_path, "r") as file:
                    registered_users = json.load(file)
            else:
                registered_users = []

            if username not in registered_users:
                registered_users.append(username)

                # Write to a temporary file first to prevent mid-crash file corruption
                temp_file_path = self.json_file_path + ".tmp"
                with open(temp_file_path, "w") as temp_file:
                    json.dump(registered_users, temp_file, indent=4)

                # Swap the temporary file over to the real file name instantly
                os.replace(temp_file_path, self.json_file_path)
                print(f"📝 Physically saved '{username}' into users.json!")
            else:
                print(f"ℹ️ User '{username}' was already registered in users.json.")

        except Exception as e:
            print(f"❌ Error writing to JSON file: {e}")

    async def handle_connection(self, websocket: WebSocket):
        """Manages the full lifecycle of a single user connecting via WebSockets."""
        username = websocket.query_params.get("username")

        # Validation Check 1: Did they provide a username?
        if not username:
            await websocket.close(code=1003, reason="Username is required.")
            return

        # Validation Check 2: Server-side validation filtering out unsafe structures
        if not re.match(r"^[a-zA-Z0-9_ -]{1,30}$", username):
            await websocket.close(code=1008, reason="Invalid username characters or length.")
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
        print(f"🟢 Client connected: {username}")

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
        """Parses and distributes incoming chat messages and file attachments."""
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError:
            return  # Safely ignore bad text streams

        if data.get("event") != "send-message":
            return

        # Broadcast the text message along with all relevant base64 attachment attributes
        await self.broadcast({
            "event": "send-message",
            "username": username,
            "message": data.get("message"),
            "fileData": data.get("fileData"),
            "fileName": data.get("fileName"),
            "fileType": data.get("fileType")
        })

    async def client_disconnected(self, username: str):
        """Removes user from the active memory collection on drop."""
        if username in self.connected_clients:
            del self.connected_clients[username]

        print(f"🔴 Client disconnected: {username}")
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