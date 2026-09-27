import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { interfaceZoomLevels, isInterfaceZoom } from "../../contracts/desktop-state";
import {
  decodePersistedUiState,
  decodePersistedInterfaceZoom,
  readPersistedInterfaceZoom,
  writePersistedInterfaceZoom,
} from "../../electron/persistence/app-store-persistence";

test("accepts only supported interface zoom percentages", async () => {
  for (const level of interfaceZoomLevels) {
    expect(isInterfaceZoom(level)).toBe(true);
  }

  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "100", 115, 200, null]) {
    expect(isInterfaceZoom(value)).toBe(false);
    expect(() => decodePersistedInterfaceZoom({ interfaceZoom: value })).toThrow(
      "Invalid persisted interface zoom",
    );
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "pi-gui-interface-zoom-state-"));
  const sidecarPath = join(userDataDir, "interface-zoom.json");
  expect(await readPersistedInterfaceZoom(sidecarPath)).toBe(100);
  for (const level of interfaceZoomLevels) {
    await writePersistedInterfaceZoom(sidecarPath, level);
    expect(await readPersistedInterfaceZoom(sidecarPath)).toBe(level);
  }

  for (const value of ["100", 115, 200, null]) {
    await writeFile(sidecarPath, JSON.stringify({ interfaceZoom: value }), "utf8");
    expect(await readPersistedInterfaceZoom(sidecarPath)).toBe(100);
  }
  await writeFile(sidecarPath, JSON.stringify({ interfaceZoom: 115 }), "utf8");
  expect(await readPersistedInterfaceZoom(sidecarPath)).toBe(100);
  await expect(readFile(sidecarPath, "utf8")).resolves.toContain('"interfaceZoom":115');
});

test("recovers the last valid interface zoom from its sidecar backup", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pi-gui-interface-zoom-backup-"));
  const sidecarPath = join(userDataDir, "interface-zoom.json");

  await writePersistedInterfaceZoom(sidecarPath, 125);
  await writePersistedInterfaceZoom(sidecarPath, 150);
  await writeFile(sidecarPath, "{ truncated", "utf8");

  await expect(readPersistedInterfaceZoom(sidecarPath)).resolves.toBe(125);
});

test("decodes v1.0.1 builtin settings while zoom remains isolated in its sidecar", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pi-gui-ui-zoom-compat-"));
  const uiStatePath = join(userDataDir, "ui-state.json");
  const sidecarPath = join(userDataDir, "interface-zoom.json");
  const uiState = {
    version: 19,
    disabledBuiltinExtensions: ["pi-gui-thread-orchestration"],
  };
  await writeFile(uiStatePath, `${JSON.stringify(uiState)}\n`, "utf8");

  expect(decodePersistedUiState(uiState).disabledBuiltinExtensions).toEqual(
    uiState.disabledBuiltinExtensions,
  );
  await writePersistedInterfaceZoom(sidecarPath, 125);

  await expect(readPersistedInterfaceZoom(sidecarPath)).resolves.toBe(125);
  await expect(readFile(uiStatePath, "utf8")).resolves.toBe(`${JSON.stringify(uiState)}\n`);
  await expect(readFile(sidecarPath, "utf8")).resolves.toContain('"interfaceZoom": 125');
});
