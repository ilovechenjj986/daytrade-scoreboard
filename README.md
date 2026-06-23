# Daytrade Sector Scoreboard

自動整理 [Chengwaye 漲停隔日](https://chengwaye.com/nextday-performance) 的「個股明細」，依族群計算平均分數：

- 續漲停：+2
- 強續漲：+1
- 弱續漲：0
- 開高走低：-1
- 直接跌：-2

GitHub Actions 於台北時間週一至週五 18:00 開始監控，每 5 分鐘檢查一次；發現來源日期更新後，重新產生記分板、提交資料並部署至 GitHub Pages，然後停止當日監控。

線上記分板：https://ilovechenjj986.github.io/daytrade-scoreboard/