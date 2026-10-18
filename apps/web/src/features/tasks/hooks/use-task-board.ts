'use client';
import { notifySuccess } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { taskApi, taskError, taskWriteBlocked } from '../services/task-api';
import type { TaskBoard } from '../schemas/task';
export type TaskWrite = (
  token: string,
  version: number,
  signal: AbortSignal,
) => Promise<TaskBoard>;
export function useTaskBoard(projectId: string) {
  const { manager } = useSession();
  const [board, setBoard] = useState<TaskBoard | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const busy = useRef(false),
    writeBlocked = useRef(false),
    lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    busy.current = true;
    void manager
      .authorized((token) => taskApi.read(token, projectId, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted) setBoard(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(taskError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          busy.current = false;
          setPending(false);
        }
      });
    return () => controller.abort();
  }, [manager, projectId]);
  async function reload() {
    const controller = lifetime.current;
    if (!controller || busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      const fresh = await manager.authorized((token) =>
        taskApi.read(token, projectId, controller.signal),
      );
      if (controller.signal.aborted) return false;
      setBoard(fresh);
      writeBlocked.current = false;
      setBlocked(false);
      setError('');
      setNotice('تم تحميل قائمة المهام الحالية.');
      return true;
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(taskError(cause));
      return false;
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  async function write(action: TaskWrite, message: string) {
    const controller = lifetime.current;
    if (
      !board ||
      !controller ||
      busy.current ||
      writeBlocked.current ||
      !['active', 'on_hold'].includes(board.projectStatus)
    )
      return false;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const result = await manager.authorized((token) =>
        action(token, board.version, controller.signal),
      );
      if (controller.signal.aborted) return false;
      setBoard(result);
      setNotice(message);
      notifySuccess(message);
      return true;
    } catch (cause: unknown) {
      if (!controller.signal.aborted) {
        writeBlocked.current = taskWriteBlocked(cause);
        setBlocked(writeBlocked.current);
        const ambiguous =
          !(cause instanceof ApiError) ||
          cause.status === 0 ||
          cause.status >= 500;
        setError(
          ambiguous
            ? 'نتيجة التغيير مش مؤكدة. اقرأ قائمة المهام الحالية قبل أي محاولة جديدة.'
            : taskError(cause),
        );
      }
      return false;
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return { board, error, notice, pending, blocked, reload, write };
}
