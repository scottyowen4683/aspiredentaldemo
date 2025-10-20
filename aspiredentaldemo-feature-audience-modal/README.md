# Aspire Executive Solutions — AI Receptionist Site

This repo contains a React (Vite + Tailwind) frontend and a FastAPI backend.

## Frontend (Vite + React + Tailwind)
```bash
cd frontend
npm install
# copy .env
cp .env.example .env
# set VITE_BACKEND_URL in .env
npm run dev
npm run build
```

## Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# copy .env
cp .env.example .env
# set MONGO_URL and DB_NAME
uvicorn server:app --reload
```

### Deploy tips
- Frontend: Netlify (base: `frontend`, build: `npm run build`, publish: `dist`)
- Backend: Render (build: `pip install -r requirements.txt`, start: `uvicorn server:app --host 0.0.0.0 --port 10000`)
- Set `VITE_BACKEND_URL` on the frontend to your backend URL.
