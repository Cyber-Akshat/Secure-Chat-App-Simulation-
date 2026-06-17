import json
import os
import asyncio
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        self.connected_clients: dict[str, WebSocket] = {}
        # Thread/Async lock to prevent data corruption during simultaneous writes
        self.file_lock = asyncio.Lock()
        self.storage_file = "Encryptedmsg.json"

        # Initialize the file with an empty list if it doesn't exist yet
        if not os.path.exists(self.storage_file):
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump([], f)

    async def handle_connection(self, websocket: WebSocket):
        username = websocket.query_params.get("username")

        if not username:
            await websocket.close(code=1003, reason="Username is required")
            return

        if username in self.connected_clients:
            await websocket.close(code=1008, reason=f"Username {username} is already taken")
            return

        await websocket.accept()
        self.connected_clients[username] = websocket
        print(f"New client connected: {username}")

        await self.broadcast_usernames()

        try:
            while True:
                raw_message = await websocket.receive_text()
                await self.receive_message(username, raw_message)
        except WebSocketDisconnect:
            await self.client_disconnected(username)

    async def receive_message(self, username: str, raw_message: str):
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError:
            return

        if data.get("event") != "send-message":
            return

        message_payload = data.get("message", "")
        gif_payload = data.get("gifUrl")

        # 💾 Store the encrypted message data locally on the server disk
        await self.save_to_json_file(username, message_payload, gif_payload)

        # Forward the exact encrypted data out to everyone else
        await self.broadcast({
            "event": "send-message",
            "username": username,
            "message": message_payload,
            "gifUrl": gif_payload
        })

    async def save_to_json_file(self, username: str, encrypted_text: str, gif_url: str or None):
        """Safely appends the message record into Encryptedmsg.json."""
        async with self.file_lock:
            try:
                # 1. Read existing records
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                logs = []

            # 2. Structure the log entry
            new_entry = {
                "sender": username,
                "encrypted_message": encrypted_text,
                "gif_url": gif_url
            }
            logs.append(new_entry)

            # 3. Write it back to the disk
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(logs, f, indent=4, ensure_ascii=False)

    async def client_disconnected(self, username: str):
        if username in self.connected_clients:
            del self.connected_clients[username]

        await self.broadcast_usernames()
        print(f"Client {username} disconnected")

    async def broadcast_usernames(self):
        usernames = list(self.connected_clients.keys())
        await self.broadcast({"event": "update-users", "usernames": usernames})

    async def broadcast(self, message: dict):
        message_string = json.dumps(message)
        for client in list(self.connected_clients.values()):
            try:
                await client.send_text(message_string)
            except Exception:
                pass