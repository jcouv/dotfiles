import { AsyncLocalStorage } from "node:async_hooks";

export const servers = new Map<string, { server: { close(callback: () => void): void }; url: string }>();
export const selections = new Map<string, unknown>();
export const openInputs = new Map<string, Record<string, unknown>>();
export const workingDirectories = new Map<string, string>();
export const eventClients = new Map<string, Set<any>>();
export const workingDirectoryStorage = new AsyncLocalStorage<string>();
export const fullFileDiffContext = "999999";
export const stablePortBase = 49152;
export const stablePortCount = 12000;
export const serverId = `${process.pid}-${Date.now()}`;
