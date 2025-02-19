import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { CopyFilterAsync } from "fs-extra";
import { createProject, logger } from "@turbo/utils";
import { gatherAddRequirements } from "../utils/gatherAddRequirements";
import type { TurboGeneratorArguments } from "./types";
import { DependencyGroups, PackageJson } from "../types";

export async function generate({ project, opts }: TurboGeneratorArguments) {
  const { name, type, location, source, dependencies } =
    await gatherAddRequirements({
      project,
      opts,
    });

  const newPackageJsonPath = path.join(location.absolute, "package.json");

  // copying from a remote example
  if (opts.copy.type === "external") {
    console.log();
    logger.warn("Some manual modifications may be required.");
    logger.dimmed(
      `This ${type} may require local dependencies or a different package manager than what is available in this repo`
    );
    await createProject({
      appPath: location.absolute,
      example: opts.copy.source,
      examplePath: opts.examplePath,
    });

    try {
      if (fs.existsSync(newPackageJsonPath)) {
        const packageJson = (await fs.readJSON(
          newPackageJsonPath
        )) as PackageJson;
        if (packageJson.workspaces) {
          throw new Error(
            "New workspace root detected - unexpected 'workspaces' field in package.json"
          );
        }
      } else {
        throw new Error("New workspace is missing a package.json file");
      }

      if (fs.existsSync(path.join(location.absolute, "pnpm-workspace.yaml"))) {
        throw new Error(
          "New workspace root detected - unexpected pnpm-workspace.yaml"
        );
      }
    } catch (err) {
      let message = "UNKNOWN_ERROR";
      if (err instanceof Error) {
        message = err.message;
      }
      logger.error(message);

      // rollback changes
      await fs.rm(location.absolute, { recursive: true, force: true });
      return;
    }
  } else if (source) {
    const filterFunc: CopyFilterAsync = async (src, dest) => {
      if (src.includes("node_modules")) {
        return false;
      }
      return true;
    };

    const loader = logger.turboLoader(
      `Creating "${name}" from "${source.name}"...`
    );
    loader.start();
    await fs.copy(source.paths.root, location.absolute, {
      filter: filterFunc,
    });
    loader.stop();
  }

  // update package.json with new name
  const packageJson = await fs.readJSON(newPackageJsonPath);
  packageJson.name = name;

  // update dependencies
  Object.keys(dependencies).forEach((group) => {
    const deps = dependencies[group as keyof DependencyGroups];
    if (deps && Object.keys(deps).length > 0) {
      packageJson[group as keyof DependencyGroups] = deps;
    }
  });
  await fs.writeJSON(newPackageJsonPath, packageJson, { spaces: 2 });

  console.log();
  console.log(
    `${chalk.bold(logger.turboGradient(">>> Success!"))} Created ${name} at "${
      location.relative
    }"`
  );
}
