const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { User, Message } = require('./models/user');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 200 * 1024 * 1024
});

// Replace with your MongoDB Atlas connection string
const MONGODB_URI = process.env.MONGODB_URI || 'your_mongodb_atlas_uri';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));
app.use(express.static("public"));

const usernames = new Set();

async function cleanOldMessages() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await Message.deleteMany({ 
    timestamp: { $lt: oneDayAgo },
    type: 'text'
  });
}
setInterval(cleanOldMessages, 60 * 60 * 1000);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join", async (data) => {
    const { username, token } = data;
    
    try {
      const user = await User.findOne({ username });
      
      if (!user) {
        // New user registration
        const secret = speakeasy.generateSecret();
        const recoveryKey = crypto.randomBytes(20).toString('hex');
        
        const newUser = new User({
          username,
          secret: secret.base32,
          recoveryKey,
          verified: false
        });
        
        await newUser.save();
        
        // Generate QR code
        const otpauth_url = speakeasy.otpauthURL({
          secret: secret.base32,
          label: username,
          issuer: 'ChatApp'
        });
        
        QRCode.toDataURL(otpauth_url, (err, dataUrl) => {
          socket.emit("setup_2fa", {
            qrCode: dataUrl,
            recoveryKey,
            message: "Please scan this QR code with Google Authenticator"
          });
        });
        
        return;
      }
      
      // Existing user verification
      const verified = speakeasy.totp.verify({
        secret: user.secret,
        encoding: 'base32',
        token: token
      });
      
      if (!verified) {
        socket.emit("auth_failed");
        return;
      }
      
      if (usernames.has(username)) {
        socket.emit("username taken");
        return;
      }

      usernames.add(username);
      socket.username = username;
      
      const messages = await Message.find({ type: 'text' })
        .sort({ timestamp: -1 })
        .limit(100);
      
      socket.emit("chat history", messages);
      socket.emit("joined");
    } catch (err) {
      console.error('Auth error:', err);
      socket.emit("auth_error", "Authentication failed");
    }
  });

  socket.on("chat message", async (data) => {
    const msg = new Message({
      type: "text",
      user: data.user,
      text: data.text
    });
    
    await msg.save();
    io.emit("chat message", msg);
  });

  socket.on("file message", (data) => {
    io.emit("file message", data);
  });

  socket.on("recover_account", async (data) => {
    const { username, recoveryKey } = data;
    
    try {
      const user = await User.findOne({ 
        username, 
        recoveryKey 
      });
      
      if (user) {
        // Generate new secret and QR code
        const secret = speakeasy.generateSecret();
        const newRecoveryKey = crypto.randomBytes(20).toString('hex');
        
        user.secret = secret.base32;
        user.recoveryKey = newRecoveryKey;
        await user.save();
        
        const otpauth_url = speakeasy.otpauthURL({
          secret: secret.base32,
          label: username,
          issuer: 'ChatApp'
        });
        
        QRCode.toDataURL(otpauth_url, (err, dataUrl) => {
          socket.emit("recovery_success", {
            qrCode: dataUrl,
            recoveryKey: newRecoveryKey,
            message: "Account recovered. Please scan new QR code"
          });
        });
      } else {
        socket.emit("recovery_failed");
      }
    } catch (err) {
      console.error('Recovery error:', err);
      socket.emit("recovery_error", "Recovery failed");
    }
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
