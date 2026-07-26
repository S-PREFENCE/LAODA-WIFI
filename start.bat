@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>nul
cd /d "%~dp0"

set PORT=3000
if not "%~1"=="" set PORT=%~1

REM 1) 尝试 PATH 中的 node
where node >nul 2>nul
if %errorlevel%==0 (
    echo 使用 Node 启动服务端（端口 %PORT%）...
    node "%~dp0server.js" %PORT%
    goto :end
)

REM 2) 尝试已知的 WorkBuddy 管理 node 路径
set "NODE_PATH=C:\Users\ZhuanZ\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if exist "%NODE_PATH%" (
    echo 使用 Node 启动服务端（端口 %PORT%）...
    "%NODE_PATH%" "%~dp0server.js" %PORT%
    goto :end
)

REM 3) 尝试 PATH 中的 python
where python >nul 2>nul
if %errorlevel%==0 (
    echo 使用 Python 启动服务端（端口 %PORT%）...
    python "%~dp0server.py" %PORT%
    goto :end
)

REM 4) 尝试已知的 WorkBuddy 管理 python 路径
set "PY_PATH=C:\Users\ZhuanZ\.workbuddy\binaries\python\versions\3.13.12\python.exe"
if exist "%PY_PATH%" (
    echo 使用 Python 启动服务端（端口 %PORT%）...
    "%PY_PATH%" "%~dp0server.py" %PORT%
    goto :end
)

echo 未检测到 Node 或 Python，请先安装其中之一后再运行。
echo.
echo 也可以手动运行（把下面命令复制到命令提示符后回车）：
echo   node "%~dp0server.js" %PORT%
pause

:end
