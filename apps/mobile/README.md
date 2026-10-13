# OmniClean Mobile (Expo)

React Native / Expo client for the OmniClean AI Scanner demo flow:

1. Walkthrough upload (or mock spatial)
2. Bid ledger (Decimal math from API)
3. Crew checklist + AI audit prompts
4. Proposal draft with localized currency

## Run

```bash
# Terminal 1 — API
cd apps/api && npm install && npm run dev

# Terminal 2 — Mobile
cd apps/mobile
cp .env.example .env   # optional
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to your machine IP when testing on a physical device (not `localhost`).
