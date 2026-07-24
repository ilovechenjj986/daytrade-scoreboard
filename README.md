# Daytrade Sector Scoreboard

自動整理 [Chengwaye 漲停隔日](https://chengwaye.com/nextday-performance) 的「個股明細」，依族群計算平均分數：

- 續漲停：+2
- 強續漲：+1
- 弱續漲：0
- 開高走低：-1
- 直接跌：-2

GitHub Actions 於台北時間週一至週五 18:00 開始監控，每 5 分鐘檢查一次；發現來源日期更新後，重新產生記分板、提交資料並部署至 GitHub Pages，然後停止當日監控。

線上記分板：https://ilovechenjj986.github.io/daytrade-scoreboard/

## AI Stock Map 原頁快照

另一個 GitHub Actions 工作流程於台北時間週一至週六 18:05，以加密登入狀態開啟 AI Stock Map，保存台股單週、台股單月及美股單日的完整原頁截圖。圖片採 lossless WebP，使用 30 個循環日期槽；電腦關機也不影響更新。

快照庫：https://ilovechenjj986.github.io/daytrade-scoreboard/aistockmap/

## 每日漲停紀錄

週一至週六台北時間 18:17 擷取 [Chengwaye 當日頁面](https://chengwaye.com/daily) 的漲停區塊，只保存代號、名稱與族群。18:27 設有備援觸發；同一交易日期成功後不會重複寫入。資料使用 30 個循環日期槽，提供最近 30 個已保存交易日查詢。

漲停紀錄：https://ilovechenjj986.github.io/daytrade-scoreboard/limit-up/

## 族群輪動焦點

- 來源：`https://chengwaye.com/stats`
- 每週一至週六台北時間 18:37 擷取，18:47 備援。
- 保存來源網站焦點排序的 18 個族群卡片，保留最近 30 個保存日期。

族群輪動焦點：https://ilovechenjj986.github.io/daytrade-scoreboard/rotation-focus/
