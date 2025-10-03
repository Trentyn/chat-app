const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 200 * 1024 * 1024 // 200MB to account for base64 overhead
});

app.use(express.json({ limit: '51mb' }));
app.use(express.urlencoded({ limit: '51mb', extended: true }));
app.use(express.static("public"));

const usernames = new Set();
let messages = []; // Store all chat messages

function cleanOldMessages() {
  const now = Date.now();
  // Filter only messages from last 24 hours
  messages = messages.filter(msg => now - msg.timestamp < 24 * 60 * 60 * 1000);
}

// Clean every hour
setInterval(cleanOldMessages, 60 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", (username) => {
    if (usernames.has(username)) {
      socket.emit("username taken");
    } else {
      usernames.add(username);
      socket.username = username;
      // Clean before sending
      cleanOldMessages();
      // Send chat history to new user
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
    messages.push(msg);
    io.emit("chat message", msg);
  });

  socket.on("file message", (data) => {
    // 1. Broadcast the actual file to all connected users
    io.emit("file message", data);
  
    // 2. Save only a placeholder in history (no .data)
    const mimeTypeMatch = data.data.match(/^data:([^;]+);/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : '';
    let fileType = 'file';
    if (mimeType.startsWith('image/')) fileType = 'image';
  
    const msg = {
      type: "file",
      user: data.user,
      fileName: data.fileName,
      fileType: fileType,
      timestamp: Date.now()
      // NO .data field here!
    };
    messages.push(msg);
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



