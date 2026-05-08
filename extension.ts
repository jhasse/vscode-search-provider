// Copyright (c) 2019 Sebastian Wiesner <sebastian@swsnr.de>
// Copyright (c) 2017 Jonas Damtoft

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import GLib from "gi://GLib";
import Gio from "gi://Gio";
import type { AppInfo, File as GioFile, GSettings, Cancellable } from "gi://Gio";
import GioUnix from "gi://GioUnix";
import St from "gi://St";
import type { Icon as StIcon } from "gi://St";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

interface CodeAppInfo {
  /**
   * The desktop app providing code.
   */
  readonly app: typeof GioUnix.DesktopAppInfo.prototype;

  /**
   * The name of the configuration directory of this code app.
   */
  readonly configDirectoryName: string;
}

const findVSCode = (): CodeAppInfo | null => {
  const candidates = [
    // Standard Code OSS build on Arch Linux.
    ["code-oss.desktop", "Code - OSS"],
    // Code OSS build on Solus Linux, see <https://github.com/Jomik/vscode-search-provider/pull/10>
    ["vscode-oss.desktop", "Code - OSS"],
    // Offical VSCode snap, see <https://github.com/Jomik/vscode-search-provider/pull/14>
    // and <https://snapcraft.io/code>
    ["code_code.desktop", "Code"],
    // VSCodium support, Free/Libre Open Source Software Binaries of VSCode.
    // See <https://vscodium.com/> for explanations
    // PR: https://github.com/Jomik/vscode-search-provider/pull/30
    ["codium.desktop", "VSCodium"],
    // TODO: Figure out what systems these desktop files are from.
    ["code.desktop", "Code"],
    ["visual-studio-code.desktop", "Code"],
  ];
  for (const [desktopId, configDirectoryName] of candidates) {
    const app = GioUnix.DesktopAppInfo.new(desktopId);
    if (app) {
      console.log(`Found code at desktop app ${desktopId}`);
      return {
        app,
        configDirectoryName,
      };
    }
  }
  return null;
};

/**
 * Launch VSCode in Gnome shell.
 *
 * On failure show an error notification.
 *
 * @param vscode The vscode app
 * @param files The file to launch vscode with
 */
const launchVSCodeInShell = (vscode: AppInfo, files?: GioFile[]): void => {
  try {
    vscode.launch(files || [], null);
  } catch (err) {
    const stack = (err as {stack?: string}).stack || "<no stacktrace>";
    console.error(`Failed to launch VSCode: ${(err as Error).message}\n${stack}`);
    Main.notifyError("Failed to launch VSCode", (err as Error).message);
  }
};

type RecentItemKind = "workspace" | "file";

/**
 * A VSCode recent item.
 */
interface RecentItem {
  /**
   * The ID of this item.
   */
  readonly id: string;

  /**
   * The name of this item.
   */
  readonly name: string;

  /**
   * The shortened readable path of this item.
   */
  readonly readablePath: string;

  /**
   * The absolute path of this item.
   */
  readonly file: GioFile;

  /**
   * The kind of this item.
   */
  readonly kind: RecentItemKind;
}

type RecentItems = ReadonlyMap<string, RecentItem>;

/**
 * Lookup recent items by their identifiers.
 *
 * @param items Recent items
 * @param identifiers Identifiers to look for
 * @returns All items from `items` with any of the given `identifiers`.
 */
const lookupRecentItems = (
  items: RecentItems,
  identifiers: ReadonlyArray<string>
): RecentItem[] =>
  Array.from(items.values()).filter((item) => identifiers.includes(item.id));

/**
 * Whether an item matches all of the given terms.
 *
 * @param item The item
 * @param terms All terms to look for
 */
const recentItemMatchesTerms = (
  item: RecentItem,
  terms: ReadonlyArray<string> | null
): boolean => {
  if (!terms) {
    return false;
  } else {
    const lowerName = item.name.toLowerCase();
    const lowerReadablePath = item.readablePath.toLowerCase();
    return terms.every((term) => {
      const lowerTerm = term.toLowerCase();
      return (
        lowerName.includes(lowerTerm) || lowerReadablePath.includes(lowerTerm)
      );
    });
  }
};

/**
 * Find all items which match all of the given terms and have a kind contained in `kinds`.
 *
 * @param items Recent items
 * @param terms Terms to look for
 * @param kinds Item kinds to filter by
 * @returns The IDs of all matching items, or an empty array if terms is empty
 */
