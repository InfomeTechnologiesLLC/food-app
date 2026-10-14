export interface LocalDriver {
  execSync(sql: string): void;
  getFirstSync<T>(sql: string, ...params: string[]): T | null;
  runSync(sql: string, ...params: string[]): unknown;
}
export function createLocalStore(driver: LocalDriver) {
  driver.execSync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS local_data (account TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(account, key));');
  return {
    read<T>(account: string, key: string): T | null {
      const row = driver.getFirstSync<{ value: string }>('SELECT value FROM local_data WHERE account = ? AND key = ?', account, key);
      return row ? JSON.parse(row.value) as T : null;
    },
    write(account: string, key: string, value: unknown) {
      driver.runSync('INSERT INTO local_data(account, key, value) VALUES (?, ?, ?) ON CONFLICT(account, key) DO UPDATE SET value = excluded.value', account, key, JSON.stringify(value));
    },
    remove(account: string, key: string) { driver.runSync('DELETE FROM local_data WHERE account = ? AND key = ?', account, key); },
  };
}
