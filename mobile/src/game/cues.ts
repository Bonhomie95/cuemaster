export const cues = [
  {
    id: "club",
    name: "Club Maple",
    price: 0,
    seconds: 25,
    aim: 0.28,
    color: "#604737",
  },
  {
    id: "precision",
    name: "Precision Ash",
    price: 400,
    seconds: 35,
    aim: 0.55,
    color: "#748d92",
  },
  {
    id: "master",
    name: "Master Ebony",
    price: 1200,
    seconds: 45,
    aim: 0.85,
    color: "#b79658",
  },
];
export const cueById = (id?: string) =>
  cues.find((c) => c.id === id) || cues[0];
