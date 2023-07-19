const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8000;

// Sample hashmap of accepted web applications
const acceptedWebApps = {
  "google.com": "http://google.com",
  "test.com": "http://test.com",
  "localhost": "https://localhost:8000" // Replace with the actual target URL you want to proxy to.
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

// Create reverse proxy middleware
const proxyMiddleware = (req, res, next) => {
  if (acceptedHostnames.includes(req.hostname)) {
    const target = acceptedWebApps[req.hostname];
    // Log the proxy activity for debugging
    console.log(`Proxying request for ${req.hostname} to ${target}`);
    // Log the request details to the access.log file
    logStream.write(`[${new Date().toISOString()}] Proxying request for ${req.hostname} to ${target}\n`);
    return createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
  } else {
    // Log the unauthorized hostname for debugging
    console.log(`Hostname "${req.hostname}" is not allowed.`);
    // Log the request details to the access.log file
    logStream.write(`[${new Date().toISOString()}] Hostname "${req.hostname}" is not allowed.\n`);
    res.status(403).send('Forbidden');
  }
};

// Use the proxy middleware for all routes
app.use(proxyMiddleware);

// Error handling middleware for other unhandled errors
app.use((err, req, res, next) => {
  console.error(`Unhandled Error: ${err.message}`);
  // Log the error to the access.log file
  logStream.write(`[${new Date().toISOString()}] Unhandled Error: ${err.message}\n`);
  res.status(500).send('Internal Server Error');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Reverse proxy server is running on port ${PORT}`);
});
