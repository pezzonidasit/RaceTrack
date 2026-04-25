# RaceTrack v1 — Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Target:** Enfants, 100% fun
**Deploy:** GitHub Pages (PWA)

---

## 1. Concept

RaceTrack est une adaptation mobile du jeu de course sur papier quadrillé. Les joueurs contrôlent des voitures sur une grille en ajustant leur vecteur vitesse à chaque tour. Parties multijoueur async (2-4 joueurs) qui peuvent durer des jours/semaines.

## 2. Stack Technique

| Composant | Choix |
|-----------|-------|
| Frontend | TypeScript vanilla (pas de framework) |
| Build | esbuild (TS → JS, bundle unique) |
| Rendu | HTML5 Canvas 2D |
| Backend | Supabase (PostgreSQL + Realtime + Anonymous Auth) |
| PWA | manifest.json + service worker |
| Deploy | GitHub Pages |
| Tests | Playwright |
| Style | CSS3, dark theme, mobile-first |

## 3. Game Engine

### Grille
- Canvas 2D, grille carrée visible (~30x40 cases)
- Zoom/pan tactile pour naviguer le circuit
- Mobile portrait = orientation principale

### Mouvement (règles RaceTrack classiques)
- Chaque voiture a un vecteur vitesse `(vx, vy)`
- À chaque tour, le joueur choisit une accélération parmi 9 options : `(ax, ay)` où `ax ∈ {-1, 0, +1}` et `ay ∈ {-1, 0, +1}`
- Nouvelle position = position actuelle + vecteur vitesse + accélération
- Interface : les 9 cases cibles possibles sont affichées en surbrillance, le joueur tape sur celle qu'il veut

### Collision / Crash
- Si la trajectoire (segment entre ancienne et nouvelle position) croise un mur de piste → crash
- Respawn : la voiture revient 3 cases en arrière sur la ligne centrale de la piste, vitesse reset à `(0, 0)`
- Le joueur perd 2 tours (skip automatique)

### Circuits générés
- Algorithme : génère un tracé fermé (boucle) avec largeur variable (minimum 3 cases)
- Validation : un pathfinder IA simule la course pour vérifier que le circuit est jouable. Si impossible → régénère
- Ligne de départ/arrivée marquée clairement
- Nombre de tours par course : 1

### Victoire
- Premier joueur à franchir la ligne d'arrivée gagne
- Si tous les joueurs restants sont éliminés (kicked) → dernier en jeu gagne
- Si collision simultanée → le joueur le plus avancé sur la piste gagne

## 4. Multijoueur Async (Supabase)

### Création de partie
- Un joueur crée une partie → reçoit un code 4 lettres (ex: TURBO, BLAZE, DRIFT)
- Partage le code aux autres joueurs (copier-coller, oral, etc.)
- 2 à 4 joueurs rejoignent avec le code
- Le créateur lance la course quand tout le monde est prêt

### Authentification
- Pas de compte obligatoire — pseudo choisi au premier lancement
- Supabase anonymous auth (UUID par device)
- Pseudo + UUID stockés en localStorage

