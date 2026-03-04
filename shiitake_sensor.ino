#include "secrets.h"
#include <ESP8266WiFi.h>
#include <WiFiClientSecure.h>
#include <ESP8266HTTPClient.h>
#include <DHTesp.h>

WiFiClientSecure client;

#define LED_PIN 5
#define LED_HOT 15
#define LED_COLD 13
#define BUZZER_PIN 12

const char* ssid = SECRET_SSID;
const char* password = SECRET_PASS;
const char* webhook_url = SECRET_WEBHOOK_URL;

DHTesp dht;

void setup() {
  client.setInsecure();
  Serial.begin(115200);
  dht.setup(4, DHTesp::DHT22);
  Serial.println("DHT22 センサー準備完了！");
  
  pinMode(LED_PIN, OUTPUT);
  pinMode(LED_HOT, OUTPUT);
  pinMode(LED_COLD, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi接続完了！🛜");
}

void loop() {
  delay(2000);   // センサー安定のための待機
  
  TempAndHumidity data = dht.getTempAndHumidity();

  if (isnan(data.humidity) || isnan(data.temperature)) {
    Serial.println("センサーの読み取りに失敗しました");
    return;
  }

  Serial.print("温度: ");
  Serial.print(data.temperature, 1);
  Serial.print("℃  湿度: ");
  Serial.print(data.humidity, 1);
  Serial.println("%");

  // --- LED・ブザー制御 ---
  // 湿度チェック（低すぎる場合）
  if (data.humidity < 70.0) { 
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(1500);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    digitalWrite(LED_PIN, LOW);
  }

  // 湿度チェック（高すぎる場合）
  if (data.humidity > 92.0) { 
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(1500);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    digitalWrite(LED_PIN, LOW);
  }

  // 温度チェック（高すぎる場合）
  if (data.temperature > 25.5) { 
    digitalWrite(LED_HOT, HIGH);
    digitalWrite(LED_COLD, LOW);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(1500);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    digitalWrite(LED_HOT, LOW);
  }

  // 温度チェック（低すぎる場合）
  if (data.temperature < 16.0) { 
    digitalWrite(LED_COLD, HIGH);
    digitalWrite(LED_HOT, LOW);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(1500);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    digitalWrite(LED_COLD, LOW);
  }

  // --- アラート条件判定 ---
  String alert = "";
  bool isMoist = data.humidity > 92.0;
  bool isDry = data.humidity < 70.0;
  bool isHot = data.temperature > 25.5;
  bool isCold = data.temperature < 16.0;

  if (isDry && isHot) {
    alert = "dryhot";
  } else if (isDry && isCold) {
    alert = "drycold";
  } else if (isDry) {
    alert = "dry";
  } else if (isHot) {
    alert = "hot";
  } else if (isCold) {
    alert = "cold";
  } else if (isMoist && isHot) {
    alert = "moisthot";
  } else if (isMoist && isCold) {
    alert = "moistcold";
  } else if (isMoist) {
    alert = "moist";
  }

  Serial.println("[LOG]アラート内容: " + alert);

  // --- 送信処理 ---
  HTTPClient http;
  client.setInsecure();

  // 少し待機してから送信
  delay(5000); 

  if (http.begin(client, webhook_url)) {
    http.addHeader("Content-Type", "application/json");

    String payload = "{";
    payload += "\"temperature\":" + String(data.temperature, 1) + ",";
    payload += "\"humidity\":" + String(data.humidity, 1) + ",";
    payload += "\"alert\":\"" + alert + "\"";
    payload += "}";

    int httpResponseCode = http.POST(payload);
    Serial.printf("HTTPレスポンスコード: %d\n", httpResponseCode);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("レスポンス内容: " + response);
    } else {
      Serial.println("HTTPリクエストに失敗しました");
    }
    http.end();
  }

  delay(53000); // 合計約1分間隔でループ
}