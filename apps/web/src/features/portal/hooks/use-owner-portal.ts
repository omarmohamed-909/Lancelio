'use client';
import { confirmAction, notifySuccess } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import { portalApi, portalError } from '../services/portal-api';
import type { PortalState, PortalPage, PortalCursors } from '../schemas/portal';
const first: PortalCursors = { projects: null, invoices: null };
export function useOwnerPortal(clientId: string) {
  const { manager } = useSession();
  const [state, setState] = useState<PortalState | null>(null),
    [page, setPage] = useState<PortalPage | null>(null),
    [pending, setPending] = useState(true),
    [error, setError] = useState(''),
    [blocked, setBlocked] = useState(false),
    [link, setLink] = useState(''),
    [reviewed, setReviewed] = useState(false);
  const lifetime = useRef<AbortController | null>(null),
    busy = useRef(false),
    stop = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    busy.current = true;
    void manager
      .authorized((token) =>
        Promise.all([
          portalApi.state(token, clientId, controller.signal),
          portalApi.preview(token, clientId, first, controller.signal),
        ]),
      )
      .then(([fresh, preview]) => {
        if (!controller.signal.aborted) {
          setState(fresh);
          setPage(preview);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(portalError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          busy.current = false;
          setPending(false);
        }
      });
    return () => controller.abort();
  }, [manager, clientId]);
  async function reload(cursors: PortalCursors = first) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    setPage(null);
    setState(null);
    setLink('');
    setReviewed(false);
    try {
      const [fresh, preview] = await manager.authorized((token) =>
        Promise.all([
          portalApi.state(token, clientId, controller.signal),
          portalApi.preview(token, clientId, cursors, controller.signal),
        ]),
      );
      if (!controller.signal.aborted) {
        setState(fresh);
        setPage(preview);
        stop.current = false;
        setBlocked(false);
      }
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(portalError(cause));
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  async function mutate(action: 'issue' | 'revoke', days: number) {
    const controller = lifetime.current;
    if (
      !state ||
      !page ||
      !controller ||
      controller.signal.aborted ||
      busy.current ||
      stop.current ||
      (action === 'issue' && (!reviewed || state.client.archived))
    )
      return;
    busy.current = true;
    const message =
      action === 'revoke'
        ? 'إلغاء الرابط هيمنع قراءة بوابة العميل منه. متأكد؟'
        : state.share
          ? 'الرابط الجديد هيلغي القديم، ويشارك كل مشاريع العميل وفواتيره الصادرة الحالية والجديدة والمهام الظاهرة. نكمل؟'
          : 'هنشارك كل مشاريع العميل وفواتيره الصادرة الحالية والجديدة والمهام الظاهرة من غير حساب. نكمل؟';
    if (!(await confirmAction(message))) {
      busy.current = false;
      return;
    }
    setPending(true);
    setError('');
    setLink('');
    setReviewed(false);
    try {
      const fresh = await manager.authorized((token) =>
        action === 'issue'
          ? portalApi.issue(
              token,
              clientId,
              state.version,
              days,
              controller.signal,
            )
          : portalApi.revoke(token, clientId, state.version, controller.signal),
      );
      if (!controller.signal.aborted) {
        setState(fresh);
        if ('token' in fresh && typeof fresh.token === 'string')
          setLink(window.location.origin + '/share/portal#' + fresh.token);
        notifySuccess(
          action === 'issue'
            ? 'رابط متابعة العميل جاهز.'
            : 'رابط المتابعة اتلغى.',
          true,
        );
      }
    } catch (cause: unknown) {
      if (!controller.signal.aborted) {
        const uncertain =
          !(cause instanceof ApiError) ||
          cause.status === 0 ||
          cause.status >= 500;
        stop.current =
          uncertain ||
          (cause instanceof ApiError &&
            ['PORTAL_CONFLICT', 'CLIENT_ARCHIVED', 'CLIENT_NOT_FOUND'].includes(
              cause.code,
            ));
        setBlocked(stop.current);
        setError(
          uncertain
            ? 'نتيجة تغيير الرابط مش مؤكدة. اقرأ حالة البوابة قبل أي محاولة جديدة.'
            : portalError(cause),
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        busy.current = false;
        setPending(false);
      }
    }
  }
  return {
    state,
    page,
    pending,
    error,
    blocked,
    link,
    reviewed,
    setReviewed,
    reload,
    mutate,
  };
}
