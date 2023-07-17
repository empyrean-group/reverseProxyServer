const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Create an Express app
const app = express();

// Define the proxy routes and targets
const proxyRoutes = [
  {
    route: '/api',
    target: 'http://google.com'
  },
  {
    route: '/images',
    target: 'http://images.example.com'
  }
  // Add more routes and targets as needed
];

// Create the proxy middleware for each route
proxyRoutes.forEach(({ route, target }) => {
  const options = {
    target,
    changeOrigin: true, // Required for host header and HTTPS support
    logLevel: 'debug' // Set the log level to 'debug' for detailed logging
  };
  app.use(route, createProxyMiddleware(options));
});

// Handle all other routes with a 404 response
app.use('*', (req, res) => {
  res.status(404).send('404 - Not Found');
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Reverse proxy server listening on port ${PORT}`);
});
