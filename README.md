
V článku se dozvíte, jak si sestavit vlastní meteostanici založenou na Arduino Nano a jak ji připojit do své Zigbee sítě a integrovat v systému Home Assisstant.
Pro jednoduchost budeme sestavovat meteostanici měřící rychlost větru, teplotu, atmosférický tlak a relativní vlhkost.

# Komponenty
- Arduino Nano Clone
https://www.aliexpress.com/item/1005003041312268.html
- CC2530
https://www.aliexpress.com/item/33029110421.html
- BME280
https://www.aliexpress.com/item/1005005450438641.html
- Anemometer 0-5V
https://www.aliexpress.com/item/1005003040267066.html
- Voltage Sensor
https://www.aliexpress.com/item/32556523770.html
- CC Debugger
https://www.aliexpress.com/item/32901173622.htm
- 12 V Power Supply

# Zapojení
TBD

# Zprovoznění

## CC2530
CC2530 je nutné naprogramovat. Pro flashování tohoto zařízení je nutný CC Debugger, používaný i pro flashování CC2531. Pro vytvoření firmwaru použijeme software [PTVO](https://ptvo.info/zigbee-configurable-firmware-features/). Jeho nastavení bude jednoduché, jelikož pro příjem dat budeme používat UART. UART sběrnice slouží k sériovému přenosu dat, přičemž je možné data přenášet i v textové podobě, my použijeme JSON formát. 
Nastavení PTVO (včetně Expert tabu):
Po vytvoření firmwaru si exportujeme converter pro zigbee2mqtt.
CC Debugger zapojení s CC2530:
CC Debugger musí po připojení s CC2530 svítit zeleně. Pokud svítí červeně i po stisku tlačítka Reset, není zapojení správné.
Firmware jsem nahrával pomocí nástroje [cc-tool](https://github.com/dashesy/cc-tool). Pro Windows je nutné použít Texas Instrument FLASH-PROGRAMMER v1. Flash Programmer 2 nebude fungovat.
Po nahrání firmware odpojíme CC2530 od Debuggeru a dokončíme nastavení Arduina.

## Arduino
Arduino bude zastávat funkci sběru a zpracování dat, bude provádět výpočty a hodnoty posílat do CC2530, které se postará o odeslání naměřených údajů do sitě Zigbee.

### Komunikační protokol
Jak bylo zmíněno, pro poslání dat bude sloužit formát JSON. Abychom předešli posílání nepodporovaných znaků, nebo dlouhým zprávám, použijeme JSON následujícího formátu:
{
   "1": number, // rychlost větru
   "2": number, // nárazy větru
   "3": number, // teplota
   "4": number, // tlak
   "5": number  // vlhkost
}
Každý z těchto atributů je možné poslat i samostatně.

### Rychlost větru 
Anemometr posílá na výstup napětí mezi 0 a 5 volty, které znamenají vítr mezi 0 a 30 m/s. 
Postačí tedy namapovat 0-5 na 0-30 jednoduchou funkcí map(). Výsledkem bude rychlost větru v metrech za sekundu.
Výsledkem měření rychlosti větru budou dvě hodnoty - průměrná rychlost a rychlost v nárazech.
Průměrnou rychlost počítám měřením aktuální rychlosti každých 5 sekund a každou minutu tyto naměřené hodnoty zprůměruji.
Rychlost v nárazech ukazuje nejvyšší rychlost větru za posledních 10 minut.

### Teplota, tlak, vlhkost 
Senzor BME280 je možné připojit přes I2C na piny Arduina. Každých 5 minut budou hodnoty odečteny a poslány do CC2530.

### UART
Arduino Nano má defaultně pin 0 nastaven na sériovou komunikaci. Tento pin použijeme pro posílání dat do CC2530.

# Integrace s HA
V Home Assistant máme nainstalované doplňky Zigbee2MQTT a MQTT Explorer.
Converter, který jsme si exportovali při vytváření firmwaru vložíme do konfigurační složky zigbee2mqtt. Více info: https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html
Povolíme připojení nových zařízení a zapneme Arduino. Během chvíle (max 2 minut) by se mělo zobrazit nové zařízení jako podporované (díky externímu konverteru). V Zigbee2MQTT, záložka Logs, přepneme zobrazování tak, aby byly zobrazeny Debug logy. Po minutě by měly chodit zprávy tohoto typu:
Info 2023-09-05 01:10:41MQTT publish: topic 'zigbee2mqtt/[name]', payload '{"action":"{\"1\": 0}","linkquality":148}'
Info 2023-09-05 01:10:41MQTT publish: topic 'zigbee2mqtt/[name]', payload '{"action":"","linkquality":148}'
Info 2023-09-05 01:10:41MQTT publish: topic 'zigbee2mqtt/[name]/action', payload '{"1": 0}'

Jak je vidět, přichází zpráva o rychlosti větru a okamžitě za ní jde další, která hodnotu maže. Abychom mohli entitu v HA používat bez toho, aniž by se jí data nulovala, musíme si vytvořit v configuration.yaml pod klíčem mqtt následující sensor (defaultně vytvořenou entitu v HA můžeme zakázat):
mqtt:
    sensor:
        - state_topic: "zigbee2mqtt/meteo/action"
          name: "Current Wind"
          value_template: '{{ value_json["1"] }}'
          unit_of_measurement: "m/s"
          přidat availability

Totéž uděláme pro zbytek hodnot posílaných pod klíči 2 až 4.

# Možné problémy
Pokud něco nefunguje, jak má, najdete ve většině případů debug zprávy v logu zigbee2mqtt addonu.
## No converter available 
Converter, který jste exportovali z PTVO jste buď nahráli jinam, než je zigbee2mqtt očekává, nebo není správně vytvořen.
## Payload je změť čísel
Log vypadá podobně jako MQTT publish: topic 'zigbee2mqtt/meteo/action', payload '73,110,112,117,116,32,86,111,108,116,97,103,101,32,61,32,48,46,48,48,13,10,87,105,110,100,32,83,112,101,101,100,32,61,32,48,46,48,48,13,10,72,105
Data obsahují nepodporované znaky, zkontrolujte, jaký vytváříte a posílate JSON z Arduina.
## Zařízení se v Zigbee2mqtt tváří jinak, než jsem nakonfiguroval v Expert záložce v PTVO
Addon má zařízení uložené v cachi, odstraňte zařízení ze zigbee2mqtt, smažte devices_backup.json v zigbee2mqtt adresáři, restartujte doplněk a znovu přidejte CC2530 do sítě. Párování spustíte tak, že C2530 4x za sebou vypnete a zapnete (odpojíte a připojíte VCC).

