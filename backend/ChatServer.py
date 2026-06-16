import json
from fastapi import WebSocket, WebSocketDisconnect

class ChatServer:
    def __init__(self):
        self.connected_clients: dict[str, WebSocket] = {}

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

        await self.broadcast({
            "event": "send-message",
            "username": username,
            "message": data.get("message"),
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