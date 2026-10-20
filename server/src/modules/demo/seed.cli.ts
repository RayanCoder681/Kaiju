/** CLI de données de démo : `npm run seed:demo`. Hors ligne, idempotent, supprimable. */
import { getDb, closeDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migrate.js';
import { getRepositories } from '../../context.js';
import { seedDemo } from './seed.js';

async function main(): Promise<void> {
  getDb();
  runMigrations();
  const result = await seedDemo(getRepositories());
  if (result.created) {
    console.log(`Données de démo créées. Code de session : ${result.code}`);
    console.log('Compte organisateur démo : identifiant « demo » / mot de passe « demo-kaiju-2026 »');
    console.log('Les éléments de démo sont préfixés « [DÉMO] » et peuvent être supprimés.');
  } else {
    console.log(`Données de démo déjà présentes (code : ${result.code}).`);
  }
  closeDb();
}

main().catch((err) => {
  console.error('Échec du seed démo :', (err as Error).message);
  closeDb();
  process.exit(1);
});
