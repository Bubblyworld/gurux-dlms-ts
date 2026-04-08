import type { EmscriptenModule, GuruxModuleFactory } from './types.js';

export async function loadGuruxModule(): Promise<EmscriptenModule> {
  const createModule = await loadGuruxFactory();
  return createModule({
    print: () => {},
    printErr: () => {},
  });
}

async function loadGuruxFactory(): Promise<GuruxModuleFactory> {
  const { default: factory } = await import(
    new URL('../build/gurux.js', import.meta.url).href
  );
  return factory;
}
