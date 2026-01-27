/**
 * Stable ID generation using ULID
 *
 * ULIDs are:
 * - Lexicographically sortable
 * - Timestamp-based (first 48 bits)
 * - Collision-resistant
 * - URL-safe
 */

import { ulid } from 'ulid';

export function generateId(): string {
  return ulid();
}
