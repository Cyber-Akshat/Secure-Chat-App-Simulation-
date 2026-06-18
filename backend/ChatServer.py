import json
import os
import asyncio
import secrets  # Added to safely generate random unique IDs for messages
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

        # 📜 FIX 1: Instantly send all stored chat logs to this single user upon connection
        await self.send_chat_history(websocket)

        try:
            while True:
                raw_message = await websocket.receive_text()
                await self.receive_message(username, raw_message)
        except WebSocketDisconnect:
            await self.client_disconnected(username)

    async def send_chat_history(self, websocket: WebSocket):
        """Reads historical chat data from the file and loads it onto a client's screen."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                logs = []

        # Dispatch a special 'chat-history' payload to the connecting websocket client only
        await websocket.send_text(json.dumps({
            "event": "chat-history",
            "messages": logs
        }))

    async def receive_message(self, username: str, raw_message: str):
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError:
            return

        event_type = data.get("event")

        # 📨 Case A: Handling incoming live chat text or GIFs
        if event_type == "send-message":
            # FIX 2: Generate a unique ID string for this message so it can be deleted later
            msg_id = secrets.token_hex(8)
            message_payload = data.get("message", "")
            gif_payload = data.get("gifUrl")

            # Store the message details along with its unique ID
            await self.save_to_json_file(msg_id, username, message_payload, gif_payload)

            # Broadcast it with the ID out to all online users
            await self.broadcast({
                "event": "send-message",
                "id": msg_id,
                "username": username,
                "message": message_payload,
                "gifUrl": gif_payload
            })

        # 🗑️ Case B: Handling incoming live deletion requests from the frontend button
        elif event_type == "delete-message":
            msg_id = data.get("id")
            if msg_id:
                await self.delete_from_json_file(msg_id, username)

    async def save_to_json_file(self, msg_id: str, username: str, encrypted_text: str, gif_url: str or None):
        """Safely appends the message record into Encryptedmsg.json with a distinct ID."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                logs = []

            # Structure entry with an ID so the delete button knows exactly what to look for
            new_entry = {
                "id": msg_id,
                "sender": username,
                "encrypted_message": encrypted_text,
                "gif_url": gif_url
            }
            logs.append(new_entry)

            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(logs, f, indent=4, ensure_ascii=False)

    async def delete_from_json_file(self, msg_id: str, username: str):
        """Removes a message from storage only if the requester is the person who sent it."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                return

            # Find the message to confirm permissions
            target_msg = next((m for m in logs if m.get("id") == msg_id), None)

            # Security Guard: Only let the sender delete the message
            if target_msg and target_msg.get("sender") == username:
                # Keep everything EXCEPT the message being deleted
                logs = [m for m in logs if m.get("id") != msg_id]

                with open(self.storage_file, "w", encoding="utf-8") as f:
                    json.dump(logs, f, indent=4, ensure_ascii=False)

                # Tell everyone on the frontend to remove this specific message ID immediately
                await self.broadcast({
                    "event": "delete-message",
                    "id": msg_id
                })

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