# medlaunch-challenge

This repository has been scaffolded into a minimal Express + TypeScript backend.

Quick start

1. Install dependencies:

```powershell
npm install
```

2. Run in development mode (auto-restarts on change):

```powershell
npm run dev
```

3. Build and run production:

```powershell
npm run build; npm start
```

Endpoints

- `GET /` - welcome message
- `GET /health` - basic health check returning uptime

Notes

- The TypeScript source is in `src/` and compiled output goes to `dist/`.
- Adjust `PORT` environment variable to change the listening port.
