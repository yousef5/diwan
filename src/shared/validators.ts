import { z } from 'zod'

// Shared by the store schema and the IPC contracts, so both accept exactly the same values.
export const AccountId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
// Rejects names made only of invisible/format characters (zero-width spaces etc).
export const AccountName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((s) => s.replace(/[\p{Cf}\s]/gu, '').length > 0, 'name is blank')
