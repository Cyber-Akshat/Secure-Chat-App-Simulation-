import json
import os
import asyncio
import time
import secrets
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        self.connected_clients: dict[str, WebSocket] = {}
        self.file_lock = asyncio.Lock()
        self.storage_file = "Encryptedmsg.json"

        self.throttle_tracker = {
            "current_spammer": None,
            "timestamps": []
        }

        if not (os
                .path.exists(self.storage_file)):



            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump([], f)

    def is_rate_limited(self, username: str) -> bool:
        current_time = time.time()

        if self.throttle_tracker["current_spammer"] != username:
            self.throttle_tracker["current_spammer"] = username
            self.throttle_tracker["timestamps"] = [current_time]
            return False

        self.throttle_tracker["timestamps"].append(current_time)

        ten_seconds_ago = current_time - 10
        self.throttle_tracker["timestamps"] = [
            t for t in self.throttle_tracker["timestamps"] if t > ten_seconds_ago
        ]

        if len(self.throttle_tracker["timestamps"]) > 10:
            return True

        return False

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
        await self.send_chat_history(websocket)

        try:
            while True:
                raw_message = await websocket.receive_text()
                await self.receive_message(username, raw_message)
        except WebSocketDisconnect:
            await self.client_disconnected(username)

    async def send_chat_history(self, websocket: WebSocket):
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

        if event_type == "send-message":
            if self.is_rate_limited(username):
                user_socket = self.connected_clients.get(username)
                if user_socket:
                    await user_socket.send_text(json.dumps({
                        "event": "error",
                        "message": "Spam protection active. You cannot send more than 10 messages consecutively within 10 seconds without a reply!"
                    }))
                print(f"⚠️  [Rate Limit Flagged] Blocked transmission from user: {username}")
                return

            msg_id = secrets.token_hex(8)
            message_payload = data.get("message", "")
            gif_payload = data.get("gifUrl")
            recipient = data.get("recipient")

            if not recipient:
                return

            await self.save_to_json_file(msg_id, username, recipient, message_payload, gif_payload)

            await self.broadcast_private({
                "event": "send-message",
                "id": msg_id,
                "username": username,
                "recipient": recipient,
                "message": message_payload,
                "gifUrl": gif_payload,
                "is_deleted": False
            }, sender=username, recipient=recipient)

        elif event_type == "delete-message":
            msg_id = data.get("id")
            if msg_id:
                await self.delete_from_json_file(msg_id, username)

        elif event_type == "clear-chat":
            pass

    async def save_to_json_file(self, msg_id: str, username: str, recipient: str, encrypted_text: str, gif_url: str or None):
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                logs = []

            new_entry = {
                "id": msg_id,
                "sender": username,
                "recipient": recipient,
                "encrypted_message": encrypted_text,
                "gif_url": gif_url,
                "is_deleted": False
            }
            logs.append(new_entry)

            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(logs, f, indent=4, ensure_ascii=False)

    async def delete_from_json_file(self, msg_id: str, username: str):
        """Marks a message as deleted in storage instead of erasing the item row."""
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                return

            target_msg = next((m for m in logs if m.get("id") == msg_id), None)

            if target_msg and target_msg.get("sender") == username:
                # Mark as deleted and wipe encrypted data safely
                target_msg["is_deleted"] = True
                target_msg["encrypted_message"] = ""
                target_msg["gif_url"] = None
                recipient = target_msg.get("recipient")

                with open(self.storage_file, "w", encoding="utf-8") as f:
                    json.dump(logs, f, indent=4, ensure_ascii=False)

                # Broadcast delete status to private participants
                await self.broadcast_private({
                    "event": "delete-message",
                    "id": msg_id
                }, sender=username, recipient=recipient)

    async def client_disconnected(self, username: str):
        if username in self.connected_clients:
            del self.connected_clients[username]
        await self.broadcast_usernames()

    async def broadcast_usernames(self):
        usernames = list(self.connected_clients.keys())
        await self.broadcast_global({"event": "update-users", "usernames": usernames})

    async def broadcast_private(self, message: dict, sender: str, recipient: str):
        message_string = json.dumps(message)
        for user in [sender, recipient]:
            client = self.connected_clients.get(user)
            if client:
                try:
                    await client.send_text(message_string)
                except Exception:
                    pass

    async def broadcast_global(self, message: dict):
        message_string = json.dumps(message)
        for client in list(self.connected_clients.values()):
            try:
                await client.send_text(message_string)
            except Exception:
                pass