const findMatchingItems = (
  items: ReadonlyArray<RecentItem>,
  terms: ReadonlyArray<string> | null,
  kinds: ReadonlyArray<RecentItemKind>
): string[] =>
  items
    .filter(
      (item) => recentItemMatchesTerms(item, terms) && kinds.includes(item.kind)
    )
    .map((item) => item.id);

/**
 * Get a list of all enabled item kinds from the given settings.
 */
const getEnabledKinds = (
  settings: GSettings
): ReadonlyArray<RecentItemKind> => {
  const kinds: RecentItemKind[] = [];
  if (settings.get_boolean("show-workspaces")) {
    kinds.push("workspace");
  }
  if (settings.get_boolean("show-files")) {
    kinds.push("file");
  }
  return kinds;
};

/**
 * Get the search prefix set in the given settings.
 */
const getPrefix = (settings: GSettings): string =>
  settings.get_string("search-prefix");

/**
 * Check search terms against a user-specified search prefix.
 *
 * `terms` match the given `prefix` if the prefix is empty or if the first term
 * starts with `prefix`.  If terms match the prefix return `terms` with `prefix`
 * removed from the first term, otherwise return `null`.
 *
 * @param terms
 * @param prefix
 * @returns `terms` without `prefix`, or null if terms didn't match prefix
 */
const checkAndRemovePrefix = (
  terms: ReadonlyArray<string>,
  prefix: string | null | undefined
): ReadonlyArray<string> | null => {
  if (!prefix) {
    // There's no prefix so just return the terms unchanged
    return terms;
  } else {
    if (0 < terms.length && terms[0].startsWith(prefix)) {
      // The prefix matches, so remove it from the first term
      const head = terms[0].substring(prefix.length);
      const tail = terms.slice(1);
      return head ? [head, ...tail] : tail;
    } else {
      // Prefix doesn't match
      return null;
    }
  }
};

/**
 * Create a function to turn a recent item into a search provider result meta object.
 *
 * @param vscode The vscode app providing the icon
 */
interface ResultMeta {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createIcon: (size: number) => StIcon | null;
}

const resultMetaOfRecentItem = (vscode: typeof GioUnix.DesktopAppInfo.prototype) => (
  item: RecentItem
): ResultMeta => ({
  id: item.id,
  name: item.name,
  description: item.readablePath,
  createIcon: (size): StIcon | null => {
    const gicon = vscode.get_icon();
    if (gicon) {
      return new St.Icon({
        gicon,
        icon_size: size,
      });
    } else {
      return null;
    }
  },
});

/**
 * Create a search provider for the given VSCode and its given recent items.
 *
 * @param vscode The VSCode app
 * @param settings Settings of this extension
 * @param items All recent items of VSCode.
 * @returns A search provider which exposes the given items.
 */
interface SearchProvider {
  readonly id: string;
  readonly isRemoteProvider: boolean;
  readonly canLaunchSearch: boolean;
  readonly appInfo: typeof GioUnix.DesktopAppInfo.prototype;
  getInitialResultSet(terms: string[], cancellable: Cancellable): Promise<string[]>;
  getSubsearchResultSet(currentResults: string[], terms: string[], cancellable: Cancellable): Promise<string[]>;
  getResultMetas(ids: string[], cancellable: Cancellable): Promise<ResultMeta[]>;
  activateResult(id: string, terms: string[]): void;
  launchSearch(terms: string[]): void;
  filterResults(results: string[], max: number): string[];
}

const createProvider = (
  uuid: string,
  vscode: typeof GioUnix.DesktopAppInfo.prototype,
  settings: GSettings,
  items: RecentItems
): SearchProvider => ({
  id: uuid,
  canLaunchSearch: true,
  isRemoteProvider: false,
  appInfo: vscode,
  getInitialResultSet: async (terms): Promise<string[]> =>
    findMatchingItems(
      Array.from(items.values()),
      checkAndRemovePrefix(terms, getPrefix(settings)),
      getEnabledKinds(settings)
    ),
  getSubsearchResultSet: async (current, terms): Promise<string[]> =>
    findMatchingItems(
      lookupRecentItems(items, current),
      checkAndRemovePrefix(terms, getPrefix(settings)),
      getEnabledKinds(settings)
    ),
  getResultMetas: async (ids): Promise<ResultMeta[]> =>
    lookupRecentItems(items, ids).map(resultMetaOfRecentItem(vscode)),
  launchSearch: (): void => launchVSCodeInShell(vscode),
  activateResult: (id): void => {
    const item = items.get(id);
    if (item) {
      launchVSCodeInShell(vscode, [item.file]);
    }
  },
  filterResults: (results, max): string[] => results.slice(0, max),
});

/**
 * Create a recent item from a URI.
 *
 * @param kind The kind of the new item
 * @param uri The URI of the new item
 * @returns The recent item for the URI
 */
