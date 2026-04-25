---
name: RaceTrack deploy setup
description: GitHub repo, subtree push workflow, and GitHub Pages deployment details
type: reference
---

## GitHub Repo
- Repo : `pezzonidasit/RaceTrack` (public)
- URL : https://github.com/pezzonidasit/RaceTrack
- Live : https://pezzonidasit.github.io/RaceTrack/

## Deploy Workflow
- GitHub Actions : `.github/workflows/deploy.yml`
- Trigger : push to `main`
- Steps : npm ci → build → typecheck → copie _site/ → deploy Pages

## Subtree Push (depuis le mono-repo)
RaceTrack vit dans `~/projects/claude-workspace/RaceTrack/` (mono-repo claude-workspace). Pour push vers le repo dédié :

```bash
cd ~/projects/claude-workspace
git remote add racetrack https://github.com/pezzonidasit/RaceTrack.git  # déjà fait
git subtree push --prefix=RaceTrack racetrack main
```

Si conflit (non-fast-forward) :
```bash
git subtree split --prefix=RaceTrack -b racetrack-only
git push racetrack racetrack-only:main --force
git branch -D racetrack-only
```

## Service Worker
Avant chaque deploy, incrémenter `CACHE_NAME` dans `sw.js` (ex: `racetrack-v1` → `racetrack-v2`).
