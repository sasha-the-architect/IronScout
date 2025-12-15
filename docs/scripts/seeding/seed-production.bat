@echo off
REM Seed Production Database Script
REM This script seeds the production database with test data

echo ========================================
echo   Seeding Production Database
echo ========================================
echo.

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL environment variable not set
  echo.
  echo Please get your production database URL from Render:
  echo 1. Go to https://dashboard.render.com
  echo 2. Select your PostgreSQL database
  echo 3. Copy the "External Database URL"
  echo 4. Run: set DATABASE_URL=your-database-url-here
  echo 5. Then run this script again
  echo.
  pause
  exit /b 1
)

echo Using database: %DATABASE_URL%
echo.

REM Navigate to db package
cd packages\db

echo Step 1: Seeding retailers...
call pnpm db:seed-retailers
if errorlevel 1 goto error

echo.
echo Step 2: Seeding comprehensive products (657 products)...
call pnpm db:seed-comprehensive
if errorlevel 1 goto error

echo.
echo Step 3: Seeding price history (90 days)...
call pnpm db:seed-price-history
if errorlevel 1 goto error

echo.
echo ========================================
echo   SUCCESS! Database seeded.
echo ========================================
echo.
echo Next steps:
echo 1. Test search: https://ironscout-web.onrender.com/search?q=ammo
echo 2. Products should now appear
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo   ERROR: Seeding failed
echo ========================================
echo.
pause
exit /b 1
