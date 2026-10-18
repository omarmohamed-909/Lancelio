'use client';
import { Select } from './select';
import { useI18n } from '../../i18n/language-provider';

import { listOrderSchema } from '../../shared/schemas/list-order';
import type { ListOrder } from '../../shared/schemas/list-order';

export function ListOrderSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: ListOrder;
  onChange: (order: ListOrder) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="list-order">
      <label htmlFor={id}>{t('ترتيب العرض')}</label>
      <Select
        id={id}
        value={value}
        onValueChange={(value) => {
          const result = listOrderSchema.safeParse(value);
          if (result.success) onChange(result.data);
        }}
      >
        <option value="newest">{t('الأحدث أولًا')}</option>
        <option value="oldest">{t('الأقدم أولًا')}</option>
      </Select>
    </div>
  );
}
