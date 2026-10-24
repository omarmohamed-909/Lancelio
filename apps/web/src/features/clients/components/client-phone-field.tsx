'use client';
import { useMemo, useState } from 'react';
import { useController } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/max';
import type { CountryCode } from 'libphonenumber-js';
import { Select } from '../../../components/ui/select';
import { useI18n } from '../../../i18n/language-provider';
import type { ClientDetails } from '../schemas/client';
import {
  phoneCharacters,
  phoneDraft,
  phoneEditorValue,
} from '../services/phone-number';
export function ClientPhoneField({
  control,
  readonly,
}: {
  control: Control<ClientDetails>;
  readonly: boolean;
}) {
  const {
    field: { value, onChange, onBlur, ref: inputRef, name },
    fieldState,
  } = useController({ name: 'phone', control });
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState(() => phoneEditorValue(value));
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    return getCountries()
      .map((country) => ({ country, name: names.of(country) ?? country }))
      .sort((left, right) => left.name.localeCompare(right.name, locale));
  }, [locale]);
  function choose(country: CountryCode | '') {
    const raw =
      country === ''
        ? value
        : phoneCharacters(draft.input).startsWith('+')
          ? (parsePhoneNumberFromString(phoneCharacters(draft.input), {
              extract: false,
            })?.nationalNumber ?? draft.input)
          : draft.input;
    setDraft({ country, input: raw });
    onChange(phoneDraft(raw, country));
    onBlur();
  }
  return (
    <div className="client-phone-field">
      <div className="client-phone-controls">
        <Select
          id="client-phone-country"
          aria-label={t('دولة رقم الهاتف')}
          value={draft.country}
          disabled={readonly}
          onValueChange={(country) => choose(country as CountryCode | '')}
        >
          <option value="">{t('دولي (+)')}</option>
          {countries.map(({ country, name }) => (
            <option key={country} value={country}>
              {name} <bdi dir="ltr">(+{getCountryCallingCode(country)})</bdi>
            </option>
          ))}
        </Select>
        <input
          id="client-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          dir="ltr"
          maxLength={40}
          ref={inputRef}
          name={name}
          value={draft.input}
          readOnly={readonly}
          aria-invalid={!!fieldState.error}
          aria-describedby={
            'client-phone-help' +
            (fieldState.error ? ' client-phone-error' : '')
          }
          placeholder={draft.country ? t('الرقم المحلي') : '+44 20 7946 0018'}
          onBlur={onBlur}
          onChange={(event) => {
            const input = event.target.value,
              normalized = phoneCharacters(input);
            const detected = normalized.startsWith('+')
              ? parsePhoneNumberFromString(normalized, { extract: false })
                  ?.country
              : undefined;
            const country = detected ?? draft.country;
            setDraft({ input, country });
            onChange(phoneDraft(input, country));
          }}
        />
      </div>
      <p className="client-phone-help" id="client-phone-help">
        {t(
          'اختار الدولة واكتب الرقم المحلي، أو الصق الرقم الدولي بكود الدولة. الأرقام العربية مدعومة.',
        )}
      </p>
    </div>
  );
}
