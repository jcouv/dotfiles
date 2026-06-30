declare global {
  interface Window {
    __codeReviewCanvas?: {
      serverId?: string;
      initialTargetMode?: string;
    };
  }
}

declare module "https://esm.sh/@pierre/diffs@1.2.11?bundle" {
  export const FileDiff: any;
  export function parsePatchFiles(...args: any[]): any[];
}

export {};

