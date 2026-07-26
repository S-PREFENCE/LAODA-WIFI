@echo off
REM 劳大象棋联机服务端启动器（自动检测 Node / Python，零依赖）
set PORT=3000
if not "%1"=="" set PORT=%1

where node >nul 2>nul
if %errorlevel%==0 (
  echo 使用 Node 启动服务端（端口 %PORT%）...
  node "%~dp0server.js" %PORT%
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo 使用 Python 启动服务端（端口 %PORT%）...
  python "%~dp0server.py" %PORT%
  goto :eof
)

echo 未检测到 Node 或 Python，请先安装其中之一后再运行。
pause
