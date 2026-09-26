# レシート仕訳: はじめの 準備（1回だけ）
#  1. このフォルダを C:\ai\aoiro-import に 置く
#  2. Ollama を 入れる（無ければ）
#  3. 画像が 読める モデルを 落とす
#  4. デスクトップに 起動用の ショートカットを 作る
param(
  [string]$Dest  = 'C:\ai\aoiro-import',
  [string]$Model = 'qwen2.5vl:7b'
)
$ErrorActionPreference = 'Stop'
$src = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')

function Step($t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Test-Ollama {
  try { Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}
function Find-Ollama {
  $exe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if (-not $exe) {
    $c = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $c) { $exe = $c }
  }
  return $exe
}

# 1 ----------------------------------------------------------
Step "フォルダを $Dest に 置く"
if ($src -ieq $Dest.TrimEnd('\')) {
  Write-Host 'もう ここに あります。'
} else {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Copy-Item -Path (Join-Path $src '*') -Destination $Dest -Recurse -Force
  Write-Host 'コピーしました。'
}

# 2 ----------------------------------------------------------
Step 'Ollama'
$ollama = Find-Ollama
if (-not $ollama) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host 'winget が ありません。https://ollama.com/download から 入れて、もう一度 setup.bat を 実行してください。' -ForegroundColor Yellow
    exit 1
  }
  Write-Host 'Ollama を 入れます…'
  winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  $ollama = Find-Ollama
  if (-not $ollama) { Write-Host 'Ollama が 見つかりません。パソコンを 再起動してから もう一度 実行してください。' -ForegroundColor Yellow; exit 1 }
} else {
  Write-Host "入っています: $ollama"
}
if (-not (Test-Ollama)) {
  Start-Process $ollama -ArgumentList 'serve' -WindowStyle Hidden
  for ($i = 0; $i -lt 30 -and -not (Test-Ollama); $i++) { Start-Sleep -Milliseconds 500 }
}

# 3 ----------------------------------------------------------
Step "モデル $Model を 落とす（数GB。はじめは 時間が かかる）"
& $ollama pull $Model
if ($LASTEXITCODE -ne 0) { Write-Host 'モデルを 落とせませんでした。' -ForegroundColor Yellow; exit 1 }

# 4 ----------------------------------------------------------
Step 'デスクトップに ショートカット'
$desk = 'C:\デスクトップ'
if (-not (Test-Path $desk)) { $desk = [Environment]::GetFolderPath('Desktop') }
$lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desk 'レシート仕訳.lnk'))
$lnk.TargetPath       = Join-Path $Dest 'start.bat'
$lnk.WorkingDirectory = $Dest
$lnk.WindowStyle      = 7
$lnk.Save()
Write-Host "作りました: $desk\レシート仕訳.lnk"

Step 'おわり'
Write-Host 'デスクトップの「レシート仕訳」か、C:\ai\aoiro-import\start.bat で 起動します。'
