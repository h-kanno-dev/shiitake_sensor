/**
 * メイン処理：ESP8266からデータが届いたら動く
 */
function doPost(e) {
  writeLog('INFO', 'データ受信開始');

  try {
    // 届いたデータを解析する
    const contents = e.postData.contents || '';
    const data = JSON.parse(contents);
    
    const now = new Date();
    const temp = Number(data.temperature);
    const hum = Number(data.humidity);
    const alert = String(data.alert || '');

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

    // スプレッドシート（monitorシート）に記録する
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('monitor');
    if (sheet) {
      sheet.appendRow([now, temp, hum, alert, comment]);
    }

    // Discordに送る文章組み立て
    const message = `温度: ${temp}℃ / 湿度: ${hum}%\n状態: ${alert}\nメッセージ: ${comment}\n---------------------------\n`;
    
    // Discordに通知送信
    notifyDiscord(message);

    // デバッグ用に最新の状態を保存
    PropertiesService.getScriptProperties().setProperties({
      lastRaw: contents,
      lastAt: now.toISOString()
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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