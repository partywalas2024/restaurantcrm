// Creates the initial sign-ins. Safe to re-run: existing usernames are left
// alone, so it never overwrites a password someone has since changed.
//
//   npm run seed:users
//
// Set ADMIN_PASSWORD / JUNCTION14_PASSWORD to choose the passwords, otherwise
// strong ones are generated and printed once.

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generatePassword, hashPassword } from "../src/lib/password";

const SEED_USERS = [
  {
    username: "admin",
    name: "Administrator",
    email: "gauravfeel@gmail.com",
    role: "ADMIN" as const,
    envVar: "ADMIN_PASSWORD",
  },
  {
    username: "junction14",
    name: "Junction 14",
    email: null,
    role: "USER" as const,
    envVar: "JUNCTION14_PASSWORD",
  },
];

async function main() {
  const created: { username: string; password: string; role: string }[] = [];

  for (const seed of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { username: seed.username } });
    if (existing) {
      console.log(`• @${seed.username} already exists — left unchanged.`);
      continue;
    }

    const password = process.env[seed.envVar] || generatePassword();
    await prisma.user.create({
      data: {
        username: seed.username,
        name: seed.name,
        email: seed.email,
        role: seed.role,
        passwordHash: await hashPassword(password),
      },
    });
    created.push({ username: seed.username, password, role: seed.role });
  }

  if (created.length > 0) {
    console.log("\n─────────── SIGN-IN CREDENTIALS ───────────");
    console.log("Shown once. Store them in a password manager, then");
    console.log("change them from Settings after the first sign-in.\n");
    for (const u of created) {
      console.log(`  ${u.role.padEnd(5)}  username: ${u.username}`);
      console.log(`         password: ${u.password}\n`);
    }
    console.log("───────────────────────────────────────────");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
