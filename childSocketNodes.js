const socketIO = require('socket.io-client');
const os = require('os');

const masterNodeHost = 'localhost'; // Replace this with the hostname or IP of the master socket node
const masterNodePort = 3000; // Replace this with the port number of the master socket node

const socket = socketIO(`http://${masterNodeHost}:${masterNodePort}`);

socket.on('connect', () => {
  console.log('Child socket node connected to master node.');
});

// Function to get the current timestamp in milliseconds
const getCurrentTimestamp = () => new Date().getTime();

// Variables to track connection count per IP and the last connection timestamp
const connectionsPerIP = {};
const lastConnectionTimestamp = {};

// Function to calculate connections per second
const calculateConnectionsPerSecond = () => {
  const currentTimestamp = getCurrentTimestamp();
  for (const ip in connectionsPerIP) {
    const count = connectionsPerIP[ip].filter((timestamp) => currentTimestamp - timestamp < 1000).length;
    delete connectionsPerIP[ip];
    if (count > 0) {
      console.log(`Connections per second for IP ${ip}: ${count}`);
      socket.emit('data', { ip, connectionsPerSecond: count });
    }
  }
};

// Function to handle a new connection
const handleNewConnection = (ip) => {
  if (!connectionsPerIP[ip]) {
    connectionsPerIP[ip] = [];
  }
  connectionsPerIP[ip].push(getCurrentTimestamp());
};

// Function to handle disconnection
const handleDisconnection = (ip) => {
  if (connectionsPerIP[ip]) {
    calculateConnectionsPerSecond();
  }
};

// Socket events
socket.on('connect', () => {
  console.log('Child socket node connected to master node.');

  // Broadcast the system information to the master node on connection
  const systemInfo = {
    hostname: os.hostname(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    loadAverage: os.loadavg(),
  };
  socket.emit('data', { systemInfo });
});

socket.on('disconnect', () => {
  console.log('Child socket node disconnected from master node.');
});

socket.on('error', (err) => {
  console.error('Socket error:', err.message);
});

// Add an event listener for a new connection
socket.on('newConnection', (data) => {
  const { ip } = data;
  handleNewConnection(ip);
});

// Add an event listener for a disconnection
socket.on('disconnection', (data) => {
  const { ip } = data;
  handleDisconnection(ip);
});
