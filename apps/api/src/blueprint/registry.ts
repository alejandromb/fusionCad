/**
 * Blueprint Registry — stores and retrieves blueprint definitions
 */

import type { Blueprint } from '@fusion-cad/core-model';

import relayOutputBp from '@fusion-cad/core-model/src/blueprint/builtins/relay-output.json' with { type: 'json' };
import powerSectionBp from '@fusion-cad/core-model/src/blueprint/builtins/power-section.json' with { type: 'json' };
import relayBankBp from '@fusion-cad/core-model/src/blueprint/builtins/relay-bank.json' with { type: 'json' };

const blueprintRegistry = new Map<string, Blueprint>();

export function registerBlueprint(bp: Blueprint): void {
  blueprintRegistry.set(bp.id, bp);
}

export function getBlueprintById(id: string): Blueprint | undefined {
  return blueprintRegistry.get(id);
}

export function getAllBlueprints(): Blueprint[] {
  return Array.from(blueprintRegistry.values());
}

export function registerBuiltinBlueprints(): void {
  for (const bp of [relayOutputBp, powerSectionBp, relayBankBp]) {
    registerBlueprint(bp as unknown as Blueprint);
  }
}
