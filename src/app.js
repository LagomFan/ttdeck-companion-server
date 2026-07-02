const { loadConfig } = require("./config");
const { createServer } = require("./server");

const config = loadConfig(process.env);
const server = createServer({ config });

server.listen(config.port, config.bindHost, () => {
  console.log(
    `TTDeck Companion Server listening on ${config.publicBaseUrl}`
  );
  if (server.realtimeService) {
    server.realtimeService.start();
    console.log("TeslaMate MQTT realtime adapter started.");
  }
  if (server.tripNotificationMonitor) {
    server.tripNotificationMonitor.start();
    console.log("Trip push notification monitor started.");
  }
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  if (server.realtimeService) {
    await server.realtimeService.stop();
  }
  if (server.tripNotificationMonitor) {
    server.tripNotificationMonitor.stop();
  }
  if (server.pushClient) {
    server.pushClient.close();
  }
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error(error);
    process.exit(1);
  });
});
