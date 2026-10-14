import "dotenv/config";
import mongoose from "mongoose";
import { MealPlan } from "../models/MealPlan.js";
import { FoodHistory } from "../models/FoodHistory.js";
import { PantryIngredient } from "../models/PantryIngredient.js";
import { StockOperation } from "../models/StockOperation.js";
import { WorkoutPlan, WorkoutSession } from "../models/Workout.js";
import { Scan } from "../models/Scan.js";
if (process.env.NODE_ENV !== "development" || !process.argv.includes("--confirm")) {
  throw new Error("Mock reset requires NODE_ENV=development and --confirm. Accounts and preferences are preserved.");
}
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
await mongoose.connect(process.env.MONGODB_URI);
try {
  await mongoose.connection.transaction(async (session) => {
    for (const collection of [MealPlan, FoodHistory, PantryIngredient, StockOperation, Scan, WorkoutPlan, WorkoutSession]) {
      await collection.collection.deleteMany({}, { session });
    }
  });
  console.log(`Cleared mock schedules, food history, pantry, purchases, scans, and workouts in ${mongoose.connection.name}. Accounts and preferences preserved.`);
} finally { await mongoose.disconnect(); }
