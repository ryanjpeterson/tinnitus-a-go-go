import IORedis from "ioredis";
import { env } from "./env.js";

// BullMQ requires `maxRetriesPerRequest: null` to handle long-running blocking commands.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
