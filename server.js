const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files (our frontend)
app.use(express.static("public"));

// Store chat messages in memory
let messageHistory = []; // Array to store { user, text } objects

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Send message history to the new user
  socket.emit("message history", messageHistory);

  socket.on("chat message", (data) => {
    console.log(`${data.user}: ${data.text}`);
    // Add the new message to history
    messageHistory.push(data);
    // Optional: Limit history size to prevent memory issues
    if (messageHistory.length > 100) {
      messageHistory.shift(); // Remove oldest message if > 100
    }
    // Broadcast the new message to all clients
    io.emit("chat message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
