/**
 * Web version of secure-storage.ts. Browsers have no encrypted storage, so this uses localStorage,
 * which is fine for development but readable by any script on the page.
 * localStorage can be blocked (private mode, strict settings), so failures behave like "nothing saved".
 */
const store = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export async function getItemAsync(key: string): Promise<string | null> {
  try { return store()?.getItem(key) ?? null; } catch { return null; }
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  try { store()?.setItem(key, value); } catch { /* storage blocked: kept only for this session */ }
}
export async function deleteItemAsync(key: string): Promise<void> {
  try { store()?.removeItem(key); } catch { /* nothing to remove */ }
}