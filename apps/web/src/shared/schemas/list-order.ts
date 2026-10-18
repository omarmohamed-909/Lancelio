import { z } from 'zod';

export const listOrderSchema = z.enum(['newest', 'oldest']);
export type ListOrder = z.infer<typeof listOrderSchema>;
export const listOrderPreferencesSchema = z.object({ order: listOrderSchema });
export const defaultListOrder = { order: 'newest' as const };
