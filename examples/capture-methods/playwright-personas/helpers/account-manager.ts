import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_PASSWORD, personaEmail } from './config.js';

// ─── Persona IDs ────────────────────────────────────────────────────────────

const PERSONA_IDS = [
  'P01-maria', 'P02-derek', 'P03-priya', 'P04-james', 'P05-aisha',
  'P06-tom', 'P07-rachel', 'P08-marcus', 'P09-sofia', 'P10-linda',
];

const PERSONA_NAMES: Record<string, string> = {
  'P01-maria': 'Maria Santos',
  'P02-derek': 'Derek Washington',
  'P03-priya': 'Priya Chakraborty',
  'P04-james': 'James Okafor',
  'P05-aisha': 'Aisha Rahman',
  'P06-tom': 'Tom Brennan',
  'P07-rachel': 'Rachel Kim',
  'P08-marcus': 'Marcus Chen',
  'P09-sofia': 'Sofia Reyes',
  'P10-linda': 'Linda Okonkwo',
};

// ─── Create User ────────────────────────────────────────────────────────────

export async function createTestUser(
  email: string,
  password: string,
  metadata: Record<string, string> = {},
): Promise<{ id: string; email: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (body.includes('already been registered') || body.includes('already exists')) {
      console.log(`  User ${email} already exists, will reuse`);
      return { id: 'existing', email };
    }
    console.error(`  Failed to create user ${email}: ${res.status} ${body}`);
    return null;
  }

  const data = await res.json();
  console.log(`  Created user: ${email} (${data.id})`);
  return { id: data.id, email };
}

// ─── Delete User ────────────────────────────────────────────────────────────

export async function deleteTestUser(email: string): Promise<boolean> {
  const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!listRes.ok) return false;

  const listData = await listRes.json();
  const user = listData.users?.find((u: any) => u.email === email);
  if (!user) return false;

  const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (delRes.ok) {
    console.log(`  Deleted user: ${email}`);
    return true;
  }
  return false;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];

  if (command === '--ensure') {
    console.log('Ensuring all 10 test accounts exist...\n');
    for (const id of PERSONA_IDS) {
      const email = personaEmail(id);
      const name = PERSONA_NAMES[id] || id;
      await createTestUser(email, TEST_PASSWORD, {
        full_name: name,
        test_persona: id,
      });
    }
    console.log('\nDone.');
  } else if (command === '--delete-all') {
    console.log('Deleting all 10 test accounts...\n');
    for (const id of PERSONA_IDS) {
      const email = personaEmail(id);
      await deleteTestUser(email);
    }
    console.log('\nDone.');
  } else if (command === '--ensure-one' && process.argv[3]) {
    const id = process.argv[3];
    const email = personaEmail(id);
    const name = PERSONA_NAMES[id] || id;
    await createTestUser(email, TEST_PASSWORD, {
      full_name: name,
      test_persona: id,
    });
  } else {
    console.log('Usage:');
    console.log('  npx tsx helpers/account-manager.ts --ensure          # Create all 10 accounts');
    console.log('  npx tsx helpers/account-manager.ts --delete-all      # Delete all 10 accounts');
    console.log('  npx tsx helpers/account-manager.ts --ensure-one P01-maria  # Create one account');
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
