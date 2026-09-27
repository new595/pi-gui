import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { interfaceZoomLevels, isInterfaceZoom } from "../../contracts/desktop-state";
import {
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
