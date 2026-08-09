const { createFixtureDataSource } = require("./fixtureDataSource");
const { createTeslaMateDataSource } = require("./teslamateDataSource");

function createDataSource(config) {
  if (config.dataSourceMode === "teslamate") {
    return createTeslaMateDataSource(config.teslamate);
  }

  return createFixtureDataSource();
}

module.exports = {
  createDataSource
};
