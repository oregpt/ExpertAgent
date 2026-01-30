import { AnyApiCapability } from './anyapi/anyapiCapability';
import { Capability } from './types';

const registry: Record<string, Capability> = {
  anyapi: new AnyApiCapability(),
};

export function getCapability(id: string): Capability | undefined {
  return registry[id];
}

export function listCapabilities(): { id: string; name: string; description: string }[] {
  return Object.values(registry).map((cap) => ({ id: cap.id, name: cap.name, description: cap.description }));
}
