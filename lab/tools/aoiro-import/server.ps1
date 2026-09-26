# レシート仕訳: このフォルダを http://localhost:8765/ で 開く
# Ollama が 止まっていたら 起こす
$ErrorActionPreference = 'Stop'
$root   = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$port   = 8765
$prefix = "http://localhost:$port/"

function Test-Ollama {
  try { Invoke-RestMethod 'http://localhost:11434/api/tags' -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

# もう 動いていたら ブラウザだけ 開く
try {
  Invoke-WebRequest -UseBasicParsing $prefix -TimeoutSec 1 | Out-Null
  Start-Process $prefix
  exit
} catch {}

if (-not (Test-Ollama)) {
  $exe = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if (-not $exe) {
    $c = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    if (Test-Path $c) { $exe = $c }
  }
  if ($exe) {
    Write-Host 'Ollama を 起動しています…'
    Start-Process $exe -ArgumentList 'serve' -WindowStyle Hidden
    for ($i = 0; $i -lt 30 -and -not (Test-Ollama); $i++) { Start-Sleep -Milliseconds 500 }
  } else {
    Write-Host 'Ollama が 見つかりません。先に setup.bat を 実行してください。' -ForegroundColor Yellow
  }
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.png'  = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
  '.json' = 'application/json'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host ''
Write-Host "  レシート仕訳  $prefix" -ForegroundColor Green
Write-Host '  この窓を 閉じると 止まります。'
Write-Host ''
Start-Process $prefix

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if (-not $rel) { $rel = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
      $res.StatusCode = 404
    } else {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-cache')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
