export const CELL = 2;
export const HEIGHT = 3;

// # wall, . floor, D boiler-room door, E exit door
export const MAP = [
  "########################",
  "#.....#........#.......#",
  "#.....#........#.......#",
  "#..............#.......#",
  "#.....#........D.......#",
  "#.....#........#.......#",
  "#######........#########",
  "#......................#",
  "#......................#",
  "####.#############.#####",
  "#.........###..........#",
  "#.........###..........#",
  "#.........###..........#",
  "#####E##################",
];

export const W = MAP[0].length;
export const H = MAP.length;

export const START = { x: 2, y: 3 };

// Monster patrol route (cell coordinates)
export const PATROL = [
  { x: 9, y: 2 }, { x: 9, y: 7 }, { x: 20, y: 8 }, { x: 18, y: 11 },
  { x: 5, y: 11 }, { x: 4, y: 8 }, { x: 3, y: 3 }, { x: 9, y: 4 },
];
export const MONSTER_START = { x: 20, y: 8 };

export const cellToWorld = (c: number) => c * CELL + CELL / 2;
