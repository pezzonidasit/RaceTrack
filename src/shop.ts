import { getOrCreateProfile, updateProfile } from './profiles';
import type { Profile } from './types';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface ShopItem {
  id: string;
  name: string;
  category: 'skin' | 'trail' | 'theme';
  price: number;
  rarity: 'common' | 'rare' | 'epic';
  emoji: string;
}

export const SHOP_CATALOG: ShopItem[] = [
  // Skins (price 0 = free/default)
  { id: 'skin-red',    name: 'Rouge Feu',  category: 'skin',  price: 0,   rarity: 'common', emoji: '🔴' },
  { id: 'skin-blue',   name: 'Bleu Glace', category: 'skin',  price: 0,   rarity: 'common', emoji: '🔵' },
  { id: 'skin-rocket', name: 'Fusée',      category: 'skin',  price: 100, rarity: 'rare',   emoji: '🚀' },
  { id: 'skin-f1',     name: 'Formule 1',  category: 'skin',  price: 150, rarity: 'rare',   emoji: '🏎️' },
  { id: 'skin-moto',   name: 'Superbike',  category: 'skin',  price: 200, rarity: 'epic',   emoji: '🏍️' },
  // Trails
  { id: 'trail-dots',    name: 'Pointillés',  category: 'trail', price: 0,   rarity: 'common', emoji: '···' },
  { id: 'trail-fire',    name: 'Flammes',     category: 'trail', price: 150, rarity: 'rare',   emoji: '🔥' },
  { id: 'trail-stars',   name: 'Étoiles',     category: 'trail', price: 200, rarity: 'rare',   emoji: '⭐' },
  { id: 'trail-rainbow', name: 'Arc-en-ciel', category: 'trail', price: 300, rarity: 'epic',   emoji: '🌈' },
  // Themes
  { id: 'theme-asphalt', name: 'Asphalte', category: 'theme', price: 0,   rarity: 'common', emoji: '🛣️' },
  { id: 'theme-snow',    name: 'Neige',    category: 'theme', price: 250, rarity: 'rare',   emoji: '❄️' },
  { id: 'theme-space',   name: 'Espace',   category: 'theme', price: 400, rarity: 'epic',   emoji: '🌌' },
  { id: 'theme-lava',    name: 'Lave',     category: 'theme', price: 500, rarity: 'epic',   emoji: '🌋' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOwned(profile: Profile, item: ShopItem): boolean {
  if (item.price === 0) return true;
  if (item.category === 'skin')  return profile.owned_skins.includes(item.id);
  if (item.category === 'trail') return profile.owned_trails.includes(item.id);
  if (item.category === 'theme') return profile.owned_themes.includes(item.id);
  return false;
}

function categoryLabel(cat: ShopItem['category']): string {
  switch (cat) {
    case 'skin':  return 'Véhicules';
    case 'trail': return 'Traînées';
    case 'theme': return 'Pistes';
  }
}

// ---------------------------------------------------------------------------
// Buy
// ---------------------------------------------------------------------------

async function buyItem(itemId: string): Promise<void> {
  const item = SHOP_CATALOG.find(i => i.id === itemId);
  if (!item) return;

  const profile = await getOrCreateProfile();

  if (isOwned(profile, item)) return;
  if (profile.coins < item.price) {
    alert(`Pas assez de pièces ! Il te faut ${item.price} 🪙 (tu as ${profile.coins} 🪙)`);
    return;
  }

  const updates: Partial<Omit<typeof profile, 'id'>> = {
    coins: profile.coins - item.price,
  };

  if (item.category === 'skin') {
    updates.owned_skins = [...profile.owned_skins, item.id];
  } else if (item.category === 'trail') {
    updates.owned_trails = [...profile.owned_trails, item.id];
  } else if (item.category === 'theme') {
    updates.owned_themes = [...profile.owned_themes, item.id];
  }

  await updateProfile(updates);
  await renderShop();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export async function renderShop(): Promise<void> {
  const container = document.getElementById('shop-container');
  if (!container) return;

  const profile = await getOrCreateProfile();

  // Group items by category
  const categories: ShopItem['category'][] = ['skin', 'trail', 'theme'];

  let html = `<div id="shop-coins">🪙 ${profile.coins} pièces</div>`;

  for (const cat of categories) {
    const items = SHOP_CATALOG.filter(i => i.category === cat);
    html += `<h3 style="margin-top:16px;margin-bottom:4px;color:var(--text-muted);font-size:0.85rem;text-transform:uppercase;letter-spacing:1px;">${categoryLabel(cat)}</h3>`;
    html += `<div id="shop-grid">`;

    for (const item of items) {
      const owned = isOwned(profile, item);
      const canAfford = profile.coins >= item.price;
      const isFree = item.price === 0;

      let btnLabel: string;
      let btnDisabled: boolean;
      if (owned) {
        btnLabel = isFree ? 'Gratuit' : 'Acheté';
        btnDisabled = true;
      } else if (!canAfford) {
        btnLabel = `${item.price} 🪙`;
        btnDisabled = true;
      } else {
        btnLabel = `${item.price} 🪙`;
        btnDisabled = false;
      }

      html += `
        <div class="shop-item${owned ? ' owned' : ''}">
          <div class="shop-emoji">${item.emoji}</div>
          <div class="shop-name">${item.name}</div>
          <div class="shop-price rarity-${item.rarity}">${item.rarity}</div>
          <button
            class="btn btn-small shop-buy"
            data-item-id="${item.id}"
            ${btnDisabled ? 'disabled' : ''}
          >${btnLabel}</button>
        </div>
      `;
    }

    html += `</div>`;
  }

  container.innerHTML = html;

  // Attach buy handlers
  container.querySelectorAll<HTMLButtonElement>('.shop-buy:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.itemId;
      if (itemId) buyItem(itemId).catch(console.error);
    });
  });
}
