import os
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import FileResponse

# Assuming you have a chat_server.py file with a ChatServer class
from ChatServer import ChatServer

# Creates the app, sets the port, and uses the ChatServer object
app = FastAPI()
port = 8080
server = ChatServer()


# Checks for connections at start_web_socket and hands the connection
# to server.handle_connection() to manage messaging
@app.websocket("/start_web_socket")
async def websocket_endpoint(websocket: WebSocket):
    # In FastAPI, WebSocket connections must be explicitly accepted.
    # Your ChatServer.handle_connection method should call `await websocket.accept()`
    await server.handle_connection(websocket)


# catches all get requests and tries to serve the requested file which gets returned
# directly - if not, the file falls back to public/index.html
@app.get("/{catchall:path}")
async def serve_files(catchall: str):
    # Look for the file falls back inside the public directory
    file_path = os.path.join(os.getcwd(), "public" ,catchall)

    # If the exact requested file exists, serve it
    if catchall and os.path.isfile(file_path):
        return FileResponse(file_path)

    # Otherwise, default to serving the index.html
    index_path = os.path.join(os.getcwd(), "public", "index.html")
    return FileResponse(index_path)


if __name__ == "__main__":
    print(f"Listening at http://localhost:{port}")
    # Starts the server using uvicorn
    uvicorn.run(app, host="0.0.0.0", port=port)