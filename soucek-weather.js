import { presets as e, access as ea } from "zigbee-herdsman-converters/lib/exposes";

const KEY_MAP = {
    1: 'wind_average',
    2: 'wind_gust',
    3: 'temperature',
    4: 'humidity',
    5: 'qnh',
    6: 'temperature_device',
    7: 'rain',
};

const fz_uart_data = {
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
      }
    }
    if (typeof data !== 'string') {
      return;
    }

    // anything that is not a {"n":value} fragment (boot noise, partial
    // UART frames) is ignored instead of crashing the converter
    const fragments = data.match(/{.*?}/g);
    if (!fragments) {
      return;
    }

    // publish only the attributes actually received - zigbee2mqtt merges
    // the partial result into the device state, so missing values keep
    // their last known value instead of resetting to zero
    const result = {};
    for (const fragment of fragments) {
      let parsed;
      try {
        parsed = JSON.parse(fragment);
      } catch {
        continue;
      }
      for (const [key, property] of Object.entries(KEY_MAP)) {
        if (parsed[key] !== undefined) {
          result[property] = parsed[key];
        }
      }
    }

    // Australian apparent temperature (shade version), computed from the
    // merged state once temperature, humidity and wind have all arrived
    const { temperature, humidity, wind_average } = { ...meta.state, ...result };
    if (temperature !== undefined && humidity !== undefined && wind_average !== undefined) {
      const vp = (humidity / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
      const wsm = wind_average * 0.51444; // conversion to m/s
      result.feelslike = Math.round(temperature + (0.33 * vp) - (0.70 * wsm) - 4);
    }

    return result;
  },
};


export default {
    zigbeeModel: ['soucek-weather'],
    model: 'soucek-weather',
    vendor: 'andrejsoucek',
    description: '[Configurable firmware](https://ptvo.info/zigbee-configurable-firmware-features/)',
    fromZigbee: [fz_uart_data],
    toZigbee: [],
    exposes: [
        e.numeric('wind_average', ea.STATE).withLabel("Wind Average").withUnit("kt").withDescription('Average wind speed updated every minute.'),
        e.numeric('wind_gust', ea.STATE).withLabel("Wind Gust").withUnit("kt").withDescription('Wind gust (max win in last 10 mins)'),
        e.temperature(),
        e.numeric('temperature_device', ea.STATE).withLabel("Sensor Temperature").withUnit('°C').withDescription('BME280 sensor temperature'),
        e.humidity(),
        e.numeric('qnh', ea.STATE).withLabel("QNH").withUnit("hPa").withDescription('Calculated QNH'),
        e.rain(),
        e.numeric('feelslike', ea.STATE).withLabel("Feels Like Temperature").withUnit('°C').withDescription('Calculated feels like temperature'),
    ],
    extend: [],
};
