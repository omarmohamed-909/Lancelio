'use client';
import { notifySuccess } from '../../../components/ui/feedback';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../auth/components/session-provider';
import { ApiError } from '../../../shared/api/http-client';
import {
  paymentApi,
  paymentError,
  paymentWriteBlocked,
} from '../services/payment-api';
import type { PaymentLedger } from '../schemas/payment';
export type PaymentWrite = (
  token: string,
  version: number,
  signal: AbortSignal,
) => Promise<PaymentLedger>;
export function usePaymentLedger(invoiceId: string) {
  const { manager } = useSession();
  const [ledger, setLedger] = useState<PaymentLedger | null>(null);
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
      .authorized((token) =>
        paymentApi.read(token, invoiceId, controller.signal),
      )
      .then((result) => {
        if (!controller.signal.aborted) setLedger(result);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(paymentError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          busy.current = false;
          setPending(false);
        }
      });
    return () => controller.abort();
  }, [manager, invoiceId]);
  async function reload() {
    const controller = lifetime.current;
    if (!controller || busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      const fresh = await manager.authorized((token) =>
        paymentApi.read(token, invoiceId, controller.signal),
      );
      if (controller.signal.aborted) return false;
      setLedger(fresh);
      writeBlocked.current = false;
      setBlocked(false);
      setError('');
      setNotice('تم تحميل سجل الدفعات الحالي.');
      return true;
    } catch (cause: unknown) {
      if (!controller.signal.aborted) setError(paymentError(cause));
      return false;
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  async function write(action: PaymentWrite, message: string) {
    const controller = lifetime.current;
    if (
      !ledger ||
      !controller ||
      busy.current ||
      writeBlocked.current ||
      ledger.invoiceStatus !== 'issued'
    )
      return false;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const result = await manager.authorized((token) =>
        action(token, ledger.version, controller.signal),
      );
      if (controller.signal.aborted) return false;
      setLedger(result);
      setNotice(message);
      notifySuccess(message);
      return true;
    } catch (cause: unknown) {
      if (!controller.signal.aborted) {
        writeBlocked.current = paymentWriteBlocked(cause);
        setBlocked(writeBlocked.current);
        const ambiguous =
          !(cause instanceof ApiError) ||
          cause.status === 0 ||
          cause.status >= 500;
        setError(
          ambiguous
            ? 'نتيجة التسجيل مش مؤكدة. اقرأ سجل الدفعات الحالي قبل أي محاولة جديدة.'
            : paymentError(cause),
        );
      }
      return false;
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return { ledger, error, notice, pending, blocked, reload, write };
}
