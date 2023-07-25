const express = require('express');
const httpProxy = require('http-proxy');
const socketIOClient = require('socket.io-client');
const morgan = require('morgan');
const promBundle = require('express-prom-bundle'); // Import the prometheus middleware

const app = express();
const PORT = 8080;

// Sample hashmap of accepted web applications with backend server information
const acceptedWebApps = {
  "google.com": {
    backends: ["http://google.com"], // Replace with the backend server's URLs (an array for load balancing)
    currentBackendIndex: 0, // Index to keep track of the last used backend server
  },
  "test.com": {
    backends: ["http://2.2.2.2"], // Replace with the backend server's URLs (an array for load balancing)
    currentBackendIndex: 0, // Index to keep track of the last used backend server
  },
  // Add other accepted web applications here
};

// Function to validate and sanitize the input
const isValidDomain = (domain) => {
  // Add more validation as per your requirements
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
};

// Create the custom proxy
const proxy = httpProxy.createProxyServer({});

// Round-robin load balancing function
const getNextBackend = (backends) => {
  const nextBackendIndex = backends.currentBackendIndex + 1;
  backends.currentBackendIndex = nextBackendIndex % backends.length;
  return backends[nextBackendIndex];
};

// Custom format for morgan logging
morgan.token('custom-remote-addr', (req) => {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
});

// Custom format for morgan logging
morgan.token('custom-response-status', (req, res) => {
  return res.statusCode;
});

// Setup morgan logging middleware
app.use(morgan(':date[iso] :remote-addr ":method :url HTTP/:http-version" :status :res[content-length] - :response-time ms'));

// Setup Prometheus middleware
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  promClient: {
    collectDefaultMetrics: {
      timeout: 5000, // Interval to collect default metrics (e.g., CPU, memory, etc.)
    },
  },
});
app.use(metricsMiddleware);

// Gateway route for all requests
app.all('/*', async (req, res) => {
  const host = req.headers.host;
  if (!isValidDomain(host)) return res.status(400).send('Invalid Host'); // Validate the domain

  const webapp = acceptedWebApps[host];
  if (!webapp) return res.status(404).send('Not Found');

  const backend = getNextBackend(webapp.backends);

  // Proxy the request to the backend server
  proxy.web(req, res, {
    target: backend,
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
      if (!app.domain || !isValidDomain(app.domain) || !app.backends || !Array.isArray(app.backends)) {
        throw new Error('Invalid data format received from master socket node. Each object should have "domain" and "backends" properties, where "backends" is an array of backend server URLs.');
      }
    }

    // Update the accepted web applications list based on the received data
    for (const app of newAcceptedWebApps) {
      acceptedWebApps[app.domain] = { backends: app.backends, currentBackendIndex: 0 };
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
