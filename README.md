# Daytrade Sector Scoreboard

自動整理 [Chengwaye 漲停隔日](https://chengwaye.com/nextday-performance) 的「個股明細」，依族群計算平均分數：

- 續漲停：+2
- 強續漲：+1
- 弱續漲：0
- 開高走低：-1
- 直接跌：-2

GitHub Actions 於台北時間每週一至週六 18:40 開始更新記分板、漲停紀錄、族群輪動焦點與事件型自選標的；若資料尚未成功更新，每 10 分鐘重試一次，持續至隔天 14:30，之後暫停至 18:40。只有來源資料變更時才提交並部署；單一來源失敗不會阻止其他資料完成。

線上記分板：https://ilovechenjj986.github.io/daytrade-scoreboard/

## AI Stock Map 雲端資料

另一個 GitHub Actions 工作流程於台北時間週一至週六 18:40 開始，以加密登入狀態開啟 AI Stock Map，分別讀取台股單日、台股單週、台股單月及美股單日的族群、公司數與漲跌幅。任一族群漲跌幅差異達 1% 或族群增減就視為更新；四個檢視若不同步，先保存已更新的部分，再每 10 分鐘重試補齊同一日期，直到隔天 14:30。14:30 至 18:40 暫停；資料補齊後只做輕量檢查，不再啟動瀏覽器。資料使用 30 個循環日期槽，電腦關機也不影響更新。

同一族群若台股單日上漲，且台股單週或單月任一列表下跌，網站會在符合條件的週月表以金色 `★` 標示。若台股單日下跌，台股單日表會依上漲期間個別加星：單週上漲一顆、單月上漲一顆，兩者都上漲則顯示兩顆；停在每顆星號上可查看該週或月的漲跌幅。

資料庫：https://ilovechenjj986.github.io/daytrade-scoreboard/aistockmap/

## 每日漲停紀錄

由每日總工作自台北時間 18:40 起每 10 分鐘檢查並擷取 [Chengwaye 當日頁面](https://chengwaye.com/daily) 的漲停區塊，若仍未更新則重試至隔天 14:30；只保存代號、名稱與族群。同一交易日期已保存時不會重複寫入。資料使用 30 個循環日期槽，提供最近 30 個已保存交易日查詢。

漲停紀錄：https://ilovechenjj986.github.io/daytrade-scoreboard/limit-up/

## 族群輪動焦點

- 來源：`https://chengwaye.com/stats`
- 由每日總工作自台北時間 18:40 起每 10 分鐘檢查並重試至隔天 14:30。
- 保存來源網站焦點排序的 18 個族群卡片，保留最近 30 個保存日期。

族群輪動焦點：https://ilovechenjj986.github.io/daytrade-scoreboard/rotation-focus/


## 事件型自選標的

每日總工作自台北時間 18:40 起每 10 分鐘檢查並重試至隔天 14:30，擷取 [盤前 LINE 轉貼版](https://chengwaye.com/)「處置預測」中的「第 1 次」標的，並從 [Chengwaye 事件頁](https://chengwaye.com/realtime-events)擷取當日法說、除權與除息標的。法說日期為區間時只採用起始日；財報不納入。相同股票會合併事件標籤，保留最近 30 個日期。

事件型自選標的：https://ilovechenjj986.github.io/daytrade-scoreboard/event-watchlist/
