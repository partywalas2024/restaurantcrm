// Creates the initial Partywalas platform admin (SUPER_ADMIN). Safe to re-run:
// if the account already exists it's left alone, so it never overwrites a
// password someone has since changed.
//
//   npm run seed:users
//
// Set ADMIN_PASSWORD to choose the password, otherwise a strong one is
// generated and printed once.
//
// Restaurant accounts (RESTAURANT_ADMIN) are created from the platform admin's
// /platform page, which creates the Restaurant and its first admin together —
// not from this script.

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generatePassword, hashPassword } from "../src/lib/password";

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: "admin" } });
  if (existing) {
    console.log("• @admin already exists — left unchanged.");
    await prisma.$disconnect();
    return;
  }

  const password = process.env.ADMIN_PASSWORD || generatePassword();
  await prisma.user.create({
    data: {
      username: "admin",
      name: "Administrator",
      email: "gauravfeel@gmail.com",
      role: "SUPER_ADMIN",
      passwordHash: await hashPassword(password),
    },
  });

  console.log("\n─────────── SIGN-IN CREDENTIALS ───────────");
  console.log("Shown once. Store it in a password manager, then");
  console.log("change it from Settings after the first sign-in.\n");
  console.log("  SUPER_ADMIN  username: admin");
  console.log(`               password: ${password}\n`);
  console.log("───────────────────────────────────────────");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
