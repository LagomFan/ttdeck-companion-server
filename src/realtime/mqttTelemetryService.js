const mqtt = require("mqtt");

class MqttTelemetryService {
  constructor({ config, store, mqttModule = mqtt }) {
    this.config = config;
    this.store = store;
    this.mqtt = mqttModule;
    this.client = null;
    this.started = false;
  }

  start() {
    if (!this.config.enabled || this.started) {
      return;
    }

    this.started = true;
    this.store.setConnection({
      connected: false,
      lastError: null
    });

    const client = this.mqtt.connect(this.config.url, {
      username: this.config.username || undefined,
      password: this.config.password || undefined,
      connectTimeout: this.config.connectTimeoutMs,
      reconnectPeriod: this.config.reconnectPeriodMs,
      clean: true
    });
    this.client = client;

    client.on("connect", () => {
      this.store.setConnection({
        connected: true,
        lastError: null
      });
      client.subscribe(`${this.config.topicPrefix}/+/+`, { qos: 0 }, (error) => {
        if (error) {
          this.store.setError(error.message);
        }
      });
    });

    client.on("reconnect", () => {
      this.store.setConnection({ connected: false });
    });

    client.on("close", () => {
      this.store.setConnection({ connected: false });
    });

    client.on("offline", () => {
      this.store.setConnection({ connected: false });
    });

    client.on("error", (error) => {
      this.store.setError(error.message);
    });

    client.on("message", (topic, payload) => {
      this.store.applyTopic(topic, payload);
    });
  }

  stop() {
    if (!this.client) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const client = this.client;
      this.client = null;
      this.started = false;
      client.end(false, {}, () => {
        this.store.setConnection({ connected: false });
        resolve();
      });
    });
  }
}

function createMqttTelemetryService({ config, store }) {
  return new MqttTelemetryService({ config, store });
}

module.exports = {
  MqttTelemetryService,
  createMqttTelemetryService
};
