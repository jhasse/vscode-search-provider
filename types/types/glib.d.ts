// Copyright (c) Sebastian Wiesner <sebastian@swsnr.de>
// Licensed under MIT - see LICENSE file.

declare module "gi://GLib" {
  export function get_user_config_dir(): string;
  export function get_home_dir(): string;
  export function find_program_in_path(program: string): string | null;

  const _default: {
    get_user_config_dir: typeof get_user_config_dir;
    get_home_dir: typeof get_home_dir;
    find_program_in_path: typeof find_program_in_path;
  };
  export default _default;
}
