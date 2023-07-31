const express = require('express');
const httpProxy = require('http-proxy');
const socketIOClient = require('socket.io-client');
const morgan = require('morgan');
const promBundle = require('express-prom-bundle');
const redis = require('redis');

const app = express();
const PORT = 8080;

// Redis configuration
const redisClient = redis.createClient();

// Sample hashmap of accepted web applications with backend server information
const acceptedWebApps = [
  { domain: "google.com", backends: ["http://google.com"], loadBalancing: "round-robin" },
  { domain: "test.com", backends: ["http://2.2.2.2"], loadBalancing: "least-connections" },
  // Add other accepted web applications here
];

// Function to validate and sanitize the input
const isValidDomain = (domain) => {
  // Add more validation as per your requirements
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain);
};

// Create the custom proxy
const proxy = httpProxy.createProxyServer({});

// Round-robin load balancing function
const getNextBackendRoundRobin = (backends) => {
  const nextBackendIndex = backends.currentBackendIndex + 1;
  backends.currentBackendIndex = nextBackendIndex % backends.length;
  return backends[nextBackendIndex];
};

// Least connections load balancing function
const getNextBackendLeastConnections = async (backends) => {
  let minConnections = Number.MAX_VALUE;
  let selectedBackend;

  for (const backend of backends) {
    const connectionCount = await getCurrentConnectionCount(backend);
    if (connectionCount < minConnections) {
      minConnections = connectionCount;
      selectedBackend = backend;
    }
  }

  return selectedBackend;
};

// Function to get the current connection count for a backend from Redis
const getCurrentConnectionCount = (backend) => {
  return new Promise((resolve, reject) => {
    const key = `connections:${backend}`;
    redisClient.hlen(key, (err, count) => {
      if (err) {
        reject(err);
      } else {
        resolve(count);
      }
    });
  });
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

  let backend;
  if (webapp.loadBalancing === 'round-robin') {
    backend = getNextBackendRoundRobin(webapp.backends);
  } else if (webapp.loadBalancing === 'least-connections') {
    backend = await getNextBackendLeastConnections(webapp.backends);
  } else {
    return res.status(500).send('Invalid load balancing strategy');
  }

  // Proxy the request to the selected backend server
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

  // Send the accepted web applications as a JSON string to the master node
  masterNodeSocket.emit('data', JSON.stringify(acceptedWebApps));
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

masterNodeSocket.on('blockedIP', (data) => {
  try {
    // The data is already in JSON format, so we don't need to parse it again
    const blockedIP = data;
    console.log('Blocked IP:', blockedIP);

    // Refuse to serve requests from the blocked IP
    app.use((req, res, next) => {
      if (req.headers['x-forwarded-for'] === blockedIP) {
        res.status(403).send('Access Forbidden');
      } else {
        next();
      }
    });
  } catch (error) {
    console.error('Error processing blocked IP data from master socket node:', error.message);
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

// Clean up the Redis connection when the server is stopped
process.on('SIGINT', () => {
  redisClient.quit(() => {
    console.log('Redis connection closed.');
    process.exit(0);
  });
});

