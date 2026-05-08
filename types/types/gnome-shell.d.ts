// Copyright (c) Sebastian Wiesner <sebastian@swsnr.de>
// Licensed under MIT - see LICENSE file.

import type { GSettings } from "gi://Gio";

declare module "resource:///org/gnome/shell/extensions/extension.js" {
  export class Extension {
    readonly metadata: { name: string; [key: string]: unknown };
    readonly uuid: string;
    readonly path: string;
    getSettings(schema?: string): GSettings;
    enable(): void;
    disable(): void;
  }
}

declare module "resource:///org/gnome/shell/ui/main.js" {
  export function notifyError(msg: string, details: string): void;

  export const overview: {
    searchController: {
      addProvider(provider: unknown): void;
      removeProvider(provider: unknown): void;
    };
  };
}
