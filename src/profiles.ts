import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from './types';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const LOCAL_NAME_KEY = 'rt_name';

// Use a fallback placeholder URL so createClient doesn't throw synchronously
// when real credentials are not configured (e.g. in tests / offline dev).
const safeUrl = SUPABASE_URL.startsWith('http') ? SUPABASE_URL : 'https://placeholder.supabase.co';
export const supabase: SupabaseClient = createClient(safeUrl, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Ensure we have an authenticated session. Uses existing session if available,
 * otherwise signs in anonymously. Returns the user ID.
 */
export async function initAuth(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(`Auth failed: ${error?.message ?? 'no user returned'}`);
  }
  return data.user.id;
}

/**
 * Return the current authenticated user ID. Throws if not authenticated.
 */
export function getUserId(): string {
  // supabase.auth.getUser() is async; we use the cached session instead.
  const session = (supabase.auth as any)._session as { user?: { id: string } } | null;
  if (session?.user?.id) {
    return session.user.id;
  }
  throw new Error('Not authenticated — call initAuth() first');
}

// ---------------------------------------------------------------------------
// Local name (localStorage)
// ---------------------------------------------------------------------------

export function getLocalName(): string | null {
  return localStorage.getItem(LOCAL_NAME_KEY);
}

export function setLocalName(name: string): void {
  localStorage.setItem(LOCAL_NAME_KEY, name);
}

// ---------------------------------------------------------------------------
// Profile (Supabase)
// ---------------------------------------------------------------------------

/**
 * Fetch existing profile or create a new one for the current user.
 */
export async function getOrCreateProfile(): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (existing) {
    return mapRowToProfile(existing);
  }

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = row not found; any other error is unexpected
    throw new Error(`Failed to fetch profile: ${fetchError.message}`);
  }

  // Create new profile
  const name = getLocalName() ?? 'Pilote';
  const newProfile = {
    id: user.id,
    name,
    xp: 0,
    coins: 0,
    rank: 'Karting',
    games_played: 0,
    games_won: 0,
    owned_skins: [],
    owned_trails: [],
    owned_themes: [],
  };

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(newProfile)
    .select()
    .single();

  if (insertError || !created) {
    throw new Error(`Failed to create profile: ${insertError?.message}`);
  }

  return mapRowToProfile(created);
}

/**
 * Update profile fields in Supabase.
 */
export async function updateProfile(updates: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.xp !== undefined) dbUpdates.xp = updates.xp;
  if (updates.coins !== undefined) dbUpdates.coins = updates.coins;
  if (updates.rank !== undefined) dbUpdates.rank = updates.rank;
  if (updates.games_played !== undefined) dbUpdates.games_played = updates.games_played;
  if (updates.games_won !== undefined) dbUpdates.games_won = updates.games_won;
  if (updates.owned_skins !== undefined) dbUpdates.owned_skins = updates.owned_skins;
  if (updates.owned_trails !== undefined) dbUpdates.owned_trails = updates.owned_trails;
  if (updates.owned_themes !== undefined) dbUpdates.owned_themes = updates.owned_themes;

  const { data, error } = await supabase
    .from('profiles')
    .update(dbUpdates)
    .eq('id', user.id)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Failed to update profile: ${error?.message}`);
  }

  return mapRowToProfile(data);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRowToProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    name: row.name as string,
    xp: row.xp as number,
    coins: row.coins as number,
    rank: row.rank as string,
    games_played: row.games_played as number,
    games_won: row.games_won as number,
    owned_skins: (row.owned_skins as string[]) ?? [],
    owned_trails: (row.owned_trails as string[]) ?? [],
    owned_themes: (row.owned_themes as string[]) ?? [],
  };
}
