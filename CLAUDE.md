# RaceTrack

Jeu de course multijoueur sur grille — adaptation mobile du jeu papier RaceTrack.

## Stack
- **Frontend** : TypeScript vanilla, HTML5 Canvas 2D
- **Build** : esbuild (src/ → dist/bundle.js)
- **Backend** : Supabase (PostgreSQL + Realtime + Anonymous Auth)
- **PWA** : manifest.json + service worker
- **Deploy** : GitHub Pages
- **Tests** : Playwright

## Commandes
```bash
npm run build     # Build once
npm run watch     # Build + watch
npm run typecheck # Type checking
npm run test      # Playwright tests
```

## Structure
- `src/types.ts` — Interfaces et types partagés
- `src/grid.ts` — Rendu Canvas, grille, zoom/pan
- `src/physics.ts` — Mouvement, collisions, respawn
- `src/circuit.ts` — Génération et validation de circuits
- `src/game.ts` — State machine (lobby → playing → finished)
- `src/multiplayer.ts` — Supabase client, realtime, tours
- `src/profiles.ts` — Auth anonyme, pseudo, localStorage
- `src/progression.ts` — XP, rangs, coins, rewards
- `src/shop.ts` — Catalogue, achats, inventaire
- `src/app.ts` — Navigation écrans, init

## Conventions
- UI en français
- Mobile-first (portrait)
- Dark theme (CSS custom properties)
- Touch targets minimum 44px
- `python3` pour les scripts (Linux VPS)
