
@echo off
title Striimaamo Replay

cd /d "%~dp0"

echo Kaynnistetaan Striimaamo Replay...
echo.

python -m uvicorn app.main:app --reload

pause
