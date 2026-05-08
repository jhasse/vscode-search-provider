// Copyright (c) Sebastian Wiesner <sebastian@swsnr.de>
// Licensed under MIT - see LICENSE file.

declare module "gi://St" {
  import type { Icon as GioIcon } from "gi://Gio";

  export class Icon {
    constructor(props: { gicon: GioIcon; icon_size: number });
  }

  const _default: { Icon: typeof Icon };
  export default _default;
}
