import assert from "node:assert/strict";
import test from "node:test";
import dataset from "../data/surnames.json" with { type: "json" };
import { LiveSimulation } from "../src/live-simulation.js";

test("live simulation defaults to 100 people per agent", () => {
  const simulation = new LiveSimulation({ population: 1000, surnames: [] }, { seed: 42 });
  assert.equal(simulation.scale, 100);
  assert.equal(simulation.summary().agents, 10);
  assert.equal(simulation.summary().population, 1000);
});

test("live simulation initializes representative agents and advances one year", () => {
  const simulation = new LiveSimulation(dataset, { scale: 1000, seed: 42 });
  const initial = simulation.summary();

  assert.equal(initial.year, 2025);
  assert.equal(initial.agents, Math.round(dataset.population / 1000));
  assert.equal(initial.population, initial.agents * 1000);

  simulation.step();
  const next = simulation.summary();
  assert.equal(next.year, 2026);
  assert.equal(next.population, next.agents * 1000);
  assert.equal(next.surnames.reduce((sum, surname) => sum + surname.people, 0), next.population);
});

test("live simulation is reproducible with the same seed", () => {
  const first = new LiveSimulation(dataset, { scale: 1000, seed: 42 });
  const second = new LiveSimulation(dataset, { scale: 1000, seed: 42 });

  for (let year = 0; year < 10; year += 1) {
    first.step();
    second.step();
  }

  assert.deepEqual(first.summary(), second.summary());
});

test("death is evaluated at the current age before survivors age", () => {
  const simulation = new LiveSimulation({ population: 2, surnames: [] }, { scale: 1 });
  simulation.agents = [
    { id: 0, age: 0, sex: "male", surname: "佐藤", spouseId: null },
    { id: 1, age: 1, sex: "male", surname: "佐藤", spouseId: null }
  ];
  simulation.random = () => 0.001;

  simulation.step();

  assert.deepEqual(simulation.agents.map(({ id, age }) => ({ id, age })), [
    { id: 1, age: 2 }
  ]);
});

test("birth probabilities use the calibrated age bands", () => {
  for (const [age, probability] of [[19, 0], [20, 0.15], [29, 0.15], [30, 0.0875], [39, 0.0875], [40, 0]]) {
    for (const randomValue of probability === 0 ? [0] : [probability - 0.0001, probability]) {
      const simulation = new LiveSimulation({ population: 2, surnames: [] }, { scale: 1 });
      simulation.agents = [
        { id: 0, age, sex: "female", surname: "佐藤", spouseId: 1 },
        { id: 1, age: 30, sex: "male", surname: "佐藤", spouseId: 0 }
      ];
      simulation.nextId = 2;
      simulation.random = () => randomValue;

      simulation.createBirths();

      assert.equal(simulation.agents.length, randomValue < probability ? 3 : 2, `age ${age}, random ${randomValue}`);
    }
  }
});

test("energy adjusts birth probability based on population and caps the multiplier", () => {
  for (const [initial, population, expectedMultiplier] of [[2, 2, 1], [4, 2, 1.5], [6, 2, 2], [20, 2, 2], [1, 2, 0.75]]) {
    for (const offset of [-0.0001, 0]) {
      const simulation = new LiveSimulation({ population: initial, surnames: [] }, { scale: 1 });
      simulation.agents = [
        { id: 0, age: 20, sex: "female", surname: "佐藤", spouseId: 1 },
        { id: 1, age: 30, sex: "male", surname: "佐藤", spouseId: 0 }
      ];
      simulation.nextId = 2;
      simulation.random = () => 0.15 * expectedMultiplier + offset;

      const summary = simulation.summary();
      assert.equal(summary.energyPerPerson, initial / population);
      assert.equal(summary.birthMultiplier, expectedMultiplier);
      simulation.createBirths();
      assert.equal(simulation.agents.length, offset < 0 ? 3 : 2);
    }
  }
});

test("custom birth multiplier limit affects birth probabilities", () => {
  for (const [limit, randomValue, expectedBirths] of [[2, 0.4, 0], [3, 0.4, 1], [1, 0.2, 0], [10, 0.999, 1]]) {
    const simulation = new LiveSimulation({ population: 40, surnames: [] }, { scale: 1, maxBirthMultiplier: limit });
    simulation.agents = [
      { id: 0, age: 20, sex: "female", surname: "佐藤", spouseId: 1 },
      { id: 1, age: 30, sex: "male", surname: "佐藤", spouseId: 0 }
    ];
    simulation.nextId = 2;
    simulation.random = () => randomValue;

    assert.equal(simulation.summary().birthMultiplier, limit);
    assert.equal(simulation.createBirths(), expectedBirths);
  }
});

test("birth multiplier limit must be finite and at least one", () => {
  for (const maxBirthMultiplier of [0, -1, 0.99, Infinity, NaN, "2"]) {
    assert.throws(
      () => new LiveSimulation({ population: 0, surnames: [] }, { maxBirthMultiplier }),
      /maxBirthMultiplier must be a finite number at least 1/
    );
  }
});

test("an empty population has no per-person energy or birth multiplier", () => {
  const simulation = new LiveSimulation({ population: 0, surnames: [] }, { scale: 1 });
  simulation.createBirths();
  assert.equal(simulation.summary().energyPerPerson, null);
  assert.equal(simulation.summary().birthMultiplier, null);
  assert.equal(simulation.summary().agents, 0);
});

test("annual birth rate uses births divided by start-of-year population", () => {
  const simulation = new LiveSimulation({ population: 200, surnames: [] }, { scale: 100 });
  simulation.agents = [
    { id: 0, age: 24, sex: "female", surname: "佐藤", spouseId: 1 },
    { id: 1, age: 25, sex: "male", surname: "佐藤", spouseId: 0 }
  ];
  simulation.nextId = 2;
  simulation.random = () => 0.05;

  assert.equal(simulation.summary().birthRate, null);
  simulation.step();
  assert.equal(simulation.summary().birthRate, 0.5);
  assert.equal(simulation.summary().population, 300);
  assert.equal(simulation.summary().birthRate, 0.5);

  simulation.random = () => 0.5;
  simulation.step();
  assert.equal(simulation.summary().birthRate, 0);
});

test("annual birth rate handles extinction and an empty start", () => {
  const simulation = new LiveSimulation({ population: 1, surnames: [] }, { scale: 1 });
  simulation.agents = [
    { id: 0, age: 90, sex: "male", surname: "佐藤", spouseId: null }
  ];
  simulation.random = () => 0;
  simulation.step();
  assert.equal(simulation.summary().population, 0);
  assert.equal(simulation.summary().birthRate, 0);
  simulation.step();
  assert.equal(simulation.summary().birthRate, null);
});
