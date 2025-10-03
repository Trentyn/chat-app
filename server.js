const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 200 * 1024 * 1024 // 200MB to account for base64 overhead
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static("public"));

const usernames = new Set();
let messages = []; // Only text messages will be saved in history

function cleanOldMessages() {
  const now = Date.now();
  // Only keep text messages from last 24 hours
  messages = messages.filter(msg => now - msg.timestamp < 24 * 60 * 60 * 1000);
}
setInterval(cleanOldMessages, 60 * 60 * 1000); // Clean every hour

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", (username) => {
    if (usernames.has(username)) {
      socket.emit("username taken");
    } else {
      usernames.add(username);
      socket.username = username;
      cleanOldMessages();
      // Only send text messages in chat history
      socket.emit("chat history", messages);
      socket.emit("joined");
    }
  });

  socket.on("chat message", (data) => {
    const msg = {
      type: "text",
      user: data.user,
      text: data.text,
      timestamp: Date.now()
    };
    messages.push(msg); // Only text messages are saved in history
    io.emit("chat message", msg);
  });

  socket.on("file message", (data) => {
    // Broadcast file/image to all connected users, but DO NOT save in history
    io.emit("file message", data);
    // Do NOT push anything to messages array for files/images
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      usernames.delete(socket.username);
    }
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
