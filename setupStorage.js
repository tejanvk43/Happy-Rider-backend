/**
 * setupStorage.js
 *
 * One-time setup script to:
 *  1. Create the 'kyc' bucket in Supabase Storage (if it doesn't exist)
 *  2. Make the bucket PUBLIC so images can be previewed in the app
 *  3. Run the 003_fix_kyc_columns.sql migration
 *
 * Run: node setupStorage.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const BUCKET_NAME = 'kyc';

async function setupBucket() {
  console.log('\n📦 Setting up Supabase Storage bucket...');

  // Check if bucket already exists
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('❌ Could not list buckets:', listErr.message);
    return false;
  }

  const exists = buckets.some((b) => b.name === BUCKET_NAME);

  if (exists) {
    console.log(`✅ Bucket "${BUCKET_NAME}" already exists.`);
    return true;
  }

  // Create public bucket
  const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,           // Files accessible via public URL without auth
    fileSizeLimit: 5242880, // 5MB — matches backend multer limit
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png'],
  });

  if (error) {
    console.error('❌ Failed to create bucket:', error.message);
    return false;
  }

  console.log(`✅ Bucket "${BUCKET_NAME}" created successfully (public).`);
  return true;
}

async function runMigration() {
  console.log('\n🗃️  Running DB migration 003_fix_kyc_columns.sql...');

  const sqlPath = path.join(__dirname, 'migrations', '003_fix_kyc_columns.sql');

  if (!fs.existsSync(sqlPath)) {
    console.error('❌ Migration file not found:', sqlPath);
    return false;
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split into individual statements and run each
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  let success = true;

  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).catch(() => ({
      error: { message: 'RPC not available' },
    }));

    // Try direct query approach if RPC fails
    if (error) {
      // Supabase JS SDK doesn't support raw DDL via .rpc() by default.
      // Log the SQL so it can be run manually in Supabase SQL Editor.
      console.log('\n⚠️  Cannot run DDL via JS SDK. Run this SQL manually in Supabase SQL Editor:');
      console.log('─'.repeat(60));
      console.log(sql);
      console.log('─'.repeat(60));
      success = false;
      break;
    }
  }

  if (success) {
    console.log('✅ Migration 003 applied successfully.');
  }

  return success;
}

async function main() {
  console.log('🚀 Happi Ride — Storage & Migration Setup');
  console.log('=========================================');

  const bucketOk = await setupBucket();
  await runMigration();

  console.log('\n✅ Setup complete!');
  console.log('\nNext steps:');
  console.log('  1. If migration SQL was printed above, run it in Supabase SQL Editor');
  console.log('  2. Deploy backend to Render');
  console.log('  3. Test upload with the app');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
