@echo off
chcp 65001 >nul
title AutoContentPoster Server
color 0A
echo 🚀 AutoContentPoster Pro — Starting...
cd /d "%~dp0"
node server.js
