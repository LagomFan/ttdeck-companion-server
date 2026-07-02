const { once } = require("node:events");

async function withTestServer(createServer, testFn) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await testFn({ baseUrl });
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function getJson(baseUrl, path, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return {
    status: response.status,
    body: await response.json()
  };
}

module.exports = {
  getJson,
  withTestServer
};
