require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const { User, Message } = require("./models/User");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const cryptoRandomString = require("crypto-random-string").default;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 200 * 1024 * 1024 });

mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));
app.use(express.static("public"));

function cleanOldMessages() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  Message.deleteMany({ timestamp: { $lt: oneDayAgo } }).catch(() => {});
}
setInterval(cleanOldMessages, 60 * 60 * 1000);

io.on("connection", (socket) => {
  // Registration Step 1: receive username, respond with QR code & recovery key
  socket.on("register", async (username) => {
    try {
      if (!username || username.length < 2) {
        socket.emit("register_error", "Username required!");
        return;
      }
      const exists = await User.findOne({ username });
      if (exists) {
        socket.emit("register_error", "Username already taken!");
        return;
      }
      const secret = speakeasy.generateSecret({ name: `ChatApp:${username}` });
      const recoveryKey = cryptoRandomString({ length: 40, type: "base64" });
      socket._pendingRegistration = { username, secret, recoveryKey };
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);
      socket.emit("register_step2", { qrCode, recoveryKey });
    } catch (err) {
      console.error("Registration error:", err);
      socket.emit("register_error", "Registration failed, try again.");
    }
  });

  // Registration Step 2: verify TOTP, create user in DB, send success
  socket.on("register_confirm", async ({ token }) => {
    try {
      const reg = socket._pendingRegistration;
      if (!reg) {
        socket.emit("register_error", "No registration pending.");
        return;
      }
      const verified = speakeasy.totp.verify({
        secret: reg.secret.base32,
        encoding: "base32",
        token
      });
      if (!verified) {
        socket.emit("register_error", "Invalid code! Scan QR and enter correct code.");
        return;
      }
      await User.create({
        username: reg.username,
        secret: reg.secret.base32,
        recoveryKey: reg.recoveryKey,
        theme: "light"
      });
      delete socket._pendingRegistration;
      socket.emit("register_success");
    } catch (err) {
      console.error("Registration confirm error:", err);
      socket.emit("register_error", "Registration failed, try again.");
    }
  });

  // Login: username + TOTP, respond with chat history and theme if OK
  socket.on("login", async ({ username, token }) => {
    try {
      const user = await User.findOne({ username });
      if (!user) {
        socket.emit("login_error", "User not found!");
        return;
      }
      const verified = speakeasy.totp.verify({
        secret: user.secret,
        encoding: "base32",
        token
      });
      if (!verified) {
        socket.emit("login_error", "Invalid code!");
        return;
      }
      socket.username = username;
      const history = await Message.find()
        .sort({ timestamp: 1 })
        .limit(100);
      socket.emit("login_success", { theme: user.theme || "light" });
      socket.emit("chat_history", history);
    } catch (err) {
      socket.emit("login_error", "Login failed.");
    }
  });

  // Recovery: username + recoveryKey, returns new QR and key, does NOT log user in
  socket.on("recover", async ({ username, recoveryKey }) => {
    try {
      const user = await User.findOne({ username, recoveryKey });
      if (!user) {
        socket.emit("recovery_error", "Incorrect username or recovery key!");
        return;
      }
      const secret = speakeasy.generateSecret({ name: `ChatApp:${username}` });
      const newRecoveryKey = cryptoRandomString({ length: 40, type: "base64" });
      user.secret = secret.base32;
      user.recoveryKey = newRecoveryKey;
      await user.save();
      const qrCode = await QRCode.toDataURL(secret.otpauth_url);
      socket.emit("recovery_success", { qrCode, recoveryKey: newRecoveryKey });
    } catch (err) {
      socket.emit("recovery_error", "Recovery failed.");
    }
  });

  // Chat message
  socket.on("chat_message", async (data) => {
    if (!socket.username) return;
    const msg = new Message({
      type: "text",
      user: socket.username,
      text: data.text
    });
    await msg.save();
    // Broadcast with its id
    io.emit("chat_message", {
      _id: msg._id,
      user: msg.user,
      text: msg.text,
      edited: msg.edited,
      deleted: msg.deleted
    });
  });

  // Edit message
  socket.on("edit_message", async ({ id, newText }) => {
    if (!socket.username) return;
    const msg = await Message.findById(id);
    if (msg && msg.user === socket.username && !msg.deleted) {
      msg.text = newText;
      msg.edited = true;
      await msg.save();
      io.emit("message_edited", { id: msg._id, newText: msg.text, edited: true });
    }
  });

  // Delete message
  socket.on("delete_message", async (id) => {
    if (!socket.username) return;
    const msg = await Message.findById(id);
    if (msg && msg.user === socket.username && !msg.deleted) {
      msg.text = "*message deleted*";
      msg.deleted = true;
      await msg.save();
      io.emit("message_deleted", { id: msg._id });
    }
  });

  // File message: not stored, only broadcast
  socket.on("file_message", (data) => {
    if (!socket.username) return;
    io.emit("file_message", { ...data, user: socket.username });
  });

  // Theme change (light/dark) for logged in user
  socket.on("set_theme", async (theme) => {
    if (!socket.username) return;
    if (theme !== "light" && theme !== "dark") return;
    await User.updateOne({ username: socket.username }, { theme });
    socket.emit("theme_changed", theme);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
