const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8000;

// Sample hashmap of accepted web applications
const acceptedWebApps = {
  "google.com": "http://google.com",
  "test.com": "http://test.com"
};

// Route to provide the list of accepted web applications
app.get('/api/webapps', (req, res) => {
  res.json(Object.keys(acceptedWebApps));
});

// Create reverse proxy middleware
const proxyMiddleware = (req, res, next) => {
  const target = acceptedWebApps[req.hostname];
  if (target) {
    return createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
  } else {
    res.status(404).send('Not Found');
  }
};

// Use the proxy middleware for all routes
app.use(proxyMiddleware);

// Start the server
app.listen(PORT, () => {
  console.log(`Reverse proxy server is running on port ${PORT}`);
});
