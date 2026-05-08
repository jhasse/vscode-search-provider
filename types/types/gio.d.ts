// Copyright (c) Sebastian Wiesner <sebastian@swsnr.de>
// Licensed under MIT - see LICENSE file.

declare module "gi://Gio" {
  export class FileInfo {
    private constructor();
    get_name(): string;
  }

  export class FileEnumerator {
    private constructor();
    next_file(cancellable: Cancellable | null): FileInfo | null;
    close(cancellable: Cancellable | null): boolean;
  }

  export class File {
    private constructor();

    static new_for_uri(uri: string): File;
    static new_for_path(path: string): File;
    get_child(name: string): File;
    get_path(): string | null;
    get_basename(): string | null;
    get_parse_name(): string;
    load_contents(cancellable: Cancellable | null): [boolean, Uint8Array, string];
    enumerate_children(attributes: string, flags: number, cancellable: Cancellable | null): FileEnumerator;
  }

  export class Cancellable {
    constructor();
  }

  export class AppLaunchContext {
    private constructor();
  }

  export class Icon {
    private constructor();
  }

  export class AppInfo {
    protected constructor();
    get_name(): string;
    get_icon(): Icon | null;
    launch(files: File[], context: AppLaunchContext | null): boolean;
  }

  export class GSettings {
    private constructor();
    get_string(key: string): string;
    get_boolean(key: string): boolean;
  }

  const _default: {
    File: typeof File;
    FileInfo: typeof FileInfo;
    FileEnumerator: typeof FileEnumerator;
    Cancellable: typeof Cancellable;
    AppLaunchContext: typeof AppLaunchContext;
    Icon: typeof Icon;
    AppInfo: typeof AppInfo;
    GSettings: typeof GSettings;
  };
  export default _default;
}
