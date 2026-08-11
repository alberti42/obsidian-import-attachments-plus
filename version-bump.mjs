import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// .editorconfig requires a final newline, which JSON.stringify does not add.
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, "\t") + "\n");

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeJson("manifest.json", manifest);

// update versions.json with target version and minAppVersion from manifest.json
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeJson("versions.json", versions);
