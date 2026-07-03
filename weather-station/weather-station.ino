#include <BME280I2C.h>
#include <Wire.h>
#include <EnvironmentCalculations.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#define WIND_SAMPLE_INTERVAL_MS 5000
#define GUST_INTERVAL_MS 600000
#define WIND_AVERAGE_INTERVAL_MS 60000
#define ENV_SAMPLE_INTERVAL_MS 300000
#define RAIN_INTERVAL_MS 2000
#define FORCE_RAIN_UPDATE_INTERVAL_MS 60000

#define ALTITUDE_M 242 // weather station altitude to calculate QNH

#define WIND_PIN A0 // wind speed sensor, connected through the 25 V voltage divider module
#define RAIN_PIN 4  // rain sensor J1 OUT
#define TEMP_PIN 9  // DS18B20 data

float maxWindSpeed = 0;
float totalWindSpeed = 0;
unsigned int sampleCount = 0;
// timers start "already elapsed" so every measurement fires right after boot
unsigned long envStartTime = -ENV_SAMPLE_INTERVAL_MS;
unsigned long windStartTime = -WIND_SAMPLE_INTERVAL_MS;
unsigned long averageStartTime = -WIND_AVERAGE_INTERVAL_MS;
unsigned long gustStartTime = -GUST_INTERVAL_MS;
unsigned long rainCheckStartTime = -RAIN_INTERVAL_MS;
unsigned long forceRainUpdateStartTime = -FORCE_RAIN_UPDATE_INTERVAL_MS;
int lastRainValue = HIGH;

BME280I2C bme;
OneWire oneWire(TEMP_PIN);
DallasTemperature sensors(&oneWire);

// Serial is the UART link to the CC2530: anything printed here is forwarded
// to zigbee2mqtt, so only the {"n":value} JSON fragments may ever be printed.
void setup() {
  Serial.begin(9600);

  Wire.begin();
  while (!bme.begin()) {
    delay(1000);
  }

  sensors.begin();

  // J1 OUT is open collector; the internal pull-up keeps the pin defined
  // even if the sensor cable gets disconnected
  pinMode(RAIN_PIN, INPUT_PULLUP);
}

float readWindSpeed() {
  int analogValue = analogRead(WIND_PIN);
  float volts = analogValue * (25.0 / 1023.0); // divider module scales 25 V down to 5 V at the pin
  float mps = constrain(volts, 0.0, 5.0) * (30.0 / 5.0); // sensor outputs 0-5 V for 0-30 m/s
  return mps * 1.944; // convert m/s to kts
}

void loop() {
  unsigned long currentTime = millis();

  // read temperature, humidity and pressure
  if (currentTime - envStartTime >= ENV_SAMPLE_INTERVAL_MS) {
    float tempSensorC(NAN), hum(NAN), presHPa(NAN);
    bme.read(presHPa, tempSensorC, hum);

    sensors.requestTemperatures();
    float tempC = sensors.getTempCByIndex(0);

    // skip values a sensor failed to deliver: "nan" would break the JSON
    // and -127 would show up in HA as a real temperature
    if (tempC != DEVICE_DISCONNECTED_C) {
      Serial.print(F("{\"3\":"));
      Serial.print(tempC, 2);
      Serial.print(F("}"));
    }
    if (!isnan(hum)) {
      Serial.print(F("{\"4\":"));
      Serial.print(hum, 2);
      Serial.print(F("}"));
    }
    if (!isnan(presHPa) && !isnan(tempSensorC)) {
      float qnh = EnvironmentCalculations::EquivalentSeaLevelPressure(ALTITUDE_M, tempSensorC, presHPa);
      Serial.print(F("{\"5\":"));
      Serial.print(qnh, 2);
      Serial.print(F("}"));
    }
    if (!isnan(tempSensorC)) {
      Serial.print(F("{\"6\":"));
      Serial.print(tempSensorC, 2);
      Serial.print(F("}"));
    }

    envStartTime = currentTime;
  }

  // read wind speed
  if (currentTime - windStartTime >= WIND_SAMPLE_INTERVAL_MS) {
    float currentWindSpeed = readWindSpeed();
    windStartTime = currentTime;

    // save the max wind speed if a higher value is encountered
    if (currentWindSpeed > maxWindSpeed) {
      maxWindSpeed = currentWindSpeed;
    }

    totalWindSpeed += currentWindSpeed;
    sampleCount++;

    // publish the average wind speed over the last 1 minute
    if (currentTime - averageStartTime >= WIND_AVERAGE_INTERVAL_MS) {
      Serial.print(F("{\"1\":"));
      Serial.print(totalWindSpeed / sampleCount, 0);
      Serial.print(F("}"));

      // reset variables for the next 1-minute period
      totalWindSpeed = 0;
      sampleCount = 0;
      averageStartTime = currentTime;
    }
  }

  // publish the max wind speed over the last 10 minutes
  if (currentTime - gustStartTime >= GUST_INTERVAL_MS) {
    Serial.print(F("{\"2\":"));
    Serial.print(maxWindSpeed, 0);
    Serial.print(F("}"));

    // reset variables for the next 10-minute period
    maxWindSpeed = 0;
    gustStartTime = currentTime;
  }

  // read rain sensor
  if (currentTime - rainCheckStartTime >= RAIN_INTERVAL_MS) {
    int val = digitalRead(RAIN_PIN);
    bool changed = val != lastRainValue;
    bool forceUpdate = currentTime - forceRainUpdateStartTime >= FORCE_RAIN_UPDATE_INTERVAL_MS;
    if (changed || forceUpdate) {
      lastRainValue = val;
      Serial.print(val == LOW ? F("{\"7\":true}") : F("{\"7\":false}"));
      forceRainUpdateStartTime = currentTime;
    }
    rainCheckStartTime = currentTime;
  }
}
