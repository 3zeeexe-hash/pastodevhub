declare module "pako/lib/zlib/inflate.js" {
  export function inflateInit(strm: unknown): number;
  export function inflate(strm: unknown, flush: number): number;
  export function inflateEnd(strm: unknown): number;
}
declare module "pako/lib/zlib/zstream.js" {
  export default class ZStream {
    input: Uint8Array | null;
    next_in: number;
    avail_in: number;
    total_in: number;
    output: Uint8Array | null;
    next_out: number;
    avail_out: number;
    total_out: number;
    msg: string;
  }
}
