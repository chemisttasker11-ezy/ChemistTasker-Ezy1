export type StorageAdapter = {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
};

let storageAdapter: StorageAdapter | null = null;

export function configureStorage(adapter: StorageAdapter) {
    storageAdapter = adapter;
}

function getStorageAdapter(): StorageAdapter {
    if (!storageAdapter) {
        throw new Error('Storage not configured. Call configureStorage() first.');
    }
    return storageAdapter;
}

export async function storageGetItem(key: string): Promise<string | null> {
    const value = getStorageAdapter().getItem(key);
    return value instanceof Promise ? await value : value;
}

export async function storageSetItem(key: string, value: string): Promise<void> {
    const result = getStorageAdapter().setItem(key, value);
    if (result instanceof Promise) {
        await result;
    }
}

export async function storageRemoveItem(key: string): Promise<void> {
    const result = getStorageAdapter().removeItem(key);
    if (result instanceof Promise) {
        await result;
    }
}
