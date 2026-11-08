import { createInitialDistribution, createRandom } from "./simulator.js";

const INITIAL_AGE_BANDS = [
  { minimum: 0, maximum: 14, share: 0.112 },
  { minimum: 15, maximum: 64, share: 0.595 },
  { minimum: 65, maximum: 74, share: 0.118 },
  { minimum: 75, maximum: 84, share: 0.101 },
  { minimum: 85, maximum: 100, share: 0.074 }
];
const ENERGY_FERTILITY_SENSITIVITY = 0.5;

function chooseWeighted(items, random) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let threshold = random() * total;

  for (const item of items) {
    threshold -= item.weight;
    if (threshold <= 0) {
      return item.value;
    }
  }

  return items.at(-1).value;
}

function deathProbability(age) {
  if (age === 0) return 0.002;
  if (age < 15) return 0.0001;
  if (age < 40) return 0.0004;
  if (age < 60) return 0.0015;
  if (age < 70) return 0.003;
  if (age < 80) return 0.008;
  if (age < 90) return 0.03;
  return 0.1;
}

function marriageProbability(age) {
  if (age < 20 || age > 49) return 0;
  if (age < 30) return 0.055;
  if (age < 40) return 0.035;
  return 0.012;
}

function birthProbability(age) {
  if (age < 20 || age > 39) return 0;
  if (age < 30) return 0.15;
  return 0.0875;
}

function shuffle(items, random) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
}

export class LiveSimulation {
  constructor(dataset, { scale = 100, seed = 20261107, startYear = 2025, maxBirthMultiplier = 2 } = {}) {
    if (!Number.isInteger(scale) || scale < 1) {
      throw new RangeError("scale must be a positive integer");
    }
    if (!Number.isFinite(maxBirthMultiplier) || maxBirthMultiplier < 1) {
      throw new RangeError("maxBirthMultiplier must be a finite number at least 1");
    }

    this.random = createRandom(seed);
    this.seed = seed;
    this.scale = scale;
    this.maxBirthMultiplier = maxBirthMultiplier;
    this.year = startYear;
    this.nextId = 0;
    this.agents = [];
    this.birthRate = null;

    const distribution = createInitialDistribution(dataset);
    const surnameWeights = distribution.map((surname) => ({
      value: surname.name,
      weight: surname.people
    }));
    const agentCount = Math.round(dataset.population / scale);
    this.initialAgentCount = agentCount;

    for (let index = 0; index < agentCount; index += 1) {
      const ageBand = chooseWeighted(
        INITIAL_AGE_BANDS.map((band) => ({ value: band, weight: band.share })),
        this.random
      );
      this.agents.push({
        id: this.nextId++,
        age: ageBand.minimum + Math.floor(this.random() * (ageBand.maximum - ageBand.minimum + 1)),
        sex: this.random() < 0.49 ? "female" : "male",
        surname: chooseWeighted(surnameWeights, this.random),
        spouseId: null
      });
    }

    this.createInitialMarriages();
  }

  createInitialMarriages() {
    const eligibleMen = this.agents.filter((agent) => agent.sex === "male" && agent.age >= 20 && agent.age <= 70);
    const eligibleWomen = this.agents.filter((agent) => agent.sex === "female" && agent.age >= 20 && agent.age <= 70);
    shuffle(eligibleMen, this.random);
    shuffle(eligibleWomen, this.random);

    const couples = Math.floor(Math.min(eligibleMen.length, eligibleWomen.length) * 0.7);
    for (let index = 0; index < couples; index += 1) {
      this.marry(eligibleMen[index], eligibleWomen[index]);
    }
  }

  marry(man, woman) {
    man.spouseId = woman.id;
    woman.spouseId = man.id;
    woman.surname = man.surname;
  }

  step() {
    const startingPopulation = this.agents.length;
    const deceasedIds = new Set();
    for (const agent of this.agents) {
      if (this.random() < deathProbability(agent.age)) {
        deceasedIds.add(agent.id);
      } else {
        agent.age += 1;
      }
    }

    if (deceasedIds.size > 0) {
      for (const agent of this.agents) {
        if (agent.spouseId !== null && deceasedIds.has(agent.spouseId)) {
          agent.spouseId = null;
        }
      }
      this.agents = this.agents.filter((agent) => !deceasedIds.has(agent.id));
    }

    this.createMarriages();
    const births = this.createBirths();
    this.birthRate = startingPopulation === 0 ? null : births / startingPopulation;
    this.year += 1;
  }

  createMarriages() {
    const candidates = this.agents.filter(
      (agent) => agent.spouseId === null && this.random() < marriageProbability(agent.age)
    );
    const men = candidates.filter((agent) => agent.sex === "male");
    const women = candidates.filter((agent) => agent.sex === "female");
    shuffle(men, this.random);
    shuffle(women, this.random);

    for (let index = 0; index < Math.min(men.length, women.length); index += 1) {
      this.marry(men[index], women[index]);
    }
  }

  createBirths() {
    if (this.agents.length === 0) return 0;

    const birthMultiplier = this.birthMultiplier();
    const agentsById = new Map(this.agents.map((agent) => [agent.id, agent]));
    const births = [];

    for (const mother of this.agents) {
      if (
        mother.sex !== "female" ||
        mother.spouseId === null ||
        this.random() >= Math.min(1, birthProbability(mother.age) * birthMultiplier)
      ) {
        continue;
      }

      const father = agentsById.get(mother.spouseId);
      if (!father) {
        continue;
      }

      births.push({
        id: this.nextId++,
        age: 0,
        sex: this.random() < 0.49 ? "female" : "male",
        surname: father.surname,
        spouseId: null
      });
    }

    this.agents.push(...births);
    return births.length;
  }

  birthMultiplier() {
    if (this.agents.length === 0) return null;
    const energyPerPerson = this.initialAgentCount / this.agents.length;
    return Math.min(this.maxBirthMultiplier, 1 + ENERGY_FERTILITY_SENSITIVITY * (energyPerPerson - 1));
  }

  summary() {
    const surnameCounts = new Map();
    let marriedAgents = 0;

    for (const agent of this.agents) {
      surnameCounts.set(agent.surname, (surnameCounts.get(agent.surname) ?? 0) + 1);
      marriedAgents += agent.spouseId === null ? 0 : 1;
    }

    return {
      year: this.year,
      population: this.agents.length * this.scale,
      agents: this.agents.length,
      couples: marriedAgents / 2,
      birthRate: this.birthRate,
      energyPerPerson: this.agents.length === 0 ? null : this.initialAgentCount / this.agents.length,
      birthMultiplier: this.birthMultiplier(),
      surnames: [...surnameCounts.entries()]
        .map(([name, count]) => ({
          name,
          people: count * this.scale,
          share: count / this.agents.length
        }))
        .sort((left, right) => right.people - left.people)
    };
  }
}
