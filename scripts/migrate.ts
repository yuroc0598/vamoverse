// Applies pending migrations to DATABASE_URL.
import { closeDb } from '../src/server/db'
import { migrate } from '../src/server/migrate'

migrate()
  .then((applied) => console.log(applied.length ? `Applied ${applied.join(', ')}` : 'Database is up to date'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(closeDb)
