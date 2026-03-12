/**
 * しいたけ栽培支援モニタリングシステム - サーバー側スクリプト
 * ESP8266から送信される温湿度データを受信し、
 * スプレッドシートへのロギング、Discordへの通知、
 * 15分間隔の通知制御とヘルスチェックを行います。
 * * @author Honami Kanno
 * @license MIT
 */

function doPost(e) {
  writeLog('INFO', 'データ受信開始');

  try {
    const contents = e.postData.contents || '';
    const data = JSON.parse(contents);
    
    const now = new Date();
    const nowTime = now.getTime();
    const temp = Number(data.temperature);
    const hum = Number(data.humidity);
    const alert = String(data.alert || ''); // 空なら正常、文字があれば異常

    // 状態に応じたコメントを作る
    let comment = '状態は良好です！';
    if (alert === 'dry') comment = '乾燥しています';
    else if (alert === 'hot') comment = '高温状態です';
    else if (alert === 'cold') comment = '低温状態です';
    else if (alert === 'dryhot') comment = '乾燥・高温状態です';
    else if (alert === 'drycold') comment = '乾燥・低温状態です';
    else if (alert === 'moist') comment = '多湿状態です';
    else if (alert === 'moistcold') comment = '多湿・低温状態です';
    else if (alert === 'moisthot') comment = '多湿・高温状態です';

    // ===== 通知制御ロジック =====
    const props = PropertiesService.getScriptProperties();
    const lastAlertStatus = props.getProperty('LAST_ALERT_STATUS') || ''; // 前回の状態
    const lastNotifyTime = Number(props.getProperty('LAST_NOTIFY_TIME') || 0); // 前回の通知時刻
    
    let shouldNotify = false;
    let notifyMessage = '';

    // 15分 = 900,000ミリ秒
    const interval = 900000;

    if (alert === '') {
      // 【正常時】
      if (lastAlertStatus !== '') {
        // 異常から正常に戻った瞬間：即時通知
        notifyMessage = '✅ 栽培環境：良好状態に戻りました！\n---------------------------\n';
        shouldNotify = true;
        props.setProperty('GOOD_START_TIME', nowTime); // 良好開始時間を記録
      } else {
        // ずっと正常な場合：15分経過チェック
        const goodStart = Number(props.getProperty('GOOD_START_TIME') || nowTime);
        if (nowTime - goodStart >= interval) {
          notifyMessage = '🍃 栽培環境：良好状態継続中\n---------------------------\n';
          shouldNotify = true;
          props.setProperty('GOOD_START_TIME', nowTime); // 次の15分のためにリセット
        }
      }
    } else {
      // 【異常時】
      props.deleteProperty('GOOD_START_TIME'); // 異常が出たら良好タイマー消去

      if (alert !== lastAlertStatus) {
        // 状態が変わった（正常→異常、または異常の種類変化）：即時通知
        notifyMessage = `⚠️ 異常検知：${comment}\n温度: ${temp}℃ / 湿度: ${hum}%\n---------------------------\n`;
        shouldNotify = true;
      } else {
        // 同じ異常が続いている場合：15分経っていれば通知
        if (nowTime - lastNotifyTime >= interval) {
          notifyMessage = `🔔 異常継続中：${comment}\n温度: ${temp}℃ / 湿度: ${hum}%\n---------------------------\n`;
          shouldNotify = true;
        }
      }
    }

    // 通知実行と記録
    if (shouldNotify) {
      notifyDiscord(notifyMessage);
      props.setProperty('LAST_NOTIFY_TIME', nowTime);
      props.setProperty('LAST_ALERT_STATUS', alert);
    }

    // スプレッドシート（monitorシート）に記録
    const ss = SpreadsheetApp.openById("1vF7Q0YY6v-xxsA1ojVQt1wNJgM51KZqzALmEBPMXxX8");
    const sheet = ss.getSheetByName('monitor');
    if (sheet) {
      sheet.appendRow([now, temp, hum, alert, comment]);
    }

    // デバッグ用に最新の状態を保存
    props.setProperties({
      lastRaw: contents,
      lastAt: nowTime
    });

    writeLog('INFO', `正常完了: ${temp}度 / ${hum}%`);

    return ContentService.createTextOutput(JSON.stringify({result: 'OK'}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    writeLog('ERROR', 'エラー発生: ' + err.toString());
    return ContentService.createTextOutput(JSON.stringify({result: 'ERROR', message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Discord通知
 */
function notifyDiscord(text) {
  const url = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK');
  if (!url) return;

  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ content: text })
    });
    writeLog('INFO', 'Discord送信完了');
  } catch (e) {
    writeLog('ERROR', 'Discord送信失敗: ' + e);
  }
}

/**
 * ログ記録
 */
function writeLog(type, message) {
  try {
    const ss = SpreadsheetApp.openById('1vF7Q0YY6v-xxsA1ojVQt1wNJgM51KZqzALmEBPMXxX8');
    let logSheet = ss.getSheetByName('log');
    if (!logSheet) {
      logSheet = ss.insertSheet('log');
      logSheet.appendRow(['日時', '種別', '内容']);
    }
    logSheet.appendRow([new Date(), type, message]);
  } catch (e) {
    Logger.log('ログ出力失敗: ' + e);
  }
}

/**
 * ブラウザで画面表示
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('モニタリングシステム')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * HTML画面に最新10件のデータを渡す
 */
function getMonitorDataObj() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('monitor');
  
  let rows = [];
  if (sh) {
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      // 最大10件、最新の行を取得
      const start = Math.max(2, lastRow - 9); 
      const num = lastRow - start + 1;
      rows = sh.getRange(start, 1, num, 5).getDisplayValues();
      rows.reverse(); // 新しいものを上に表示
    }
  }
  
  return { rows: rows };
}

function checkDeviceAlive() {

  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('lastAt') || 0);

  if (!last) return;

  const now = new Date().getTime();
  const diff = now - last;

  // 5分データが来なかったら異常
  if (diff > 300000) {

    notifyDiscord("⚠️ 監視システム：データ受信停止の可能性があります");

  }

}
