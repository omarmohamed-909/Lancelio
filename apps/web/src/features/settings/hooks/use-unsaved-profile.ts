'use client';
import { useUnsavedChanges } from '../../../shared/hooks/use-unsaved-changes';
export function useUnsavedProfile(dirty: boolean) {
  useUnsavedChanges(dirty, 'تخرج من غير حفظ تغييرات الإعدادات؟');
}
