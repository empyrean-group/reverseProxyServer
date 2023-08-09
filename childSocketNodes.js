const socketIOClient = require('socket.io-client');
const morgan = require('morgan');
const express = require('express');
const app = express();
const PORT = 8081; // Change this to your desired port number

const masterNodeHost = 'localhost'; // Replace this with the hostname or IP of the master socket node
const masterNodePort = 3000; // Replace this with the port number of the master socket node

const blockedIPs = new Set();

// Middleware for checking blocked IPs and refusing requests
app.use((req, res, next) => {
  const remoteAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  if (blockedIPs.has(remoteAddr)) {
    console.log(`Refused request from blocked IP: ${remoteAddr}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

const server = app.listen(PORT, () => {
  console.log(`Child socket node is running on port ${PORT}`);
});

// Create a socket.io client to connect to the master socket node
const masterNodeSocket = socketIOClient(`http://${masterNodeHost}:${masterNodePort}`);

masterNodeSocket.on('connect', () => {
  console.log('Connected to master socket node.');

  // Send a message to the master node that the child node is ready to receive blocked IP information
  masterNodeSocket.emit('childReady');
});

masterNodeSocket.on('blockedIP', (ip) => {
  console.log(`Received blocked IP information: ${ip}`);
  blockedIPs.add(ip);
});

masterNodeSocket.on('connectionData', (data) => {
  try {
    const connectionData = JSON.parse(data);
    console.log('Received connection data:', connectionData);
    // Process connection data as needed
  } catch (error) {
    console.error('Error processing connection data:', error.message);
  }
});

masterNodeSocket.on('disconnect', () => {
  console.log('Disconnected from master socket node.');
});

masterNodeSocket.on('error', (err) => {
  console.error('Socket error:', err.message);
});
