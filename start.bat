@echo off
title BlockPy Launcher
cd /d E:\Harness_Blockly

echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo npm install failed!
    pause
    exit /b 1
)

start "BlockPy Backend" cmd /k "cd /d E:\Harness_Blockly && npm run server || pause"
start "BlockPy Frontend" cmd /k "cd /d E:\Harness_Blockly && npm run dev || pause"

echo Waiting for Vite...
:wait
timeout /t 2 /nobreak >nul
netstat -an | find ":3000 " >nul 2>&1
if errorlevel 1 goto wait

start "" "http://localhost:3000"
