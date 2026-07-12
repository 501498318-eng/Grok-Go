declare module "write-file-atomic" {
  interface WriteFileOptions {
    encoding?: BufferEncoding;
    mode?: number;
    chown?: { uid: number; gid: number };
    fsync?: boolean;
  }

  export default function writeFileAtomic(
    filename: string,
    data: string | NodeJS.ArrayBufferView,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void>;
}
