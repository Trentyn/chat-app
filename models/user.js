const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  secret: { type: String, required: true },
  recoveryKey: { type: String, required: true },
  theme: { type: String, enum: ["light", "dark"], default: "light" }
});

const messageSchema = new mongoose.Schema({
  type: { type: String, required: true },
  user: { type: String, required: true },
  text: String,
  timestamp: { type: Date, default: Date.now }
});

exports.User = mongoose.model("User", userSchema);
exports.Message = mongoose.model("Message", messageSchema);