const createRecentItem = (kind: RecentItemKind, uri: string, readablePath?: string): RecentItem => {
  const file = Gio.File.new_for_uri(uri);
  return {
    id: `vscode-search-provider-${uri}`,
    name: file.get_basename() || `<unnamed ${kind}>`,
    readablePath: readablePath ?? file.get_parse_name(),
    kind,
    file,
  };
};

/**
 * A type predicate to check that an object has a certain property.
 *
 * See https://fettblog.eu/typescript-hasownproperty/, works around the fact that
 * "in" is no type predicate currently.
 *
 * @param obj The object to check
 * @param prop The property to look for
 */
const hasOwnProperty = <X extends unknown, Y extends PropertyKey>(
  obj: X,
  prop: Y
): obj is X & Record<Y, unknown> =>
  Object.prototype.hasOwnProperty.call(obj, prop);

/**
 * Convert any workspace item objects to URIs.
 *
 * @param item The workspace item from storage.json
 * @returns The URI for the workspace
 */
const parseWorkspaceItem = (item: unknown): string | null => {
  if (typeof item === "string") {
    return item;
  } else if (
    item &&
    typeof item === "object" &&
    hasOwnProperty(item, "configURIPath") &&
    typeof item.configURIPath === "string"
  ) {
    return item.configURIPath;
  } else {
    console.error(`Failed to parse workspace item: ${JSON.stringify(item)}`);
    return null;
  }
};

interface MaybeOpenedPathsList {
  readonly workspaces?: unknown;
  readonly workspaces2?: unknown;
  readonly workspaces3?: unknown;
  readonly entries?: unknown;
  readonly files?: unknown;
  readonly files2?: unknown;
}

const getRecentItemsFromStorage = (
  storage: unknown
): ReadonlyArray<RecentItem> => {
  const openedPathsList =
    storage &&
    typeof storage === "object" &&
    hasOwnProperty(storage, "openedPathsList") &&
    typeof storage.openedPathsList === "object"
      ? (storage.openedPathsList as MaybeOpenedPathsList)
      : undefined;

  if (typeof openedPathsList === "undefined") {
    console.error(
      `Failed to find openedPathsList in storage: ${JSON.stringify(storage)}`
    );
    return [];
  }

  const workspaceItems =
    openedPathsList.workspaces3 ||
    openedPathsList.workspaces2 ||
    openedPathsList.workspaces;

  const recentItems: RecentItem[] = [];
  if (workspaceItems && Array.isArray(workspaceItems)) {
    for (const item of workspaceItems) {
      const uri = parseWorkspaceItem(item);
      if (uri) {
        recentItems.push(createRecentItem("workspace", uri));
      }
    }
  }

  const recentFiles = openedPathsList.files2 || openedPathsList.files;
  if (recentFiles && Array.isArray(recentFiles)) {
    for (const item of recentFiles) {
      if (typeof item === "string") {
        recentItems.push(createRecentItem("file", item));
      } else {
        console.error(`Failed to parse recent file: ${JSON.stringify(item)}`);
      }
    }
  }

  const entries = openedPathsList.entries;
  if (entries && Array.isArray(entries)) {
    for (const item of entries) {
      if (item && typeof item.folderUri === "string") {
        recentItems.push(createRecentItem("workspace", item.folderUri));
      } else if (item && typeof item.fileUri === "string") {
        recentItems.push(createRecentItem("file", item.fileUri));
      } else {
        console.error(`Failed to parse recent path: ${JSON.stringify(item)}`);
      }
    }
  }

  return recentItems;
};

/**
 * Parse the `recently.opened` value from VS Code's state.vscdb (VS Code 1.64+).
 * Uses the label field for a human-readable description of remote entries.
 */
const getRecentItemsFromRecentlyOpened = (
  data: unknown
): ReadonlyArray<RecentItem> => {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.entries)) return [];

  const recentItems: RecentItem[] = [];
  for (const item of obj.entries as unknown[]) {
    if (item && typeof item === "object") {
      const entry = item as Record<string, unknown>;
      const label = typeof entry.label === "string" ? entry.label : undefined;
      if (typeof entry.folderUri === "string") {
        recentItems.push(createRecentItem("workspace", entry.folderUri, label));
      } else if (typeof entry.fileUri === "string") {
        recentItems.push(createRecentItem("file", entry.fileUri, label));
      }
    }
  }
  return recentItems;
};

/**
 * Read all local workspaces from VS Code's workspaceStorage directory.
 * Each workspace has a workspace.json with a "folder" URI.
 */
