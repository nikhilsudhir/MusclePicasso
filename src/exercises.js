// ─── Exercise database with muscle group colors ───

export const EXERCISES = {
  chest: {
    label: "Chest",
    color: "#ff3b5c",
    exercises: [
      { name: "Bench Press", sets: "4×8-12", diff: "Int" },
      { name: "Incline Dumbbell Press", sets: "4×8-10", diff: "Int" },
      { name: "Cable Flyes", sets: "3×12-15", diff: "Beg" },
    ],
  },
  shoulders: {
    label: "Shoulders",
    color: "#ff7b3b",
    exercises: [
      { name: "Overhead Press", sets: "4×8-10", diff: "Int" },
      { name: "Lateral Raises", sets: "3×12-15", diff: "Beg" },
      { name: "Face Pulls", sets: "3×15-20", diff: "Beg" },
    ],
  },
  biceps: {
    label: "Biceps",
    color: "#ffb03b",
    exercises: [
      { name: "Barbell Curl", sets: "3×10-12", diff: "Beg" },
      { name: "Incline Dumbbell Curl", sets: "3×10-12", diff: "Int" },
      { name: "Hammer Curls", sets: "3×10-12", diff: "Beg" },
    ],
  },
  triceps: {
    label: "Triceps",
    color: "#3bff8a",
    exercises: [
      { name: "Close-Grip Bench", sets: "4×8-10", diff: "Int" },
      { name: "Overhead Extension", sets: "3×10-12", diff: "Beg" },
      { name: "Tricep Pushdown", sets: "3×12-15", diff: "Beg" },
    ],
  },
  forearms: {
    label: "Forearms",
    color: "#3bffd5",
    exercises: [
      { name: "Wrist Curls", sets: "3×15-20", diff: "Beg" },
      { name: "Farmer's Walk", sets: "3×40m", diff: "Beg" },
    ],
  },
  abs: {
    label: "Abs / Core",
    color: "#3bb8ff",
    exercises: [
      { name: "Hanging Leg Raises", sets: "3×12-15", diff: "Int" },
      { name: "Cable Crunches", sets: "3×15-20", diff: "Beg" },
      { name: "Ab Wheel Rollout", sets: "3×8-10", diff: "Adv" },
    ],
  },
  back: {
    label: "Back",
    color: "#9b3bff",
    exercises: [
      { name: "Pull-Ups", sets: "4×6-10", diff: "Int" },
      { name: "Barbell Row", sets: "4×8-10", diff: "Int" },
      { name: "Lat Pulldown", sets: "3×10-12", diff: "Beg" },
    ],
  },
  traps: {
    label: "Traps",
    color: "#d43bff",
    exercises: [
      { name: "Barbell Shrugs", sets: "4×12-15", diff: "Beg" },
      { name: "Face Pulls", sets: "3×15-20", diff: "Beg" },
    ],
  },
  glutes: {
    label: "Glutes",
    color: "#ff3bd4",
    exercises: [
      { name: "Hip Thrust", sets: "4×10-12", diff: "Beg" },
      { name: "Bulgarian Split Squat", sets: "3×10/leg", diff: "Int" },
      { name: "Sumo Deadlift", sets: "4×8-10", diff: "Int" },
    ],
  },
  quads: {
    label: "Quadriceps",
    color: "#ff5c5c",
    exercises: [
      { name: "Barbell Squat", sets: "4×8-10", diff: "Int" },
      { name: "Leg Press", sets: "4×10-12", diff: "Beg" },
      { name: "Leg Extensions", sets: "3×12-15", diff: "Beg" },
    ],
  },
  hamstrings: {
    label: "Hamstrings",
    color: "#4ecdc4",
    exercises: [
      { name: "Romanian Deadlift", sets: "4×8-10", diff: "Int" },
      { name: "Leg Curls", sets: "3×12-15", diff: "Beg" },
      { name: "Nordic Curls", sets: "3×6-8", diff: "Adv" },
    ],
  },
  calves: {
    label: "Calves",
    color: "#45b7d1",
    exercises: [
      { name: "Standing Calf Raise", sets: "4×15-20", diff: "Beg" },
      { name: "Seated Calf Raise", sets: "3×12-15", diff: "Beg" },
    ],
  },
}
