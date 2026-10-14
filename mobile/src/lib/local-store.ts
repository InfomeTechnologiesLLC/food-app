import { openDatabaseSync } from 'expo-sqlite';
import { createLocalStore } from './local-store-core';
let storage: ReturnType<typeof createLocalStore> | undefined;
function store() { return storage ??= createLocalStore(openDatabaseSync('mealmind.db')); }
export function readLocal<T>(account: string, key: string): T | null { return store().read<T>(account, key); }
export function writeLocal(account: string, key: string, value: unknown) { store().write(account, key, value); }
export function removeLocal(account: string, key: string) { store().remove(account, key); }
