import json
import os
import asyncio
import secrets
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        self.connected_clients: dict[str, WebSocket] = {}
        # Mutex lock prevents file corruption during simultaneous edits
        self.file_lock = asyncio.Lock()
        self.storage_file = "Encryptedmsg.json"

        # Initialize JSON file if it's missing
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

        # Send full text history to this user immediately on connection
        await self.send_chat_history(websocket)

        try:
            while True:
                raw_message = await websocket.receive_text()
                await self.receive_message(username, raw_message)
        except WebSocketDisconnect:
            await self.client_disconnected(username)

    async def send_chat_history(self, websocket: WebSocket):
        """Dispatches all stored conversation entries directly to a single connection."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                logs = []

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

        # Handle incoming normal messages
        if event_type == "send-message":
            msg_id = secrets.token_hex(8)
            message_payload = data.get("message", "")
            gif_payload = data.get("gifUrl")

            await self.save_to_json_file(msg_id, username, message_payload, gif_payload)

            await self.broadcast({
                "event": "send-message",
                "id": msg_id,
                "username": username,
                "message": message_payload,
                "gifUrl": gif_payload
            })

        # Handle single message deletion requests
        elif event_type == "delete-message":
            msg_id = data.get("id")
            if msg_id:
                await self.delete_from_json_file(msg_id, username)

        # Handle complete chat clear requests
        elif event_type == "clear-chat":
            await self.clear_all_chat_logs()

    async def save_to_json_file(self, msg_id: str, username: str, encrypted_text: str, gif_url: str or None):
        """Safely saves a message entry to Encryptedmsg.json."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                logs = []

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
        """Deletes a single target message from the JSON file if the sender matches."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                return

            target_msg = next((m for m in logs if m.get("id") == msg_id), None)

            if target_msg and target_msg.get("sender") == username:
                logs = [m for m in logs if m.get("id") != msg_id]

                with open(self.storage_file, "w", encoding="utf-8") as f:
                    json.dump(logs, f, indent=4, ensure_ascii=False)

                await self.broadcast({
                    "event": "delete-message",
                    "id": msg_id
                })

    async def clear_all_chat_logs(self):
        """Purges the entire JSON storage database file and tells all browsers to clear UI."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "w", encoding="utf-8") as f:
                    json.dump([], f)  # Wipes file back down to an empty list array
            except Exception as e:
                print(f"Error resetting chat log file: {e}")
                return

        # Broadcast clear signifier event packet out to all active clients
        await self.broadcast({
            "event": "clear-chat"
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