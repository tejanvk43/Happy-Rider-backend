const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

/**
 * Run all SQL migrations
 */
async function runMigrations() {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found');
    return;
  }

  console.log(`Found ${files.length} migration file(s)`);

  for (const file of files) {
    try {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`\n▶️  Running migration: ${file}`);

      // Split by semicolon and filter empty statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        if (error) {
          // Ignore "does not exist" errors as they're expected on re-runs
          if (!error.message.includes('does not exist')) {
            throw error;
          }
        }
      }

      console.log(`✓ Migration completed: ${file}`);
    } catch (error) {
      console.error(`✗ Migration failed for ${file}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n✓ All migrations completed successfully!');
}

// Run migrations if executed directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
