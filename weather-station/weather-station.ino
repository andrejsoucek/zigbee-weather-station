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

float maxWindSpeed = 0;
float totalWindSpeed = 0;
unsigned int sampleCount = 0;
unsigned long envStartTime = -ENV_SAMPLE_INTERVAL_MS;
unsigned long windStartTime = -WIND_SAMPLE_INTERVAL_MS;
unsigned long averageStartTime = -WIND_AVERAGE_INTERVAL_MS0;
unsigned long gustStartTime = -GUST_INTERVAL_MS;
unsigned long rainCheckStartTime = -RAIN_INTERVAL_MS;
unsigned long forceRainUpdateStartTime = -FORCE_RAIN_UPDATE_INTERVAL_MS;
int lastRainValue = 1;

BME280I2C bme;
OneWire oneWire(9); // temperature sensor pin - D9
DallasTemperature sensors(&oneWire);

void setup() {
  // initiate serial communication with 9600 baud rate
  Serial.begin(9600);

  while(!Serial) {
    Serial.println("Waiting for serial port to connect...");
    delay(1000);
  }

  Wire.begin();
  while(!bme.begin())
  {
    Serial.println("Could not find BME280 sensor!");
    delay(1000);
  }

  sensors.begin();
  Serial.println("Sensors ready!");

  pinMode(4, INPUT);
  Serial.println("Weather station initialized!");

  unsigned long time = millis();
  windStartTime = time;
  gustStartTime = time;
  averageStartTime = time;
  envStartTime = time;
  rainCheckStartTime = time;
  forceRainUpdateStartTime = time;
}

double readWindSpeed() {
  int analogValue = analogRead(A0); // wind speed sensor pin - A0
  double voltage = map(analogValue, 0, 1023, 0, 2500); // map 1024 values to 25 V with 2 decimals precision
  double mps = map(voltage, 0, 500, 0, 3000); // map 500 values (5V) to 30 m/s with 2 decimals precision
  mps /= 100; // divide by 100 to get the m/s with 2 decimals

  return mps * 1.944; // convert m/s to kts
}

void loop() {
  unsigned long currentTime = millis();

  // read temperature, humidity and pressure
  if (currentTime - envStartTime >= ENV_SAMPLE_INTERVAL_MS) {
    float tempSensorC(NAN), hum(NAN), presHPa(NAN);
    bme.read(presHPa, tempSensorC, hum);
    float qnh = EnvironmentCalculations::EquivalentSeaLevelPressure(ALTITUDE_M, tempSensorC, presHPa);

    sensors.requestTemperatures();
    float tempC = sensors.getTempCByIndex(0);

    Serial.print("{\"3\":" + String(tempC, 2) + ",\"4\":" + hum + ",\"5\":" + qnh + ",\"6\":" + tempSensorC + "}");

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

    // save the wind speed for average calculations
    if (currentTime - averageStartTime <= WIND_AVERAGE_INTERVAL_MS) {
      totalWindSpeed += currentWindSpeed;
      sampleCount++;
    } else {
      // calculate the average wind speed over the last 1 minute
      if (sampleCount > 0) {
        float averageWindSpeed = totalWindSpeed / sampleCount;
        String averageWindSpeedStr = String(averageWindSpeed, 0);
        Serial.print("{\"1\":" + averageWindSpeedStr + "}");
      }

      // reset variables for the next 1-minute period
      totalWindSpeed = 0;
      sampleCount = 0;
      averageStartTime = currentTime;
    }
  }

  // check if the 10-minute gust measurement period has elapsed
  if (currentTime - gustStartTime >= GUST_INTERVAL_MS) {
    String maxWindSpeedStr = String(maxWindSpeed, 0);
    Serial.print("{\"2\":" + maxWindSpeedStr + "}");

    // reset variables for the next 10-minute period
    maxWindSpeed = 0;
    gustStartTime = currentTime;
  }

  // read rain sensor
  if (currentTime - rainCheckStartTime >= RAIN_INTERVAL_MS) {
    int val = digitalRead(4);
    if (lastRainValue != val) {
      lastRainValue = val;
      String isRaining = lastRainValue == LOW ? "true" : "false";
      Serial.print("{\"7\":" + isRaining + "}");
    }
    if (currentTime - forceRainUpdateStartTime >= FORCE_RAIN_UPDATE_INTERVAL_MS) {
      String isRaining = val == LOW ? "true" : "false";
      Serial.print("{\"7\":" + isRaining + "}");
    }
    rainCheckStartTime = currentTime;
    forceRainUpdateStartTime = currentTime;
  }
}
