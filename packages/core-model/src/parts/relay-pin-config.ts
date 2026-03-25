/**
 * Standard relay contact pin numbering configurations.
 *
 * IEC/ANSI standard pin numbering for relay contacts:
 * - NO contacts: 13-14 (1st), 23-24 (2nd), 33-34 (3rd), 43-44 (4th)
 * - NC contacts: 11-12 (1st), 21-22 (2nd), 31-32 (3rd), 41-42 (4th)
 *
 * The digit tens = contact pair number, units = function:
 *   1/2 = NC, 3/4 = NO
 *
 * Usage: When placing a linked device for relay contact N,
 * call getContactPinAliases('no', N) to get the pinAliases map.
 */

/**
 * Get pin aliases for a relay contact based on type and contact number.
 *
 * @param contactType 'no' for normally open, 'nc' for normally closed
 * @param contactNumber 1-based index (1st contact, 2nd contact, etc.)
 * @returns Record mapping symbol pin IDs to real relay pin numbers
 */
export function getContactPinAliases(
  contactType: 'no' | 'nc',
  contactNumber: number,
): Record<string, string> {
  const tens = contactNumber; // 1→1x, 2→2x, 3→3x, 4→4x
  if (contactType === 'no') {
    return {
      '1': `${tens}3`,
      '2': `${tens}4`,
    };
  } else {
    return {
      '1': `${tens}1`,
      '2': `${tens}2`,
    };
  }
}

/**
 * Standard pin aliases for common relay configurations.
 * Maps part category patterns to default pin configurations.
 */
export const STANDARD_CONTACT_PINS: Record<string, Record<string, string>> = {
  // First NO contact pair (most common)
  'relay-contact-no': { '1': '13', '2': '14' },
  'relay-contact-nc': { '1': '11', '2': '12' },
  // Coil pins
  'relay-coil': { '1': 'A1', '2': 'A2' },
};
