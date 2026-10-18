'use client';
import { useI18n } from '../../i18n/language-provider';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import type { DraftInput } from '../schemas/priced-document';
export function PricedItems({
  control,
  register,
  errors,
}: {
  control: Control<DraftInput>;
  register: UseFormRegister<DraftInput>;
  errors: FieldErrors<DraftInput>;
}) {
  const { t } = useI18n();
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const [initialIds] = useState(() => new Set(fields.map((field) => field.id)));
  return (
    <section className="proposal-paper">
      <div className="proposal-section-heading">
        <div>
          <span className="form-eyebrow">{t('02 / بنود الشغل')}</span>
          <h2>{t('بنود الشغل')}</h2>
        </div>
        <span className="field-help">{fields.length} / 50</span>
      </div>
      <div className="proposal-item-head" aria-hidden="true">
        <span>{t('وصف البند')}</span>
        <span>{t('الكمية')}</span>
        <span>{t('سعر الوحدة')}</span>
        <span />
      </div>
      {fields.map((field, index) => (
        <fieldset
          className="proposal-item"
          key={field.id}
          data-added={!initialIds.has(field.id) || undefined}
        >
          <legend className="sr-only">
            {t('بند')} {index + 1}
          </legend>
          <div>
            <label
              className="proposal-item-label"
              htmlFor={'item-title-' + index}
            >
              {t('وصف البند')} {index + 1}
            </label>
            <input
              id={'item-title-' + index}
              placeholder={t('مثال: تصميم الصفحة الرئيسية')}
              {...register(`items.${index}.title`)}
              aria-invalid={!!errors.items?.[index]?.title}
              aria-describedby={
                errors.items?.[index]?.title
                  ? 'item-title-error-' + index
                  : undefined
              }
            />
            {errors.items?.[index]?.title && (
              <p className="field-error" id={'item-title-error-' + index}>
                {t(errors.items[index]?.title?.message)}
              </p>
            )}
          </div>
          <div>
            <label
              className="proposal-item-label"
              htmlFor={'item-quantity-' + index}
            >
              {t('الكمية')} {index + 1}
            </label>
            <input
              id={'item-quantity-' + index}
              type="number"
              inputMode="numeric"
              min="1"
              max="10000"
              step="1"
              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
              aria-invalid={!!errors.items?.[index]?.quantity}
              aria-describedby={
                errors.items?.[index]?.quantity
                  ? 'item-quantity-error-' + index
                  : undefined
              }
            />
            {errors.items?.[index]?.quantity && (
              <p className="field-error" id={'item-quantity-error-' + index}>
                {t(errors.items[index]?.quantity?.message)}
              </p>
            )}
          </div>
          <div>
            <label
              className="proposal-item-label"
              htmlFor={'item-price-' + index}
            >
              {t('سعر الوحدة')} {index + 1}
            </label>
            <input
              id={'item-price-' + index}
              type="text"
              inputMode="decimal"
              dir="ltr"
              placeholder="0.00"
              {...register(`items.${index}.unitPrice`)}
              aria-invalid={!!errors.items?.[index]?.unitPrice}
              aria-describedby={
                errors.items?.[index]?.unitPrice
                  ? 'item-price-error-' + index
                  : undefined
              }
            />
            {errors.items?.[index]?.unitPrice && (
              <p className="field-error" id={'item-price-error-' + index}>
                {t(errors.items[index]?.unitPrice?.message)}
              </p>
            )}
          </div>
          <button
            type="button"
            className="icon-button proposal-remove"
            aria-label={t('حذف البند ') + (index + 1)}
            disabled={fields.length === 1}
            onClick={() => remove(index)}
          >
            <Trash2 size={17} />
          </button>
        </fieldset>
      ))}
      {errors.items?.root?.message && (
        <p className="field-error" role="alert">
          {t(errors.items.root.message)}
        </p>
      )}
      {errors.items?.message && (
        <p className="field-error" role="alert">
          {t(errors.items.message)}
        </p>
      )}
      <button
        type="button"
        className="proposal-text-button"
        disabled={fields.length >= 50}
        onClick={() =>
          append(
            { title: '', quantity: 1, unitPrice: '' },
            { shouldFocus: true, focusName: `items.${fields.length}.title` },
          )
        }
      >
        <Plus size={17} />
        {t('إضافة بند')}{' '}
      </button>
    </section>
  );
}
