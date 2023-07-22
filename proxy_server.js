const express = require('express');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const httpProxy = require('http-proxy');
const socketIOClient = require('socket.io-client'); // Use the correct module

const app = express();
const PORT = 8080;

// Sample hashmap of accepted web applications with backend server information
const acceptedWebApps = {
  "google.com": {
    backend: "http://google.com" // Replace with the backend server's URL
  },
  "test.com": {
    backend: "http://2.2.2.2" // Replace with the backend server's URL
  },
};

// ... (rest of the code remains the same)

// Create the custom proxy
const proxy = httpProxy.createProxyServer({});

// Gateway route for all requests
app.all('/*', async (req, res) => {
  const webapp = acceptedWebApps[req.headers.host];
  if (!webapp) return res.status(404).send('Not Found');

  // Proxy the request to the backend server
  proxy.web(req, res, {
    target: webapp.backend,
    changeOrigin: true,
  });
});

// Error handling middleware for other unhandled errors
app.use((err, req, res, next) => {
  console.error(`Unhandled Error: ${err.message}`);
  // Log the error to the access.log file
  logStream.write(`[${new Date().toISOString()}] Unhandled Error: ${err.message}\n`);
  res.status(500).send('Internal Server Error');
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Reverse proxy server is running on port ${PORT}`);
});

// Create a socket.io client to connect to the master socket node
const masterNodeHost = 'localhost'; // Replace this with the hostname or IP of the master socket node
const masterNodePort = 3000; // Replace this with the port number of the master socket node

const masterNodeSocket = socketIOClient(`http://${masterNodeHost}:${masterNodePort}`); // Use socketIOClient here

masterNodeSocket.on('connect', () => {
  console.log('Connected to master socket node.');

  // Optional: Do something upon successful connection to the master node if needed
});

masterNodeSocket.on('data', (data) => {
  // Parse the received data as JSON (assuming the server is sending JSON data)
  const newAcceptedWebApps = JSON.parse(data);
  console.log('Received updated accepted web applications:', newAcceptedWebApps);

  // Update the accepted web applications list based on the received data
  for (const app of newAcceptedWebApps) {
    acceptedWebApps[app.domain] = { backend: app.backend };
  }
});

masterNodeSocket.on('disconnect', () => {
  console.log('Disconnected from master socket node.');
  // Optionally, you may want to gracefully shutdown the proxy server when the master node disconnects
  server.close(() => {
    console.log('Proxy server shut down gracefully.');
  });
});

masterNodeSocket.on('error', (err) => {
  console.error('Socket error:', err.message);
});
