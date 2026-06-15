import json
from fastapi import WebSocket, WebSocketDisconnect


class ChatServer:
    def __init__(self):
        # Maps username (str) -> WebSocket instance
        self.connected_clients: dict[str, WebSocket] = {}

    async def handle_connection(self, websocket: WebSocket):
        # Extract the username query parameter from the URL
        username = websocket.query_params.get("username")

        # 1. Check if the username is already taken
        if username in self.connected_clients:
            # Accept and immediately close with a custom policy violation code (1008)
            await websocket.accept()
            await websocket.close(code=1008, reason=f"Username {username} is already taken")
            return

        # 2. Accept connection and register client
        await websocket.accept()
        self.connected_clients[username] = websocket
        print(f"New client connected: {username}")

        # Trigger initial user list update (Equivalent to socket.onopen)
        await self.broadcast_usernames()

        # 3. Message listen loop (Equivalent to socket.onmessage and socket.onclose)
        try:
            while True:
                # Wait for an incoming message
                data_string = await websocket.receive_text()
                await self.send_message(username, data_string)

        except WebSocketDisconnect:
            # Handle disconnection automatically when the loop breaks
            await self.client_disconnected(username)

    async def send_message(self, username: str, data_string: str):
        try:
            data = json.loads(data_string)
        except json.JSONDecodeError:
            return  # Ignore malformed JSON

        if data.get("event") != "send-message":
            return

        await self.broadcast({
            "event": "send-message",
            "username": username,
            "message": data.get("message")
        })

    async def client_disconnected(self, username: str):
        if username in self.connected_clients:
            del self.connected_clients[username]

        await self.broadcast_usernames()
        print(f"Client {username} disconnected")

    async def broadcast_usernames(self):
        usernames = list(self.connected_clients.keys())
        await self.broadcast({
            "event": "update-users",
            "usernames": usernames
        })
        print(f"Sent username list: {json.dumps(usernames)}")

    async def broadcast(self, message: dict):
        message_string = json.dumps(message)
        # Create a snapshot list of connections to safely iterate over
        for client in list(self.connected_clients.values()):
            try:
                await client.send_text(message_string)
            except Exception:
                # Catch failures if a connection dropped mid-broadcast
                pass