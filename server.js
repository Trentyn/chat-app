const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (our frontend)
app.use(express.static("public"));

const usernames = new Set(); // Track active usernames

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle join request
  socket.on("join", (username) => {
    if (usernames.has(username)) {
      socket.emit("username taken");
    } else {
      usernames.add(username);
      socket.username = username; // Store username on socket
      socket.emit("joined");
    }
  });

  // Handle chat messages
  socket.on("chat message", (data) => {
    console.log(`${data.user}: ${data.text}`);
    io.emit("chat message", data); // Broadcast name + message
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    if (socket.username) {
      usernames.delete(socket.username); // Free the username
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
