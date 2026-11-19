@echo off
title AvtoTexnik - Avto Servis va Texnik Nazorat
echo ============================================
echo   AvtoTexnik serveri ishga tushirilmoqda...
echo ============================================

if not exist node_modules (
  echo [1/2] Kutubxonalar o'rnatilmoqda...
  call npm install
)

echo [2/2] Brauzer http://localhost:3000 manzilida ochiladi...
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm run dev
pause
