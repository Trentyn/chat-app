const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose"); // Add mongoose
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 200 * 1024 * 1024
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI; // You'll set this in Render
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch((error) => {
  console.error('MongoDB connection error:', error);
});

// Message Schema
const messageSchema = new mongoose.Schema({
  type: String,
  user: String,
  text: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static("public"));

const usernames = new Set();

// Modified to use MongoDB
async function cleanOldMessages() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Message.deleteMany({ timestamp: { $lt: twentyFourHoursAgo } });
}

setInterval(cleanOldMessages, 60 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", async (username) => {
    if (usernames.has(username)) {
      socket.emit("username taken");
    } else {
      usernames.add(username);
      socket.username = username;
      
      // Fetch messages from MongoDB
      try {
        const messages = await Message.find({})
          .sort({ timestamp: -1 })
          .limit(100)
          .lean();
        socket.emit("chat history", messages);
        socket.emit("joined");
      } catch (error) {
        console.error('Error fetching chat history:', error);
        socket.emit("chat history", []);
        socket.emit("joined");
      }
    }
  });

  socket.on("chat message", async (data) => {
    const msg = {
      type: "text",
      user: data.user,
      text: data.text,
      timestamp: new Date()
    };

    try {
      // Save to MongoDB
      const message = new Message(msg);
      await message.save();
      io.emit("chat message", msg);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on("file message", (data) => {
    // Still broadcast file messages but don't store them
    io.emit("file message", data);
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
