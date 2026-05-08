// Copyright (c) Sebastian Wiesner <sebastian@swsnr.de>
// Licensed under MIT - see LICENSE file.

declare module "gi://GioUnix" {
  import type { AppInfo, Icon, AppLaunchContext, File } from "gi://Gio";

  export class DesktopAppInfo extends AppInfo {
    static new(desktop_id: string): DesktopAppInfo | null;
    get_icon(): Icon | null;
    launch(files: File[], context: AppLaunchContext | null): boolean;
  }

  const _default: { DesktopAppInfo: typeof DesktopAppInfo };
  export default _default;
}
