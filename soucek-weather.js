import { presets as e, access as ea } from "zigbee-herdsman-converters/lib/exposes";

const weather = {
    "wind_average": 0,
    "wind_gust": 0,
    "temperature_device": 0,
    "temperature": 0,
    "humidity": 0,
    "qnh": 0,
    "rain": false,
    "feelslike": 0,
}

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
    weather.rain = receivedData[7] ?? weather.rain;
    
    const vp = (weather.humidity / 100) * 6.105 * Math.exp((17.27 * weather.temperature) / (237.7 + weather.temperature));
    const wsm = weather.wind_gust * 0.51444; // conversion to m/s
    const at = weather.temperature + (0.33 * vp) - (0.70 * wsm) - 4;
    weather.feelslike = Math.round(at);
    
    return weather;
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
