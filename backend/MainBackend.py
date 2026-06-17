import os
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse
from ChatServer import ChatServer

app = FastAPI()
port = 8080
server = ChatServer()


@app.websocket("/start_web_socket")
async def websocket_endpoint(websocket: WebSocket):
    await server.handle_connection(websocket)


@app.get("/{catchall:path}")
async def serve_files(catchall: str):
    file_path = os.path.join(os.getcwd(), "public", catchall)
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)

    return FileResponse(os.path.join(os.getcwd(), "public", "index.html"))
#running the server

if __name__ == "__main__":
    print(f"Server running at http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port)