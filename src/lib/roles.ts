// Role vocabulary shared by server and client code.
//
// Stored roles stay SUPER_ADMIN / RESTAURANT_ADMIN / USER (changing an enum
// value would mean migrating every user row). In the product they are called:
//   RESTAURANT_ADMIN -> Owner  (full access; the only one who can edit/delete)
//   USER             -> Staff  (can add and upload; cannot edit or delete)

export const ROLE_LABEL = {
  SUPER_ADMIN: "Partywalas Admin",
  RESTAURANT_ADMIN: "Owner",
  USER: "Staff",
} as const;

export function isOwner(role: string): boolean {
  return role === "RESTAURANT_ADMIN";
}
