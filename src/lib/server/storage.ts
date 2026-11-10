// 附件存储。MVP 本地磁盘；STORAGE_DRIVER=s3 二期接入。
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

function root(): string {
  return path.resolve(process.env.STORAGE_ROOT ?? "./storage");
}

function resolveKey(key: string): string {
  const base = root();
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("非法存储路径");
  return full;
}

const localDriver: StorageDriver = {
  async put(key, data) {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { flag: "wx" });
  },
  async get(key) {
    return readFile(resolveKey(key));
  },
};

export function storage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver !== "local") throw new Error(`存储驱动 ${driver} 尚未实现`);
  return localDriver;
}

/** 生成存储键；文件名只保留安全字符 */
export function makeKey(prefix: string, fileName: string): string {
  const safe = fileName.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-80) || "file";
  return `${prefix}/${randomUUID()}-${safe}`;
}
