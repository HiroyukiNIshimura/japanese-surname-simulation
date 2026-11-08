const POPULATION_ANCHORS = [
  [2025, 123262448],
  [2050, 104686383],
  [2070, 86996009]
];

export function createRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function interpolatePopulation(year, [startYear, startPopulation], [endYear, endPopulation]) {
  const progress = (year - startYear) / (endYear - startYear);
  return Math.round(startPopulation + (endPopulation - startPopulation) * progress);
}

export function projectPopulation(year) {
  if (!Number.isInteger(year) || year < POPULATION_ANCHORS[0][0]) {
    throw new RangeError(`year must be an integer no earlier than ${POPULATION_ANCHORS[0][0]}`);
  }

  for (let index = 1; index < POPULATION_ANCHORS.length; index += 1) {
    const previous = POPULATION_ANCHORS[index - 1];
    const next = POPULATION_ANCHORS[index];

    if (year <= next[0]) {
      return interpolatePopulation(year, previous, next);
    }
  }

  const [previousYear, previousPopulation] = POPULATION_ANCHORS.at(-2);
  const [lastYear, lastPopulation] = POPULATION_ANCHORS.at(-1);
  const annualMultiplier = (lastPopulation / previousPopulation) ** (1 / (lastYear - previousYear));
  return Math.max(1, Math.round(lastPopulation * annualMultiplier ** (year - lastYear)));
}

function standardNormal(random) {
  const first = Math.max(random(), Number.MIN_VALUE);
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function sampleBinomial(trials, probability, random) {
  if (trials === 0 || probability <= 0) {
    return 0;
  }
  if (probability >= 1) {
    return trials;
  }

  if (trials < 100) {
    let successes = 0;
    for (let index = 0; index < trials; index += 1) {
      successes += random() < probability ? 1 : 0;
    }
    return successes;
  }

  const mean = trials * probability;
  const deviation = Math.sqrt(trials * probability * (1 - probability));
  return Math.max(0, Math.min(trials, Math.round(mean + deviation * standardNormal(random))));
}

export function createInitialDistribution(dataset) {
  const namedPeople = dataset.surnames.reduce((sum, surname) => sum + surname.people, 0);
  if (namedPeople > dataset.population) {
    throw new RangeError("surname counts cannot exceed the population");
  }

  return [
    ...dataset.surnames.map((surname) => ({ ...surname })),
    { name: "その他", rank: null, people: dataset.population - namedPeople }
  ];
}

function sampleNextGeneration(distribution, targetPopulation, random) {
  let remainingPopulation = targetPopulation;
  let remainingProbability = 1;

  return distribution.map((surname, index) => {
    if (index === distribution.length - 1) {
      return { ...surname, people: remainingPopulation };
    }

    const probability = surname.people / distribution.reduce((sum, item) => sum + item.people, 0);
    const conditionalProbability = probability / remainingProbability;
    const people = sampleBinomial(remainingPopulation, conditionalProbability, random);
    remainingPopulation -= people;
    remainingProbability -= probability;
    return { ...surname, people };
  });
}

export function simulate(dataset, options = {}) {
  const {
    startYear = 2025,
    endYear = 2325,
    generationYears = 30,
    seed = 20261107
  } = options;

  if (!Number.isInteger(endYear) || endYear < startYear) {
    throw new RangeError("endYear must be an integer at or after startYear");
  }
  if (!Number.isInteger(generationYears) || generationYears < 1) {
    throw new RangeError("generationYears must be a positive integer");
  }

  const random = createRandom(seed);
  let distribution = createInitialDistribution(dataset);
  const generations = [];

  for (let year = startYear; ; year = Math.min(year + generationYears, endYear)) {
    const population = year === startYear ? dataset.population : projectPopulation(year);
    if (year !== startYear) {
      distribution = sampleNextGeneration(distribution, population, random);
    }

    generations.push({
      year,
      population,
      surnames: distribution.map((surname) => ({
        ...surname,
        share: surname.people / population
      }))
    });

    if (year === endYear) {
      break;
    }
  }

  return {
    assumptions: {
      inheritance: "father-surname",
      marriage: "same-surname",
      differentialFertility: false,
      immigration: "included only in the population projection, not as new surnames",
      post2070Population: "extends the 2050-2070 annual rate of change"
    },
    seed,
    generationYears,
    generations
  };
}
