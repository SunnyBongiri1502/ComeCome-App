const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

let waitingQueue = [];
let activePairs = {};
let profiles = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-match', (profile) => {
    profiles[socket.id] = profile;
    waitingQueue = waitingQueue.filter(id => id !== socket.id);

    if (waitingQueue.length > 0) {
      const partnerId = waitingQueue.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);

      if (partnerSocket) {
        activePairs[socket.id] = partnerId;
        activePairs[partnerId] = socket.id;

        socket.emit('matched', {
          partnerId: partnerId,
          partnerProfile: profiles[partnerId],
          initiator: true
        });
        partnerSocket.emit('matched', {
          partnerId: socket.id,
          partnerProfile: profile,
          initiator: false
        });
      } else {
        waitingQueue.push(socket.id);
      }
    } else {
      waitingQueue.push(socket.id);
      socket.emit('waiting');
    }
  });

  socket.on('cancel-find', () => {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('end-call', () => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('call-ended');
      delete activePairs[partnerId];
    }
    delete activePairs[socket.id];
  });

  socket.on('disconnect', () => {
    waitingQueue = waitingQueue.filter(id => id !== socket.id);
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('call-ended');
      delete activePairs[partnerId];
    }
    delete activePairs[socket.id];
    delete profiles[socket.id];
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
