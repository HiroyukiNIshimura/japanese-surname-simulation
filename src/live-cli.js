import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LiveSimulation } from "./live-simulation.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function optionValue(argumentsList, option, defaultValue) {
  const index = argumentsList.indexOf(option);
  if (index === -1) return defaultValue;

  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function toPositiveNumber(value, option) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive number`);
  }
  return parsed;
}

function toInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${option} must be an integer`);
  }
  return parsed;
}

function render(summary, { seed, scale, yearsPerSecond, paused, maxBirthMultiplier }) {
  console.clear();
  const finished = summary.agents === 0;
  console.log(`日本の名字ライブシミュレーション  ${finished ? "終了" : paused ? "一時停止中" : "進行中"}`);
  console.log(`年: ${summary.year}  推計人口: ${summary.population.toLocaleString("ja-JP")}人  代表エージェント: ${summary.agents.toLocaleString("ja-JP")}  世帯: ${summary.couples.toLocaleString("ja-JP")}`);
  const birthRate = summary.birthRate === null ? "未計算" : `${(summary.birthRate * 1000).toFixed(2)}人`;
  console.log(`年間出生率（年初人口1,000人あたり）: ${birthRate}`);
  console.log(`1エージェント: ${scale.toLocaleString("ja-JP")}人  速度: ${yearsPerSecond}年/秒  seed: ${seed}  出生確率の倍率上限: ${maxBirthMultiplier}倍`);
  if (!finished) {
    console.log(`1人あたりのエネルギー: 初期の${summary.energyPerPerson.toFixed(2)}倍  出生確率の倍率: ${summary.birthMultiplier.toFixed(2)}倍`);
  }
  console.log("");
  console.table(
    summary.surnames
      .slice(0, 10)
      .map((surname) => ({
      名字: surname.name,
      人数: surname.people.toLocaleString("ja-JP"),
      割合: `${(surname.share * 100).toFixed(3)}%`
      }))
  );
  if (finished) {
    console.log("人口が0になったため、シミュレーションを終了しました。");
  } else {
    console.log("[space] 一時停止/再開  [→] 1年進める  [+/-] 速度変更  [q] 終了");
  }
}

const argumentsList = process.argv.slice(2);
if (argumentsList.includes("--help")) {
  console.log("Usage: npm run live -- [--years-per-second 1] [--scale 100] [--seed 20261107] [--max-birth-multiplier 2]");
  process.exit(0);
}

const dataset = JSON.parse(await readFile(resolve(root, "data/surnames.json"), "utf8"));
const suppliedSeed = optionValue(argumentsList, "--seed", null);
const seed = suppliedSeed === null ? randomBytes(4).readUInt32LE() : toInteger(suppliedSeed, "--seed");
const scale = toInteger(optionValue(argumentsList, "--scale", "100"), "--scale");
const maxBirthMultiplier = toPositiveNumber(optionValue(argumentsList, "--max-birth-multiplier", "2"), "--max-birth-multiplier");
if (maxBirthMultiplier < 1) {
  throw new RangeError("--max-birth-multiplier must be at least 1");
}
let yearsPerSecond = toPositiveNumber(optionValue(argumentsList, "--years-per-second", "1"), "--years-per-second");
const simulation = new LiveSimulation(dataset, { scale, seed, maxBirthMultiplier });
let paused = false;
let carry = 0;
let lastTick = performance.now();
let timer;

function renderState() {
  const summary = simulation.summary();
  render(summary, { seed, scale, yearsPerSecond, paused, maxBirthMultiplier });
  return summary.agents === 0;
}

function stop() {
  clearInterval(timer);
  process.stdin.removeListener("data", handleInput);
  process.stdin.setRawMode(false);
  process.stdin.destroy();
}

function handleInput(key) {
  if (key === "q" || key === "\u0003") process.exit(0);
  if (key === " ") paused = !paused;
  if (key === "\u001b[C") simulation.step();
  if (key === "+") yearsPerSecond = Math.min(100, yearsPerSecond * 2);
  if (key === "-") yearsPerSecond = Math.max(0.125, yearsPerSecond / 2);
  if (renderState()) stop();
}

if (!renderState()) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", handleInput);

  timer = setInterval(() => {
    const now = performance.now();
    carry += ((now - lastTick) / 1000) * yearsPerSecond;
    lastTick = now;
    if (!paused) {
      while (carry >= 1 && simulation.agents.length > 0) {
        simulation.step();
        carry -= 1;
      }
    }
    if (renderState()) stop();
  }, 100);
}
