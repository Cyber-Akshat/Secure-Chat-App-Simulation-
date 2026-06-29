import json
import sqlite3
import asyncio
import time
import secrets
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        self.connected_clients: dict[str, WebSocket] = {}  # Dict for clients and websockets
        self.db_file = "chat_messages.db"  # Database file name

        self.throttle_tracker = {  # Real-time spam prevention tracker
            "current_spammer": None,
            "timestamps": []
        }

        self.init_database()

    def init_database(self):
        """Initializes the SQLite database and creates the messages table if it doesn't exist."""
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        cursor.execute("""
                       CREATE TABLE IF NOT EXISTS messages
                       (
                           id TEXT PRIMARY KEY,
                           sender TEXT,
                           recipient TEXT,
                           encrypted_message TEXT,
                           gif_url TEXT,
                           is_deleted INTEGER DEFAULT 0,
                           timestamp REAL
                       )
                       """)
        conn.commit()
        conn.close()

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
        """Fetches all history logs from the SQLite database asynchronously."""
        logs = []
        try:
            await asyncio.to_thread(self._fetch_history_sync, logs)
        except Exception as e:
            print(f"Error fetching database history: {e}")

        await websocket.send_text(json.dumps({
            "event": "chat-history",
            "messages": logs
        }))

    def _fetch_history_sync(self, logs_list):
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        cursor.execute("SELECT id, sender, recipient, encrypted_message, gif_url, is_deleted, timestamp FROM messages")
        rows = cursor.fetchall()
        for row in rows:
            # row columns, in order: id, sender, recipient, encrypted_message, gif_url, is_deleted, timestamp
            db_is_deleted = row[5] if row[5] is not None else 0

            logs_list.append({
                "id": row[0],
                "sender": row[1],
                "recipient": row[2],
                "encrypted_message": row[3],
                "gif_url": row[4],
                # Only permanent deletes (is_deleted == 2) are stored server-side.
                # Temporary "delete for me" never touches the DB at all.
                "is_deleted": db_is_deleted == 2,
                "is_permanent": db_is_deleted == 2,
                "timestamp": row[6]
            })
        conn.close()

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

            await self.save_to_database(msg_id, username, recipient, message_payload, gif_payload)

            await self.broadcast_private({
                "event": "send-message",
                "id": msg_id,
                "username": username,
                "recipient": recipient,
                "message": message_payload,
                "gifUrl": gif_payload,
                "is_deleted": False,
                "timestamp": time.time()
            }, sender=username, recipient=recipient)

        elif event_type == "delete-message":
            msg_id = data.get("id")
            mode = data.get("mode", "permanent")
            # "temporary" is a client-only Delete-for-Me action. It never touches
            # the database and is never broadcast — the other party should keep
            # seeing the message exactly as before. Only "permanent" (delete for
            # everyone) is persisted and sent to both sides.
            if msg_id and mode == "permanent":
                await self.delete_from_database(msg_id, username, mode)

        elif event_type == "clear-chat":
            pass

    async def save_to_database(self, msg_id: str, username: str, recipient: str, encrypted_text: str,
                               gif_url: str or None):
        """Inserts a clean entry record safely into the SQLite engine table."""
        current_timestamp = time.time()
        await asyncio.to_thread(
            self._save_sync, msg_id, username, recipient, encrypted_text, gif_url, current_timestamp
        )

    def _save_sync(self, msg_id, username, recipient, encrypted_text, gif_url, timestamp):
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, sender, recipient, encrypted_message, gif_url, is_deleted, timestamp) VALUES (?, ?, ?, ?, ?, 0, ?)",
            (msg_id, username, recipient, encrypted_text, gif_url, timestamp)
        )
        conn.commit()
        conn.close()

    async def delete_from_database(self, msg_id: str, username: str, mode: str = "permanent"):
        """Handles the permanent (hard) table update on a separate thread, then
        notifies both parties so the message disappears for everyone."""
        recipient = await asyncio.to_thread(self._delete_sync, msg_id, username)

        if recipient:
            await self.broadcast_private({
                "event": "delete-message",
                "id": msg_id,
                "mode": mode
            }, sender=username, recipient=recipient)

    def _delete_sync(self, msg_id, username):
        conn = sqlite3.connect(self.db_file)
        cursor = conn.cursor()

        cursor.execute("SELECT recipient FROM messages WHERE id = ? AND sender = ?", (msg_id, username))
        result = cursor.fetchone()

        recipient = None
        if result:
            recipient = result[0]

            cursor.execute(
                "UPDATE messages SET is_deleted = 2, encrypted_message = '', gif_url = NULL WHERE id = ?",
                (msg_id,)
            )
            conn.commit()

        conn.close()
        return recipient

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