import json
from fastapi import WebSocket, WebSocketDisconnect

class ChatServer:
    def __init__(self):
        # Maps username (str) -> WebSocket instance
        self.connected_clients: dict[str, WebSocket] = {}

    async def handle_connection(self, websocket: WebSocket):
        # Extract the username query parameter from the URL
        username = websocket.query_params.get("username")

        #1. Check if the username exists
        if username in self.connected_clients:
            # Accepts and immediately close with a custom policy violation code
            await websocket.accept()
            await websocket.close(code=1008, reason=f"Username {username} is already taken")
            return
        #2. Accept connection and register client
        await websocket.accept()
        self.connected_clients[username] = websocket
        print(f"New client connected: {username}")

        # Trigger initial user list update
        await self.broadcast_usernames()

        #3. Message listen loop
        try:
            while True:
                data_string = await websocket.receive_text()
                await self.receive_message(username, data_string)

        except WebSocketDisconnect:
            await self.client_disconnected(username)

    async def receive_message(self, username: str, raw_message: str):
        try:
            data = json.loads(raw_message)
        except json.JSONDecodeError:
            return  # Ignore malformed JSON

        if data.get("event") != "send-message":
            return

        await self.broadcast({
            "event": "send-message",
            "username": username,
            "message": data.get("message"),
        })

    async def client_disconnected(self, username: str):
        # Remove from active clients dict
        if username in self.connected_clients:
            del self.connected_clients[username]

        await self.broadcast_usernames()
        print(f"Client {username} disconnected")

    async def broadcast_usernames(self):
        usernames = list(self.connected_clients.keys())
        await self.broadcast({"event": "update-users", "usernames": usernames})
        print("Sent username list:", json.dumps(usernames))

    async def broadcast(self, message: dict):
        message_string = json.dumps(message)

        # Iterate over a list copy of values to avoid runtime dictionary mutation errors
        for client in list(self.connected_clients.values()):
            try:
                await client.send_text(message_string)
            except Exception:
                # Catch failures if a specific client connection went stale unexpectedly
                pass
