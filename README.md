# reverseProxyServer
A Reverse Proxy Server by Junel Maglunsod

To create a high-performant reverse proxy server in Node.js similar to the way proxy_pass works in nginx. This server should connect to a master socket node, which will return a list of accepted web applications in JSON object format (e.g., [{domain: "google.com"}, {domain: "test.com"}]). The proxy server should be able to connect to any of the web applications provided by the master node when the Host header is passed.
