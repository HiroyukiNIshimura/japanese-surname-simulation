import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../data/surnames.json" with { type: "json" };
import { createInitialDistribution, projectPopulation, simulate } from "../src/simulator.js";

test("initial distribution preserves the dataset population", () => {
  const distribution = createInitialDistribution(dataset);
  const total = distribution.reduce((sum, surname) => sum + surname.people, 0);

  assert.equal(total, dataset.population);
  assert.equal(distribution.at(-1).name, "その他");
});

test("population projection uses the published anchor values", () => {
  assert.equal(projectPopulation(2025), 123262448);
  assert.equal(projectPopulation(2050), 104686383);
  assert.equal(projectPopulation(2070), 86996009);
});

test("simulation is deterministic and each generation sums to its population", () => {
  const first = simulate(dataset, { endYear: 2086, seed: 42 });
  const second = simulate(dataset, { endYear: 2086, seed: 42 });

  assert.deepEqual(first, second);
  assert.equal(first.generations.at(-1).year, 2086);
  for (const generation of first.generations) {
    assert.equal(
      generation.surnames.reduce((sum, surname) => sum + surname.people, 0),
      generation.population
    );
  }
});
