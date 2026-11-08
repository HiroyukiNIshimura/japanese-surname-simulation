import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { simulate } from "./simulator.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function optionValue(argumentsList, option, defaultValue) {
  const index = argumentsList.indexOf(option);
  if (index === -1) {
    return defaultValue;
  }

  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function toInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${option} must be an integer`);
  }
  return parsed;
}

const argumentsList = process.argv.slice(2);
if (argumentsList.includes("--help")) {
  console.log("Usage: npm run simulate -- [--end-year 2325] [--generation-years 30] [--seed 20261107] [--output results.json]");
  process.exit(0);
}

const dataset = JSON.parse(await readFile(resolve(root, "data/surnames.json"), "utf8"));
const suppliedSeed = optionValue(argumentsList, "--seed", null);
const seed = suppliedSeed === null
  ? randomBytes(4).readUInt32LE()
  : toInteger(suppliedSeed, "--seed");
const result = simulate(dataset, {
  endYear: toInteger(optionValue(argumentsList, "--end-year", "2325"), "--end-year"),
  generationYears: toInteger(optionValue(argumentsList, "--generation-years", "30"), "--generation-years"),
  seed
});

const output = optionValue(argumentsList, "--output", null);
if (output) {
  const outputPath = resolve(process.cwd(), output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

const lastGeneration = result.generations.at(-1);
console.log(`乱数seed: ${result.seed}`);
console.log(`${lastGeneration.year}年の推計人口: ${lastGeneration.population.toLocaleString("ja-JP")}人`);
console.table(
  lastGeneration.surnames
    .filter((surname) => surname.name !== "その他")
    .sort((left, right) => right.people - left.people)
    .map((surname) => ({
      名字: surname.name,
      人数: surname.people.toLocaleString("ja-JP"),
      割合: `${(surname.share * 100).toFixed(4)}%`
    }))
);
