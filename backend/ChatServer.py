import json
import os
import asyncio
import time
import secrets
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        self.connected_clients: dict[str, WebSocket] = {} #creates a dict with the clients and their websockets (like a client id)
        self.file_lock = asyncio.Lock() #stores into encryptedmsg.json
        self.storage_file = "Encryptedmsg.json" # <- creates the file

        self.throttle_tracker = { #real time tracker for spamming prevention
            "current_spammer": None,
            "timestamps": [] #stores timestamps of messages sent
        }

        if not os.path.exists(self.storage_file): #checks if encryptedmsg.json exists
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump([], f) #stores the messages (encrypted) into encryptedmsg.json

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
        # if > 10 msgs sent in < 10 secs, flag as spammer

        return False

    async def handle_connection(self, websocket: WebSocket):
        username = websocket.query_params.get("username")

        if not username: #if no username, give code 1003
            await websocket.close(code=1003, reason="Username is required")
            return

        if username in self.connected_clients: #if user taken, give error code 1008
            await websocket.close(code=1008, reason=f"Username {username} is already taken")
            return

        await websocket.accept()
        self.connected_clients[username] = websocket
        print(f"New client connected: {username}")

        await self.broadcast_usernames() #saves usernames
        await self.send_chat_history(websocket) #saves chat history

        try:
            while True:
                raw_message = await websocket.receive_text() #for receiving messages for other people
                await self.receive_message(username, raw_message) #username and raw msgs no encryption
        except WebSocketDisconnect:
            await self.client_disconnected(username) #if dc, dc user from the server

    async def send_chat_history(self, websocket: WebSocket):
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f: #opens the chat log file, encrypts it
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError): #if the json file doesnt exist (shouldnt)...
                logs = [] #... store the logs in this dict which gets created

        await websocket.send_text(json.dumps({ #the format for the chat logs)
            "event": "chat-history",
            "messages": logs
        }))

    async def receive_message(self, username: str, raw_message: str):
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError:
            return #if the json can't decrypt, it doesn't load the message for safety

        event_type = data.get("event")

        if event_type == "send-message":
            if self.is_rate_limited(username):
                user_socket = self.connected_clients.get(username)
                if user_socket:
                    await user_socket.send_text(json.dumps({
                        "event": "error",
                        "message": "Spam protection active. You cannot send more than 10 messages consecutively within 10 seconds without a reply!" #if user has been rate limited, show this msg instead of sending their text
                    }))
                print(f"⚠️  [Rate Limit Flagged] Blocked transmission from user: {username}")
                return

            msg_id = secrets.token_hex(8) #creates an id for each msg
            message_payload = data.get("message", "")
            gif_payload = data.get("gifUrl")
            recipient = data.get("recipient")

            if not recipient:
                return #if msg has no set recipient, don't send it

            await self.save_to_json_file(msg_id, username, recipient, message_payload, gif_payload) #saves all this msg data to encrypedmsg.json

            await self.broadcast_private({
                "event": "send-message",
                "id": msg_id,
                "username": username,
                "recipient": recipient,
                "message": message_payload,
                "gifUrl": gif_payload,
                "is_deleted": False
            }, sender=username, recipient=recipient) #formats the msg

        elif event_type == "delete-message":
            msg_id = data.get("id")
            if msg_id:
                await self.delete_from_json_file(msg_id, username) #fully deletes msg from json file by their id

        elif event_type == "clear-chat":
            pass #this just means that clearing the chat doesn't create a new id in the encryptedmsg.json

    async def save_to_json_file(self, msg_id: str, username: str, recipient: str, encrypted_text: str, gif_url: str or None): #stores metadata of messages as strs
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
                "is_deleted": False,
                "timestamp" : time.time() # Gets the real time of the message sent
            }
            logs.append(new_entry)

            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(logs, f, indent=4, ensure_ascii=False)

    async def delete_from_json_file(self, msg_id: str, username: str):
        #marks a message as deleted in storage instead of erasing the item row
        async with self.file_lock:
            try:
                with open(self.storage_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                return

            target_msg = next((m for m in logs if m.get("id") == msg_id), None) #gets id of the msg

            if target_msg and target_msg.get("sender") == username:
                # Mark as deleted and wipe encrypted data safely
                target_msg["is_deleted"] = True
                target_msg["encrypted_message"] = ""
                target_msg["gif_url"] = None
                recipient = target_msg.get("recipient") #many checks to see if the deleted msg is the one chosen

                with open(self.storage_file, "w", encoding="utf-8") as f:
                    json.dump(logs, f, indent=4, ensure_ascii=False)

                # Broadcast delete status to private participants
                await self.broadcast_private({
                    "event": "delete-message",
                    "id": msg_id
                }, sender=username, recipient=recipient)

    async def client_disconnected(self, username: str):#func deletes clients when they dc
        if username in self.connected_clients:
            del self.connected_clients[username]
        await self.broadcast_usernames() #broadcasts the new set of users

    async def broadcast_usernames(self):
        usernames = list(self.connected_clients.keys()) #list of connected users
        await self.broadcast_global({"event": "update-users", "usernames": usernames}) #updates the users connected

    async def broadcast_private(self, message: dict, sender: str, recipient: str):
        message_string = json.dumps(message)
        for user in [sender, recipient]:
            client = self.connected_clients.get(user)
            if client:
                try:
                    await client.send_text(message_string)
                except Exception:
                    pass #dont create new id for msgs that havent been sent

    async def broadcast_global(self, message: dict):
        message_string = json.dumps(message)
        for client in list(self.connected_clients.values()):
            try:
                await client.send_text(message_string)
            except Exception:
                pass