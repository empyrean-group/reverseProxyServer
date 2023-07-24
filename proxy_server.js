const express = require('express');
const httpProxy = require('http-proxy');
const socketIOClient = require('socket.io-client');

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

// Function to validate and sanitize the input
const isValidDomain = (domain) => {
  // Add more validation as per your requirements
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
};

// Create the custom proxy
const proxy = httpProxy.createProxyServer({});

// Gateway route for all requests
app.all('/*', async (req, res) => {
  const host = req.headers.host;
  if (!isValidDomain(host)) return res.status(400).send('Invalid Host'); // Validate the domain

  const webapp = acceptedWebApps[host];
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

const masterNodeSocket = socketIOClient(`http://${masterNodeHost}:${masterNodePort}`);

masterNodeSocket.on('connect', () => {
  console.log('Connected to master socket node.');
});

masterNodeSocket.on('data', (data) => {
  try {
    // Parse the received data as JSON (assuming the server is sending JSON data)
    const newAcceptedWebApps = JSON.parse(data);
    console.log('Received updated accepted web applications:', newAcceptedWebApps);

    // Validate the received data format
    if (!Array.isArray(newAcceptedWebApps)) {
      throw new Error('Invalid data format received from master socket node. Expected an array.');
    }

    // Validate each object in the array
    for (const app of newAcceptedWebApps) {
      if (!app.domain || !isValidDomain(app.domain) || !app.backend) {
        throw new Error('Invalid data format received from master socket node. Each object should have "domain" and "backend" properties.');
      }
    }

    // Update the accepted web applications list based on the received data
    for (const app of newAcceptedWebApps) {
      acceptedWebApps[app.domain] = { backend: app.backend };
    }
  } catch (error) {
    console.error('Error processing data from master socket node:', error.message);
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
