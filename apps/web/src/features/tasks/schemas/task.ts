import { z } from 'zod';
export const taskStatusSchema = z.enum(['todo', 'in_progress', 'done']);
export const taskPrioritySchema = z.enum(['low', 'normal', 'high']);
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  clientVisible: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const taskProgressSchema = z.object({
  total: z.number().int().min(0).max(200),
  done: z.number().int().min(0).max(200),
  percentage: z.number().int().min(0).max(100).nullable(),
});
export const clientTaskViewSchema = z.object({
  progress: taskProgressSchema,
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        status: taskStatusSchema,
      }),
    )
    .max(200),
});
export const taskBoardSchema = z.object({
  projectId: z.string(),
  projectStatus: z.enum(['active', 'on_hold', 'completed', 'cancelled']),
  version: z.number().int().nonnegative().safe(),
  tasks: z.array(taskSchema).max(200),
  progress: taskProgressSchema,
  clientView: clientTaskViewSchema,
});
export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .refine(
      (value) =>
        Array.from(value).length >= 2 &&
        Array.from(value).length <= 120 &&
        !Array.from(value).some(
          (char) =>
            (char.codePointAt(0) ?? 0) < 32 || char.codePointAt(0) === 127,
        ),
      'اسم المهمة من حرفين إلى 120 حرف، بدون أسطر جديدة.',
    ),
  description: z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= 2000, 'الوصف حتى 2000 حرف.'),
  priority: taskPrioritySchema,
});
export type Task = z.infer<typeof taskSchema>;
export type TaskBoard = z.infer<typeof taskBoardSchema>;
export type TaskInput = z.infer<typeof taskFormSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export const taskStatuses: Record<TaskStatus, string> = {
  todo: 'لسه هنبدأ',
  in_progress: 'شغّالين',
  done: 'خلصت',
};
export const taskPriorities: Record<
  z.infer<typeof taskPrioritySchema>,
  string
> = { low: 'منخفضة', normal: 'عادية', high: 'عالية' };

export type TaskProgress = z.infer<typeof taskProgressSchema>;
export type ClientTaskView = z.infer<typeof clientTaskViewSchema>;
