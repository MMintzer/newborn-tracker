'use strict';

const { z } = require('zod');

// All object schemas use `.strict()` so that unknown fields are rejected.

const babyInput = z
  .object({
    name: z.string().min(1, 'name must not be empty'),
    // Calendar date, e.g. "2026-06-01".
    birthdate: z.string().date('birthdate must be an ISO-8601 date (YYYY-MM-DD)'),
  })
  .strict();

// --- Per-type event "details" schemas ---------------------------------------

const diaperDetails = z
  .object({ kind: z.enum(['wet', 'dirty', 'both']) })
  .strict();

const feedingDetails = z
  .object({
    method: z.enum(['breast', 'bottle']),
    amountMl: z.number().positive().optional(),
    durationMin: z.number().positive().optional(),
  })
  .strict();

const sleepDetails = z
  .object({
    startedAt: z.string().datetime('startedAt must be an ISO-8601 UTC timestamp'),
    endedAt: z.string().datetime('endedAt must be an ISO-8601 UTC timestamp'),
  })
  .strict()
  .refine((d) => new Date(d.endedAt) >= new Date(d.startedAt), {
    message: 'endedAt must not be before startedAt',
    path: ['endedAt'],
  });

const weightDetails = z
  .object({ kg: z.number().positive('kg must be a positive number') })
  .strict();

// An event body is a discriminated union on `type`, so the correct `details`
// schema is applied for each type.
const eventInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('diaper'), details: diaperDetails }).strict(),
  z.object({ type: z.literal('feeding'), details: feedingDetails }).strict(),
  z.object({ type: z.literal('sleep'), details: sleepDetails }).strict(),
  z.object({ type: z.literal('weight'), details: weightDetails }).strict(),
]);

// --- Query string for GET /babies/:id/events --------------------------------

const listQuery = z
  .object({
    type: z.enum(['diaper', 'feeding', 'sleep', 'weight']).optional(),
    since: z.string().datetime('since must be an ISO-8601 UTC timestamp').optional(),
  })
  .strict();

module.exports = { babyInput, eventInput, listQuery };
