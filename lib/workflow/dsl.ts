import { z } from "zod";

const fieldSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_.]*$/, "Workflow fields must use safe dotted identifiers");

const scalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const workflowConditionSchema = z.discriminatedUnion("operator", [
  z.object({
    operator: z.literal("equals"),
    field: fieldSchema,
    value: scalarSchema,
  }),
  z.object({
    operator: z.literal("in"),
    field: fieldSchema,
    values: z.array(scalarSchema).min(1).max(100),
  }),
  z.object({
    operator: z.literal("exists"),
    field: fieldSchema,
  }),
]);

export const workflowTransitionDslSchema = z.object({
  version: z.literal(1),
  transitions: z
    .array(
      z.object({
        from: z.string().regex(/^[a-z][a-z0-9_]*$/),
        to: z.string().regex(/^[a-z][a-z0-9_]*$/),
        conditions: z.array(workflowConditionSchema).max(20).default([]),
      }),
    )
    .max(100),
});

export type WorkflowTransitionDsl = z.infer<typeof workflowTransitionDslSchema>;

export function parseWorkflowTransitionDsl(input: unknown) {
  return workflowTransitionDslSchema.parse(input);
}
