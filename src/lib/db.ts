import Database from "@tauri-apps/plugin-sql";

export const DB_URL = "sqlite:pos.db";

/**
 * Veritabanı bağlantısı.
 *
 * React 19 StrictMode geliştirme sırasında efektleri iki kez çalıştırır;
 * bu yüzden söz tutu tek bir modül seviyesindeki değişkende saklanır ve
 * eşzamanlı `Database.load()` çağrıları tek bir bağlama düşer.
 * Başarısızlık halinde söz tutu sıfırlanır ki yeniden denensin.
 */
let connection: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!connection) {
    connection = Database.load(DB_URL).catch((error: unknown) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}
