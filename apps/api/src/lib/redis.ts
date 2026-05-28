import IORedis from "ioredis";
import { env } from "./env.js";

// BullMQ requires `maxRetriesPerRequest: null` for its blocking-pop semantics.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
