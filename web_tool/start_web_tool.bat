@echo off
cd /d "%~dp0"
title Not1a Agnes Multimodal Tool
echo Starting Not1a Agnes Multimodal Tool...
echo Open http://localhost:8765 if the browser does not open automatically.
start "" http://localhost:8765
python server.py
pause
