const zigbeeHerdsmanConverters = require('zigbee-herdsman-converters');
const zigbeeHerdsmanUtils = require('zigbee-herdsman-converters/lib/utils');


const exposes = zigbeeHerdsmanConverters.exposes;
const ea = exposes.access;
const e = exposes.presets;
const fz = zigbeeHerdsmanConverters.fromZigbeeConverters;
const tz = zigbeeHerdsmanConverters.toZigbeeConverters;

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

    return {
      action: JSON.stringify(Object.assign({}, ...data.match(/{.*?}/g).map(JSON.parse))),
    };
  },
};


const device = {
    zigbeeModel: ['soucek-weather'],
    model: 'soucek-weather',
    vendor: 'andrejsoucek',
    description: '[Configurable firmware](https://ptvo.info/zigbee-configurable-firmware-features/)',
    fromZigbee: [fz.ignore_basic_report, fz.ptvo_switch_uart,],
    toZigbee: [],
    exposes: [exposes.text('action', ea.STATE_SET).withDescription('data from UART'),
],
    meta: {
        multiEndpoint: true,
        
    },
    endpoint: (device) => {
        return {
            l1: 1, action: 1,
        };
    },
    configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint = device.getEndpoint(1);
      await endpoint.read('genBasic', ['modelId', 'swBuildId', 'powerSource']);
    },

};

module.exports = device;
