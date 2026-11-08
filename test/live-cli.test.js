import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const cli = new URL("../src/live-cli.js", import.meta.url).href;
const controls = "[space] 一時停止/再開";

function runLive(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--input-type=module",
      "-e",
      "process.stdin.setRawMode = () => {}; await import(process.argv[1]);",
      cli,
      ...args
    ]);
    let output = "";
    let errors = "";
    let sent = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 5000);

    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (input && !sent && output.includes(controls)) {
        sent = true;
        child.stdin.write(input);
      }
    });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`live CLI did not exit: ${output}\n${errors}`));
      } else {
        resolve({ code, output, errors });
      }
    });
  });
}

test("live CLI exits immediately if its initial population is zero", async () => {
  const result = await runLive(["--scale", "300000000", "--seed", "81"]);
  assert.equal(result.code, 0, result.errors);
  assert.match(result.output, /年: 2025\s+推計人口: 0人/);
  assert.match(result.output, /人口が0になったため/);
  assert.doesNotMatch(result.output, /年: 2026/);
});

test("live CLI stops at extinction even when multiple years are due", async () => {
  const result = await runLive([
    "--scale", "200000000", "--seed", "81", "--years-per-second", "100000"
  ]);
  assert.equal(result.code, 0, result.errors);
  assert.match(result.output, /1人あたりのエネルギー: 初期の1\.00倍  出生確率の倍率: 1\.00倍/);
  assert.match(result.output, /年: 2026\s+推計人口: 0人/);
  assert.match(result.output, /人口が0になったため/);
  assert.doesNotMatch(result.output, /年: 2027/);
});

test("live CLI stops when a manual step causes extinction", async () => {
  const result = await runLive([
    "--scale", "200000000", "--seed", "81", "--years-per-second", "0.000001"
  ], "\u001b[C");
  assert.equal(result.code, 0, result.errors);
  assert.match(result.output, /年: 2026\s+推計人口: 0人/);
  assert.match(result.output, /人口が0になったため/);
});
