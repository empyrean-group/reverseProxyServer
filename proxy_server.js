const express = require('express');
const httpProxy = require('http-proxy');
const socketIOClient = require('socket.io-client');
const morgan = require('morgan');
const promBundle = require('express-prom-bundle');
const redis = require('redis');

const app = express();
const PORT = 8080;

const acceptedWebApps = [
  { domain: "google.com", backends: ["http://google.com"] },
  { domain: "test.com", backends: ["http://2.2.2.2"] },
  // Add other accepted web applications here
];

// Create the custom proxy
const proxy = httpProxy.createProxyServer({});

// Function to validate and sanitize the input
const isValidDomain = (domain) => {
  // Add more validation as per your requirements
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
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

// Middleware for connection tracking using Redis
const redisClient = redis.createClient();

app.use(async (req, res, next) => {
  const remoteAddr = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const currentTimestamp = Math.floor(Date.now() / 1000); // Get current timestamp in seconds
  const connectionKey = `connections:${remoteAddr}`;

  // Increment connection count for the IP address and set an expiration of 1 second
  redisClient.multi()
    .hincrby(connectionKey, currentTimestamp, 1)
    .expire(connectionKey, 1)
    .exec((err, replies) => {
      if (err) {
        console.error('Error tracking connection in Redis:', err.message);
      }
    });

  next();
});

// Gateway route for all requests
app.all('/*', async (req, res) => {
  const host = req.headers.host;

  const webapp = acceptedWebApps.find((app) => app.domain === host);
  if (!webapp) return res.status(404).send('Not Found');

  const backend = webapp.backends[0]; // Using the first backend for simplicity, you can implement load balancing here.

  // Proxy the request to the backend server
  proxy.web(req, res, {
    target: backend,
    changeOrigin: true,
  });
});

// Error handling middleware for other unhandled errors
app.use((err, req, res, next) => {
  console.error(`Unhandled Error: ${err.message}`);
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

  // Send only the accepted web applications array to the master node
  masterNodeSocket.emit('data', acceptedWebApps);
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

// Clean up the Redis connection when the server is stopped   
process.on('SIGINT', () => {
  redisClient.quit(() => {
    console.log('Redis connection closed.');
    process.exit(0);
  });
});
