param(
    [string]$Url = 'https://chengwaye.com/nextday-performance',
    [string]$OutputDirectory = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$scoreMap = [ordered]@{
    '續漲停'   =  2
    '強續漲'   =  1
    '弱續漲'   =  0
    '開高走低' = -1
    '直接跌'   = -2
}

function Get-HtmlAttribute {
    param([string]$Tag, [string]$Name)
    $pattern = '(?is)\b' + [regex]::Escape($Name) + '\s*=\s*["''](?<value>.*?)["'']'
    $match = [regex]::Match($Tag, $pattern)
    if (-not $match.Success) { return $null }
    return [System.Net.WebUtility]::HtmlDecode($match.Groups['value'].Value).Trim()
}

function Encode-Html([object]$Value) {
    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

Write-Host "下載：$Url"
$response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 45 -Headers @{
    'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SectorScoreboard/1.0'
}
$html = $response.Content

$rowMatches = [regex]::Matches($html, '(?is)<tr\b[^>]*class=["''][^"'']*stock-row-clickable[^"'']*["''][^>]*>.*?</tr>')
$stocks = [System.Collections.Generic.List[object]]::new()

foreach ($match in $rowMatches) {
    $rowHtml = $match.Value
    $tagMatch = [regex]::Match($rowHtml, '(?is)^<tr\b[^>]*>')
    $tag = $tagMatch.Value
    $label = Get-HtmlAttribute $tag 'data-label'
    $concept = Get-HtmlAttribute $tag 'data-concept'
    if (-not $scoreMap.Contains($label) -or [string]::IsNullOrWhiteSpace($concept)) { continue }

    $nameMatch = [regex]::Match($rowHtml, '(?is)<td\b[^>]*class=["''][^"'']*stock-name-cell[^"'']*["''][^>]*>(?<name>.*?)</td>')
    $stockName = if ($nameMatch.Success) {
        [System.Net.WebUtility]::HtmlDecode(([regex]::Replace($nameMatch.Groups['name'].Value, '<[^>]+>', '')).Trim())
    } else { '' }

    $stocks.Add([pscustomobject]@{
        code    = Get-HtmlAttribute $tag 'data-code'
        name    = $stockName
        label   = $label
        sector  = $concept
        score   = [int]$scoreMap[$label]
    })
}

if ($stocks.Count -eq 0) {
    throw '找不到個股明細資料。網站結構可能已變更，請檢查 #stock-table 的資料列。'
}

$dateMatch = [regex]::Match($html, '漲停日\s*(?<limit>\d{4}/\d{2}/\d{2})\s*(?:→|&rarr;)\s*隔日\s*(?<next>\d{4}/\d{2}/\d{2})')
$limitDate = if ($dateMatch.Success) { $dateMatch.Groups['limit'].Value } else { '' }
$nextDate = if ($dateMatch.Success) { $dateMatch.Groups['next'].Value } else { '' }

$sectors = foreach ($group in ($stocks | Group-Object sector)) {
    $items = @($group.Group)
    $sum = ($items | Measure-Object -Property score -Sum).Sum
    $counts = [ordered]@{}
    foreach ($label in $scoreMap.Keys) {
        $counts[$label] = @($items | Where-Object label -eq $label).Count
    }
    [pscustomobject]@{
        sector  = $group.Name
        average = [math]::Round(($sum / $items.Count), 3)
        total   = [int]$sum
        count   = $items.Count
        counts  = [pscustomobject]$counts
    }
}

$nonNegative = @($sectors | Where-Object average -ge 0 | Sort-Object @{Expression='average';Descending=$true}, @{Expression='count';Descending=$true}, sector)
$negative = @($sectors | Where-Object average -lt 0 | Sort-Object @{Expression='average';Descending=$true}, @{Expression='count';Descending=$true}, sector)
$generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz')

$result = [ordered]@{
    source       = $Url
    generatedAt  = $generatedAt
    limitDate    = $limitDate
    nextDate     = $nextDate
    stockCount   = $stocks.Count
    sectorCount  = $sectors.Count
    scoring      = [pscustomobject]$scoreMap
    stocks       = @($stocks)
    nonNegative  = $nonNegative
    negative     = $negative
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$jsonPath = Join-Path $OutputDirectory 'sector_scoreboard.json'
$csvPath = Join-Path $OutputDirectory 'sector_scoreboard.csv'
$htmlPath = Join-Path $OutputDirectory 'sector_scoreboard.html'

$result | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
$sectors | Sort-Object @{Expression='average';Descending=$true}, sector |
    Select-Object sector, average, total, count,
        @{n='續漲停';e={$_.counts.'續漲停'}}, @{n='強續漲';e={$_.counts.'強續漲'}},
        @{n='弱續漲';e={$_.counts.'弱續漲'}}, @{n='開高走低';e={$_.counts.'開高走低'}},
        @{n='直接跌';e={$_.counts.'直接跌'}} |
    Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8

function New-ScoreRows([object[]]$Rows) {
    if ($Rows.Count -eq 0) { return '<tr><td colspan="9" class="empty">本日沒有符合項目</td></tr>' }
    return (($Rows | ForEach-Object {
        $avgClass = if ($_.average -ge 0) { 'score non-negative' } else { 'score negative' }
        '<tr><td class="sector"><button type="button" class="sector-button" data-sector="' + (Encode-Html $_.sector) + '">' + (Encode-Html $_.sector) + '</button></td>' +
        '<td class="' + $avgClass + '">' + $_.average.ToString('0.000') + '</td>' +
        '<td>' + $_.count + '</td>' +
        '<td>' + $_.total + '</td>' +
        '<td>' + $_.counts.'續漲停' + '</td><td>' + $_.counts.'強續漲' + '</td>' +
        '<td>' + $_.counts.'弱續漲' + '</td><td>' + $_.counts.'開高走低' + '</td>' +
        '<td>' + $_.counts.'直接跌' + '</td></tr>'
    }) -join "`n")
}

$nonNegativeRows = New-ScoreRows $nonNegative
$negativeRows = New-ScoreRows $negative
$dateLabel = if ($nextDate) { "漲停日 $limitDate → 隔日 $nextDate" } else { '最新資料' }
$sourceEscaped = Encode-Html $Url
$stocksJson = (@($stocks) | ConvertTo-Json -Depth 4 -Compress).Replace('<', '\u003c').Replace('>', '\u003e')

$dashboard = @"
<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>族群隔日表現記分板</title>
<style>
:root{color-scheme:dark;--bg:#090d16;--panel:#121827;--line:#26314a;--text:#e8edf7;--muted:#929db2;--good:#34d399;--bad:#fb7185;--accent:#818cf8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 12% 0,#18213b 0,transparent 36%),var(--bg);font:15px/1.5 system-ui,-apple-system,"Segoe UI","Noto Sans TC",sans-serif;color:var(--text)}main{max-width:1220px;margin:auto;padding:36px 22px 60px}h1{margin:0;font-size:clamp(28px,5vw,48px);letter-spacing:-.04em}.sub{color:var(--muted);margin:8px 0 24px}.summary,.legend{display:flex;gap:10px;flex-wrap:wrap}.pill{background:#171e30;border:1px solid var(--line);border-radius:999px;padding:7px 12px}.pill b{color:white}.legend{margin:18px 0 28px}.legend .pill{font-size:13px}section{background:rgba(18,24,39,.92);border:1px solid var(--line);border-radius:18px;margin:18px 0;overflow:hidden;box-shadow:0 18px 60px #0005}.section-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line)}h2{font-size:20px;margin:0}.count{color:var(--muted)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}th,td{padding:12px 14px;text-align:right;border-bottom:1px solid #202a40;white-space:nowrap}th{position:sticky;top:0;background:#171e30;color:#9faac0;font-size:12px}th:first-child,td:first-child{text-align:left}.sector{font-weight:700}.score{font-weight:800}.non-negative{color:var(--bad)}.negative{color:var(--good)}tr:hover td{background:#161e30}.empty{text-align:center!important;color:var(--muted);padding:30px}.sector-button{border:0;background:none;color:#a5b4fc;font:inherit;font-weight:800;padding:0;cursor:pointer;text-decoration:underline;text-decoration-color:#818cf866;text-underline-offset:4px}.sector-button:hover{color:white}.sector-dialog{width:min(680px,calc(100% - 28px));max-height:82vh;padding:0;border:1px solid var(--line);border-radius:18px;background:#121827;color:var(--text);box-shadow:0 28px 90px #000b}.sector-dialog::backdrop{background:#020617cc;backdrop-filter:blur(3px)}.dialog-head{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid var(--line)}.dialog-head h3{margin:0;font-size:21px}.dialog-close{border:1px solid var(--line);border-radius:10px;background:#202a40;color:white;padding:7px 11px;cursor:pointer}.stock-list{padding:8px 20px 20px;overflow:auto}.stock-item{display:grid;grid-template-columns:80px 1fr auto auto;gap:12px;align-items:center;padding:12px 4px;border-bottom:1px solid #202a40}.stock-code{color:#a5b4fc;font-weight:800}.stock-name{font-weight:700}.stock-label{color:var(--muted)}.stock-score{font-weight:900}.stock-score.up{color:var(--good)}.stock-score.down{color:var(--bad)}footer{color:var(--muted);font-size:13px;margin-top:22px}a{color:#a5b4fc}@media(max-width:600px){main{padding:24px 12px}th,td{padding:10px}.stock-item{grid-template-columns:64px 1fr auto}.stock-label{grid-column:2}.stock-score{grid-row:1/3;grid-column:3}}
</style>
</head>
<body><main>
<h1>族群隔日表現記分板</h1>
<p class="sub">$dateLabel · 依「個股明細」每檔股票的族群與標籤計算算術平均 · 點擊族群可查看全部標的</p>
<div class="summary"><span class="pill"><b>$($stocks.Count)</b> 檔股票</span><span class="pill"><b>$($sectors.Count)</b> 個族群</span><span class="pill">更新於 <b>$generatedAt</b></span></div>
<div class="legend"><span class="pill">續漲停 +2</span><span class="pill">強續漲 +1</span><span class="pill">弱續漲 0</span><span class="pill">開高走低 −1</span><span class="pill">直接跌 −2</span></div>
<section><div class="section-head"><h2 style="color:var(--good)">平均分 &lt; 0</h2><span class="count">$($negative.Count) 個族群</span></div><div class="table-wrap"><table><thead><tr><th>族群</th><th>平均分</th><th>檔數</th><th>總分</th><th>續漲停</th><th>強續漲</th><th>弱續漲</th><th>開高走低</th><th>直接跌</th></tr></thead><tbody>$negativeRows</tbody></table></div></section>
<section><div class="section-head"><h2 style="color:var(--bad)">平均分 ≥ 0</h2><span class="count">$($nonNegative.Count) 個族群</span></div><div class="table-wrap"><table><thead><tr><th>族群</th><th>平均分</th><th>檔數</th><th>總分</th><th>續漲停</th><th>強續漲</th><th>弱續漲</th><th>開高走低</th><th>直接跌</th></tr></thead><tbody>$nonNegativeRows</tbody></table></div></section>
<footer>資料來源：<a href="$sourceEscaped">Chengwaye 漲停隔日</a>。本頁僅為資料整理，不構成投資建議。JSON 與 CSV 會和此頁同步更新。</footer>
</main>
<dialog class="sector-dialog" id="sector-dialog"><div class="dialog-head"><h3 id="dialog-title"></h3><button type="button" class="dialog-close" aria-label="關閉">關閉</button></div><div class="stock-list" id="stock-list"></div></dialog>
<script>
const stocks=$stocksJson;
const dialog=document.getElementById('sector-dialog');
const title=document.getElementById('dialog-title');
const list=document.getElementById('stock-list');
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
document.querySelectorAll('.sector-button').forEach(button=>button.addEventListener('click',()=>{
  const sector=button.dataset.sector;
  const items=stocks.filter(stock=>stock.sector===sector).sort((a,b)=>b.score-a.score||String(a.code).localeCompare(String(b.code)));
  title.textContent=sector+'（'+items.length+' 檔）';
  list.innerHTML=items.map(stock=>'<div class="stock-item"><span class="stock-code">'+escapeHtml(stock.code)+'</span><span class="stock-name">'+escapeHtml(stock.name)+'</span><span class="stock-label">'+escapeHtml(stock.label)+'</span><span class="stock-score '+(stock.score>0?'up':stock.score<0?'down':'')+'">'+(stock.score>0?'+':'')+stock.score+'</span></div>').join('');
  dialog.showModal();
}));
document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
</script>
</body></html>
"@
$dashboard | Set-Content -LiteralPath $htmlPath -Encoding UTF8

Write-Host "完成：$($stocks.Count) 檔、$($sectors.Count) 個族群"
Write-Host "HTML: $htmlPath"
Write-Host "CSV : $csvPath"
Write-Host "JSON: $jsonPath"
