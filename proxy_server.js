const express = require('express');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const net = require('net');
const createProxy = require('./fast-proxy-lite');

const app = express();
const PORT = 8000;

// Sample hashmap of accepted web applications with backend server information
const acceptedWebApps = {
  "google.com": {
    backend: "http://google.com" // Replace with the backend server's URL
  },
  "test.com": {
    backend: "http://2.2.2.2" // Replace with the backend server's URL
  },
};

// Accepted hostnames (including "localhost")
const acceptedHostnames = ["google.com", "test.com", "localhost"];

// Route to provide the list of accepted web applications
app.get('/api/webapps', (req, res) => {
  res.json(Object.keys(acceptedWebApps));
});

// Logging Middleware to log incoming requests
const logStream = fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: logStream }));

// Custom middleware to check if hostname is accepted
const checkAcceptedHostname = (req, res, next) => {
  if (!acceptedHostnames.includes(req.hostname)) {
    // Log the unauthorized hostname for debugging
    console.log(`Hostname "${req.hostname}" is not allowed.`);
    // Log the request details to the access.log file
    logStream.write(`[${new Date().toISOString()}] Hostname "${req.hostname}" is not allowed.\n`);
    return res.status(403).send('Forbidden');
  }
  next();
};

// Use the checkAcceptedHostname middleware for all routes
app.use(checkAcceptedHostname);

// Create the custom proxy
const proxy = createProxy({ base: 'http://localhost' }); // Set the default backend server URL here

// Gateway route for all requests
app.all('/*', async (req, res) => {
  const webapp = acceptedWebApps[req.headers.host];
  if (!webapp) return res.status(404).send('Not Found');
  proxy(req, res, req.url, { base: webapp.backend });
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

// Create a client socket to connect to the master socket node
const masterNodeHost = 'localhost'; // Replace this with the hostname or IP of the master socket node
const masterNodePort = 3000; // Replace this with the port number of the master socket node

const client = net.createConnection(masterNodePort, masterNodeHost, () => {
  console.log('Connected to master socket node.');

  // Optional: Do something upon successful connection to the master node if needed

  // Handle data received from the master socket node
  client.on('data', (data) => {
    // Parse the received data as JSON (assuming the server is sending JSON data)
    const newAcceptedWebApps = JSON.parse(data);
    console.log('Received updated accepted web applications:', newAcceptedWebApps);

    // Update the accepted web applications list based on the received data
    for (const app of newAcceptedWebApps) {
      acceptedWebApps[app.domain] = { backend: app.backend };
    }
  });

  // Handle the master node disconnection
  client.on('end', () => {
    console.log('Disconnected from master socket node.');
    // Optionally, you may want to gracefully shutdown the proxy server when the master node disconnects
    server.close(() => {
      console.log('Proxy server shut down gracefully.');
    });
  });

  // Handle errors
  client.on('error', (err) => {
    console.error('Socket error:', err.message);
  });
});