const getItemsFromWorkspaceStorage = (
  workspaceStorageDir: typeof Gio.File.prototype
): ReadonlyArray<RecentItem> => {
  const recentItems: RecentItem[] = [];
  try {
    const enumerator = workspaceStorageDir.enumerate_children("standard::name", 0, null);
    let info;
    while ((info = enumerator.next_file(null)) !== null) {
      const wsJsonFile = workspaceStorageDir
        .get_child(info.get_name())
        .get_child("workspace.json");
      try {
        const [, contents] = wsJsonFile.load_contents(null);
        const data = JSON.parse(new TextDecoder().decode(contents)) as unknown;
        if (data && typeof data === "object") {
          const entry = data as Record<string, unknown>;
          if (typeof entry.folder === "string") {
            recentItems.push(createRecentItem("workspace", entry.folder));
          }
        }
      } catch (_) {
        // workspace.json missing or malformed — skip
      }
    }
    enumerator.close(null);
  } catch (e) {
    console.error(`Failed to enumerate workspaceStorage: ${e}`);
  }
  return recentItems;
};

/**
 * Find recent items from VSCode.
 *
 * @param configDirectoryName The name of the config directory of the code app
 * @returns A promise with recent items
 */
const findVSCodeRecentItems = (
  configDirectoryName: string
): Promise<RecentItems> =>
  new Promise((resolve) => {
    const configDir = GLib.get_user_config_dir();
    const allItems = new Map<string, RecentItem>();

    const addItems = (items: ReadonlyArray<RecentItem>): void => {
      for (const item of items) {
        if (!allItems.has(item.id)) allItems.set(item.id, item);
      }
    };

    // VS Code 1.64+: recently.opened in state.vscdb (covers remote VFS entries)
    const dbPath = Gio.File.new_for_path(configDir)
      .get_child(configDirectoryName)
      .get_child("User")
      .get_child("globalStorage")
      .get_child("state.vscdb")
      .get_path();

    if (dbPath) {
      try {
        const sqliteBin = GLib.find_program_in_path("sqlite3");
        if (sqliteBin) {
          const [, stdout] = GLib.spawn_sync(
            null,
            [
              sqliteBin,
              dbPath,
              "SELECT value FROM ItemTable WHERE key='recently.opened'",
            ],
            null,
            0,
            null
          );
          if (stdout && stdout.length > 0) {
            const value = new TextDecoder().decode(stdout).trim();
            if (value) {
              addItems(getRecentItemsFromRecentlyOpened(JSON.parse(value) as unknown));
            }
          }
        }
      } catch (e) {
        console.error(`Failed to read state.vscdb: ${e}`);
      }
    }

    // workspaceStorage: one workspace.json per ever-opened local workspace
    const workspaceStorageDir = Gio.File.new_for_path(configDir)
      .get_child(configDirectoryName)
      .get_child("User")
      .get_child("workspaceStorage");
    addItems(getItemsFromWorkspaceStorage(workspaceStorageDir));

    if (allItems.size > 0) {
      resolve(allItems);
      return;
    }

    // Fallback: old storage.json location (VS Code < 1.64)
    try {
      const contents = Gio.File.new_for_path(configDir)
        .get_child(configDirectoryName)
        .get_child("storage.json")
        .load_contents(null)[1];

      const recentItems = getRecentItemsFromStorage(
        JSON.parse(new TextDecoder().decode(contents)) as unknown
      );
      resolve(new Map(recentItems.map((item) => [item.id, item])));
    } catch (e) {
      console.error(`Failed to read legacy storage.json: ${e}`);
      resolve(new Map());
    }
  });

export default class VSCodeSearchProvider extends Extension {
  private _provider: SearchProvider | null = null;

  enable(): void {
    const vscode = findVSCode();
    if (!vscode) {
      Main.notifyError("VSCode not found", "Try installing VSCode or VSCode OSS.");
      return;
    }
    findVSCodeRecentItems(vscode.configDirectoryName)
      .then((items) => {
        if (this._provider !== null) return; // disabled meanwhile
        this._provider = createProvider(
          this.uuid,
          vscode.app,
          this.getSettings(),
          items
        );
        Main.overview.searchController.addProvider(this._provider);
      })
      .catch((error: Error) => {
        const stack = (error as {stack?: string}).stack || "<no stacktrace>";
        console.error(`Failed to get recent VSCode entries: ${error.message}\n${stack}`);
        Main.notifyError("Failed to get recent VSCode entries", error.message);
      });
  }

  disable(): void {
    if (this._provider !== null) {
      Main.overview.searchController.removeProvider(this._provider);
      this._provider = null;
    }
  }
}
