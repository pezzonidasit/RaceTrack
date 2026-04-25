---
name: RaceTrack v1 project status
description: Current state of RaceTrack implementation — what's done, what's pending, next steps
type: project
---

## V1 Implementation — Complete (29 mars 2026)

11 tâches implémentées en une session :
1. Scaffold (TypeScript vanilla + esbuild)
2. Physics engine (mouvement, collision Bresenham, respawn)
3. Circuit generation (boucles aléatoires + validation BFS)
4. Canvas renderer (grille, voitures, zoom/pan tactile)
5. Supabase multiplayer (auth anonyme, games, moves, realtime)
6. Game state machine (lobby → playing → result)
7. Progression (XP, 6 rangs Karting→Légende, coins, diminishing returns)
8. Shop (13 items : 5 skins, 4 trails, 4 thèmes)
9. PWA (service worker, manifest, icônes placeholder)
10. Playwright tests (4 E2E tests passent)
11. GitHub Pages deploy (workflow Actions)

## Pending

- **Supabase config** : remplacer placeholders URL/KEY dans `src/profiles.ts` avec les vraies valeurs du projet Supabase de Vincent
- **Supabase migration** : appliquer `supabase/migrations/001_init.sql` dans le dashboard Supabase
- **Test multiplayer** : première vraie partie multi une fois Supabase configuré

## V2 Backlog (défini dans le design spec)

- Mode solo contre IA
- Éditeur de circuits
- Daily quests
- Saisons / classement global
- Coffres / loot
- Power-ups sur la piste
- Login persistent (cross-device)
- Chat texte (emojis only en V1)

**Why:** Vincent veut un jeu fun pour enfants, style QuizHero mais racing. Le multiplayer async (parties sur des jours/semaines) est le cœur du concept.

**How to apply:** Priorité = rendre le multiplayer jouable (Supabase config), puis itérer sur le fun/gamification.