### Gestion des tours
- Ordre des joueurs : défini à la création (ordre d'arrivée dans le lobby)
- Quand c'est ton tour → l'écran affiche "C'est à toi!" + les cases possibles
- Supabase Realtime écoute la table `moves` pour notifier les changements

### Anti-blocage (timeout / kick)
- 24h sans jouer → reminder visuel (badge sur l'app)
- 48h sans jouer → auto-skip (la voiture avance en ligne droite, vecteur vitesse inchangé)
- 3 auto-skips consécutifs → joueur kické, la partie continue sans lui
- Si un seul joueur reste → il gagne automatiquement

### Schema DB (Supabase / PostgreSQL)

```sql
-- Parties
games (
  id UUID PRIMARY KEY,
  code VARCHAR(6) UNIQUE,
  status VARCHAR(20),  -- 'lobby' | 'playing' | 'finished'
  circuit_data JSONB,  -- grille + murs + départ/arrivée
  current_turn INT,
  current_player_index INT,
  created_at TIMESTAMPTZ
)

-- Joueurs dans une partie
players (
  id UUID PRIMARY KEY,
  game_id UUID REFERENCES games,
  user_id UUID,
  name VARCHAR(30),
  color VARCHAR(7),     -- hex color
  skin VARCHAR(50),     -- skin id
  trail VARCHAR(50),    -- trail id
  position_x INT,
  position_y INT,
  velocity_x INT,
  velocity_y INT,
  status VARCHAR(20),   -- 'alive' | 'crashed' | 'finished' | 'kicked'
  finish_position INT,  -- 1st, 2nd, etc.
  skip_count INT DEFAULT 0,
  created_at TIMESTAMPTZ
)

-- Mouvements (historique complet)
moves (
  id UUID PRIMARY KEY,
  game_id UUID REFERENCES games,
  player_id UUID REFERENCES players,
  turn INT,
  accel_x INT,          -- -1, 0, or 1
  accel_y INT,          -- -1, 0, or 1
  new_position_x INT,
  new_position_y INT,
  crashed BOOLEAN DEFAULT FALSE,
  auto_skip BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ
)

-- Profils persistants (cross-game)
profiles (
  id UUID PRIMARY KEY,
  name VARCHAR(30),
  xp INT DEFAULT 0,
  coins INT DEFAULT 0,
  rank VARCHAR(30) DEFAULT 'Karting',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  owned_skins JSONB DEFAULT '[]',
  owned_trails JSONB DEFAULT '[]',
  owned_themes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ
)
```

## 5. Gamification & Progression

### XP & Rangs
| Place | XP | Coins |
|-------|-----|-------|
| 1er | 100 | 50 |
| 2ème | 60 | 30 |
| 3ème | 35 | 20 |
| 4ème | 20 | 10 |

Bonus :
- Course sans crash : +30 XP
- Victoire en moins de 20 tours : +20 XP

| Rang | XP requis |
|------|-----------|
| Karting | 0 |
| Rally | 500 |
| F3 | 1500 |
| F1 | 3500 |
| Champion | 7000 |
| Légende | 15000 |

### Coins & Diminishing Returns
- Courses 1-3 du jour : ×1.0
- Course 4 : ×0.5
- Course 5 : ×0.3
- Course 6+ : ×0.1

### Shop
| Catégorie | Exemples | Prix |
|-----------|----------|------|
| Skins voiture | Couleurs, emojis (🏎️ 🚗 🏍️ 🚀) | 50-200 coins |
| Trails | Pointillés, flammes, étoiles, arc-en-ciel | 100-300 coins |
| Thèmes grille | Asphalte, neige, espace, lave (cosmétique) | 200-500 coins |

## 6. Écrans

1. **Home** — Pseudo, rang, stats rapides, boutons "Créer une course" / "Rejoindre"
2. **Lobby** — Code de partie affiché, liste des joueurs connectés, couleurs, bouton "Lancer" (créateur only)
3. **Game** — Canvas plein écran : grille, voitures, trajectoires, cases possibles en surbrillance. Indicateur "Tour de [joueur]". Mini-chat optionnel (emojis only)
4. **Result** — Classement final, XP & coins gagnés, animations
5. **Shop** — Grille de skins/trails/thèmes avec preview, achat en coins
6. **Profile** — Stats (victoires, courses, rang, meilleur classement), historique des courses récentes

## 7. Structure Projet

```
RaceTrack/
├── index.html              # SPA multi-écrans
├── css/
│   └── style.css           # Dark theme, mobile-first, design tokens
├── src/                    # TypeScript sources
│   ├── grid.ts             # Rendu Canvas, grille, zoom/pan tactile
│   ├── physics.ts          # Mouvement, vecteurs, collision detection
│   ├── circuit.ts          # Génération circuits + validation par simulation
│   ├── game.ts             # State machine (lobby → playing → finished)
│   ├── multiplayer.ts      # Supabase client, realtime subscriptions, turns
│   ├── profiles.ts         # Auth anonyme, pseudo, localStorage
│   ├── progression.ts      # XP, rangs, coins, rewards
│   ├── shop.ts             # Skins, trails, thèmes, achats
│   └── app.ts              # Navigation écrans, init, entry point
├── dist/                   # Build output (esbuild)
│   └── bundle.js
├── sw.js                   # Service worker
├── manifest.json           # PWA manifest
├── tsconfig.json
├── package.json            # esbuild + playwright deps
├── tests/                  # Playwright tests
├── docs/                   # Specs & plans
└── CLAUDE.md
```

## 8. Mobile-First

- Canvas plein écran en portrait
- Touch : tap cases cibles pour bouger
- Pinch-zoom / pan pour naviguer le circuit
- Breakpoint 480px (comme QuizHero)
- Touch targets minimum 44px
- Performance : pas d'animations lourdes, requestAnimationFrame pour le rendu Canvas

## 9. Hors scope V1

| Feature | Version |
|---------|---------|
| Mode solo contre IA | V2 |
| Éditeur de circuits | V2 |
| Daily quests | V2 |
| Saisons / classement global | V2 |
| Coffres / loot | V2 |
| Power-ups sur la piste | V2+ |
| Login persistent (cross-device) | V2 |
| Chat texte (emojis only en V1) | V2 |
