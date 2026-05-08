// Copyright (c) Sebastian Wiesner <sebastian@swsnr.de>
// Licensed under MIT - see LICENSE file.

declare module "gi://GLib" {
  export function get_user_config_dir(): string;
  export function find_program_in_path(program: string): string | null;

  export function spawn_sync(
    working_directory: string | null,
    argv: string[],
    envp: string[] | null,
    flags: number,
    child_setup: null
  ): [boolean, Uint8Array | null, Uint8Array | null, number];

  const _default: {
    get_user_config_dir: typeof get_user_config_dir;
    find_program_in_path: typeof find_program_in_path;
    spawn_sync: typeof spawn_sync;
  };
  export default _default;
}
