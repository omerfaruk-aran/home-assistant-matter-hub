import type { StorageContext, SupportedStorageTypes } from "@matter/main";
import { Service } from "../../core/ioc/service.js";
import type { AppStorage } from "./app-storage.js";

type StorageObjectType = { [key: string]: SupportedStorageTypes };

export interface AuthSettings {
  username: string;
  password: string;
}

export interface BackupSettings {
  autoBackup: boolean;
  backupRetentionCount: number;
}

const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  autoBackup: true,
  backupRetentionCount: 5,
};

interface StoredSettings {
  auth?: AuthSettings;
  backup?: Partial<BackupSettings>;
}

export class AppSettingsStorage extends Service {
  private storage!: StorageContext;
  private settings: StoredSettings = {};

  constructor(private readonly appStorage: AppStorage) {
    super("AppSettingsStorage");
  }

  protected override async initialize() {
    this.storage = this.appStorage.createContext("settings");
    const stored = await this.storage.get<StorageObjectType>(
      "data",
      {} as StorageObjectType,
    );
    this.settings = (stored as unknown as StoredSettings) ?? {};
  }

  get auth(): AuthSettings | undefined {
    return this.settings.auth;
  }

  async setAuth(auth: AuthSettings | undefined): Promise<void> {
    this.settings.auth = auth;
    await this.persist();
  }

  get backupSettings(): BackupSettings {
    return { ...DEFAULT_BACKUP_SETTINGS, ...this.settings.backup };
  }

  async setBackupSettings(settings: Partial<BackupSettings>): Promise<void> {
    this.settings.backup = { ...this.settings.backup, ...settings };
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.storage.set(
      "data",
      this.settings as unknown as StorageObjectType,
    );
  }
}
