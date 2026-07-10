import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  generateBundledImages,
  type BundledImageGeneratorPaths,
} from "../../scripts/generate-bundled-images";

const quiet = (): void => {};

function createPaths(repoRoot: string): BundledImageGeneratorPaths {
  const dataDir = join(repoRoot, "src", "lib", "data");
  return {
    repoRoot,
    imagesDir: join(repoRoot, "src", "lib", "assets", "device-images"),
    outputFile: join(dataDir, "bundledImages.ts"),
    generatedDir: join(dataDir, "bundledImages.generated"),
  };
}

async function addImage(
  paths: BundledImageGeneratorPaths,
  vendor: string,
  slug: string,
  face: "front" | "rear" = "front",
): Promise<void> {
  const vendorDir = join(paths.imagesDir, vendor);
  await mkdir(vendorDir, { recursive: true });
  await writeFile(join(vendorDir, `${slug}.${face}.webp`), "test-image");
}

async function readGeneratedTree(
  paths: BundledImageGeneratorPaths,
): Promise<Record<string, string>> {
  const filenames = (await readdir(paths.generatedDir)).sort();
  const entries = await Promise.all(
    filenames.map(async (filename) => [
      filename,
      await readFile(join(paths.generatedDir, filename), "utf8"),
    ]),
  );

  return {
    "bundledImages.ts": await readFile(paths.outputFile, "utf8"),
    ...Object.fromEntries(entries),
  };
}

describe("generateBundledImages integration", () => {
  let repoRoot: string;
  let paths: BundledImageGeneratorPaths;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "rackula-bundled-images-"));
    paths = createPaths(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("produces deterministic output across repeated runs", async () => {
    await addImage(paths, "zeta", "zeta-device");
    await addImage(paths, "alpha", "alpha-z");
    await addImage(paths, "alpha", "alpha-a", "front");
    await addImage(paths, "alpha", "alpha-a", "rear");

    const firstResult = await generateBundledImages({ paths, log: quiet });
    const firstTree = await readGeneratedTree(paths);
    const secondResult = await generateBundledImages({ paths, log: quiet });
    const secondTree = await readGeneratedTree(paths);

    expect(firstResult).toEqual({
      imageFileCount: 4,
      parsedImageCount: 4,
      deviceCount: 3,
      vendorCount: 2,
    });
    expect(secondResult).toEqual(firstResult);
    expect(secondTree).toEqual(firstTree);
  });

  it("orders vendor modules and device entries deterministically", async () => {
    await addImage(paths, "zeta", "zeta-device");
    await addImage(paths, "alpha", "alpha-z");
    await addImage(paths, "alpha", "alpha-a");

    await generateBundledImages({ paths, log: quiet });

    const index = await readFile(join(paths.generatedDir, "index.ts"), "utf8");
    expect(index.indexOf('from "./alpha"')).toBeLessThan(
      index.indexOf('from "./zeta"'),
    );

    const alpha = await readFile(join(paths.generatedDir, "alpha.ts"), "utf8");
    expect(alpha.indexOf('"alpha-a"')).toBeLessThan(alpha.indexOf('"alpha-z"'));
  });

  it("rejects vendor export-name collisions", async () => {
    await addImage(paths, "a-1", "first-device");
    await addImage(paths, "a1", "second-device");

    await expect(generateBundledImages({ paths, log: quiet })).rejects.toThrow(
      "Generated vendor export collision: a1BundledImages",
    );
  });

  it("removes stale generated vendor files", async () => {
    await addImage(paths, "alpha", "alpha-device");
    await generateBundledImages({ paths, log: quiet });
    await writeFile(join(paths.generatedDir, "stale.ts"), "stale");

    await generateBundledImages({ paths, log: quiet });

    expect(await readdir(paths.generatedDir)).not.toContain("stale.ts");
  });

  it("rejects configured line-limit violations before replacing output", async () => {
    await addImage(paths, "alpha", "alpha-device");
    await mkdir(paths.generatedDir, { recursive: true });
    await mkdir(join(paths.repoRoot, "src", "lib", "data"), {
      recursive: true,
    });
    await writeFile(paths.outputFile, "preserve-facade");
    await writeFile(
      join(paths.generatedDir, "preserve.ts"),
      "preserve-generated",
    );

    await expect(
      generateBundledImages({
        paths,
        log: quiet,
        maxGeneratedFileLines: 5,
      }),
    ).rejects.toThrow(/Generated file .+ has \d+ lines/);

    expect(await readFile(paths.outputFile, "utf8")).toBe("preserve-facade");
    expect(
      await readFile(join(paths.generatedDir, "preserve.ts"), "utf8"),
    ).toBe("preserve-generated");
  });
});
