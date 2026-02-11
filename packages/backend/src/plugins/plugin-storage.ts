import * as fs from "node:fs";
import * as path from "node:path";
import { Logger } from "@matter/general";
import type { PluginStorage } from "./types.js";

const logger = Logger.get("PluginStorage");

/**
 * File-based persistent storage for a plugin instance.
 * Each plugin gets its own JSON file in the storage directory.
 */
export class FilePluginStorage implements PluginStorage {
  private data: Record<string, unknown> = {};
  private dirty = false;
  private readonly filePath: string;

  constructor(storageDir: string, pluginName: string) {
    const safePluginName = pluginName.replace(/[^a-zA-Z0-9_-]/g, "_");
    this.filePath = path.join(storageDir, `plugin-${safePluginName}.json`);
    this.load();
  }

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const value = this.data[key];
    return (value as T) ?? defaultValue;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.dirty = true;
    this.save();
  }

  async delete(key: string): Promise<void> {
    delete this.data[key];
    this.dirty = true;
    this.save();
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data);
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.data = JSON.parse(raw);
      }
    } catch (e) {
      logger.warn(`Failed to load plugin storage from ${this.filePath}:`, e);
      this.data = {};
    }
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
    } catch (e) {
      logger.warn(`Failed to save plugin storage to ${this.filePath}:`, e);
    }
  }
}
