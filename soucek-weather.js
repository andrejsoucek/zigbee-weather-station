const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const zigbeeHerdsmanUtils = require('zigbee-herdsman-converters/lib/utils');


const exposes = zigbeeHerdsmanConverters.exposes;
const ea = exposes.access;
const e = exposes.presets;
const fz = zigbeeHerdsmanConverters.fromZigbeeConverters;
const tz = zigbeeHerdsmanConverters.toZigbeeConverters;

const weather = {
    "wind_average": 0,
    "wind_gust": 0,
    "temperature_device": 0,
    "temperature": 0,
    "humidity": 0,
    "qnh": 0
}

fz.ptvo_switch_uart = {
  cluster: 'genMultistateValue',
  type: ['attributeReport', 'readResponse'],
  convert: (model, msg, publish, options, meta) => {
    let data = msg.data['stateText'];
    if (typeof data === 'object') {
      let bHex = false;
      let code;
      let index;
      for (index = 0; index < data.length; index += 1) {
        code = data[index];
        if (code < 32 || code > 127) {
          bHex = true;
          break;
        }
      }
      if (!bHex) {
        data = data.toString('latin1');
      } else {
        data = [...data];
      }
    }
    
    const receivedData = Object.assign({}, ...data.match(/{.*?}/g).map(JSON.parse));
    weather.wind_average = receivedData[1] ?? weather.wind_average;
    weather.wind_gust = receivedData[2] ?? weather.wind_gust;
    weather.temperature = receivedData[3] ?? weather.temperature;
    weather.humidity = receivedData[4] ?? weather.humidity;
    weather.qnh = receivedData[5] ?? weather.qnh;
    weather.temperature_device = receivedData[6] ?? weather.temperature_device;
    
    return weather;
  },
};


const device = {
    zigbeeModel: ['soucek-weather'],
    model: 'soucek-weather',
    vendor: 'andrejsoucek',
    description: '[Configurable firmware](https://ptvo.info/zigbee-configurable-firmware-features/)',
    fromZigbee: [fz.ignore_basic_report, fz.ptvo_switch_uart,],
    toZigbee: [],
    exposes: [
        exposes.numeric('wind_average', ea.STATE).withLabel("Wind Average").withUnit("kt").withDescription('Average wind speed updated every minute.'),
        exposes.numeric('wind_gust', ea.STATE).withLabel("Wind Gust").withUnit("kt").withDescription('Wind gust (max win in last 10 mins)'),
        e.temperature(),
        exposes.numeric('temperature_device', ea.STATE).withLabel("Sensor Temperature").withUnit('°C').withDescription('BME280 sensor temperature'),
        e.humidity(),
        exposes.numeric('qnh', ea.STATE).withLabel("QNH").withUnit("hPa").withDescription('Calculated QNH'),
    ],
    meta: {
        multiEndpoint: true,
    },
    endpoint: (device) => {
        return {
            l1: 1, wind_average: 1, wind_gust: 1, temperature: 1, humidity: 1, qnh: 1, temperature_device: 1
        };
    },
    configure: async (device, coordinatorEndpoint, logger) => {
        const endpoint = device.getEndpoint(1);
        await endpoint.read('genBasic', ['modelId', 'swBuildId', 'powerSource']);
    },

};

module.exports = device;

