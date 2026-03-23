import type { DataService } from "./types";

const globalForData = globalThis as unknown as { dataService: DataService | undefined };

export async function getDataService(): Promise<DataService> {
  if (globalForData.dataService) return globalForData.dataService;

  const provider = process.env.DATA_PROVIDER ?? "mock";

  switch (provider) {
    case "mock": {
      const { createMockDataService } = await import("./providers/mock");
      globalForData.dataService = createMockDataService();
      break;
    }
    case "neon": {
      const { createNeonDataService } = await import("./providers/neon");
      globalForData.dataService = createNeonDataService();
      break;
    }
    default:
      throw new Error(`Unknown data provider: ${provider}`);
  }

  return globalForData.dataService!;
}

/** Clear the cached data service singleton (forces re-creation on next call) */
export function clearDataService() {
  globalForData.dataService = undefined;
}
