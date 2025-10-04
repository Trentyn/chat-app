const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true 
  },
  secret: { 
    type: String, 
    required: true 
  },
  recoveryKey: { 
    type: String, 
    required: true 
  },
  verified: { 
    type: Boolean, 
    default: false 
  }
});

const messageSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true 
  },
  user: { 
    type: String, 
    required: true 
  },
  text: String,
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

module.exports = { User, Message };
