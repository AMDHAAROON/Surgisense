## Packages
(none needed)

## Notes
WebSocket live tool detection: ws://localhost:8000/ws/detection (expects JSON { fps, hands, tools: [{ id, name, confidence, status }] })
Live video feed: render <img src="http://localhost:8000/stream/video" />
API endpoints are provided via @shared/routes (procedures list, procedure stages, contact, test results)
Dark mode: uses .dark class on html element; this frontend includes a theme toggle (localStorage persistence)
