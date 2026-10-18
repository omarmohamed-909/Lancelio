'use client';

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  ButtonHTMLAttributes,
  OptionHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';

type Option = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  lang?: string;
  dir?: string;
};
function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textContent(child.props.children)
        : String(child),
    )
    .join('');
}
function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionHTMLAttributes<HTMLOptionElement>>(child))
      return [];
    if (child.type === Fragment) return readOptions(child.props.children);
    if (child.type !== 'option' || child.props.hidden) return [];
    const { value, children: label, disabled, lang, dir } = child.props;
    return [
      {
        value: String(value ?? textContent(label)),
        label,
        text: textContent(label),
        disabled: !!disabled,
        ...(lang ? { lang } : {}),
        ...(dir ? { dir } : {}),
      },
    ];
  });
}
const normalize = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .toLowerCase();
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'children'
> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

/** Select-only combobox. DOM focus stays on the trigger; Escape cancels the preview. */
export function Select({
  value,
  onValueChange,
  children,
  icon,
  ref,
  className = '',
  id,
  disabled,
  name,
  onBlur,
  ...props
}: Props) {
  const generatedId = useId();
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const triggerId = id ?? `select-${generatedId}`;
  const listId = `${triggerId}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = readOptions(children);
  const selected = options.findIndex(
    (option) => option.value === String(value),
  );
  const enabled = options
    .map((option, index) => (option.disabled ? -1 : index))
    .filter((index) => index >= 0);
  useImperativeHandle(ref, () => trigger.current!, []);

  const close = useCallback(() => {
    popup.current?.hidePopover();
    setOpen(false);
    search.current = { text: '', at: 0 };
  }, []);
  const position = useCallback(() => {
    const button = trigger.current,
      list = popup.current;
    if (!button || !list) return;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
    const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
    const width = Math.min(Math.max(rect.width, 190), rightEdge - leftEdge);
    const rtl = getComputedStyle(button).direction === 'rtl';
    const below = bottomEdge - rect.bottom - 6;
    const above = rect.top - topEdge - 6;
    const upward = below < Math.min(180, list.scrollHeight) && above > below;
    const height = Math.max(44, Math.min(320, upward ? above : below));
    list.style.width = `${width}px`;
    list.style.maxHeight = `${height}px`;
    list.style.left = `${Math.max(leftEdge, Math.min(rtl ? rect.right - width : rect.left, rightEdge - width))}px`;
    list.style.top = `${upward ? Math.max(topEdge, rect.top - Math.min(list.scrollHeight, height) - 6) : Math.max(topEdge, rect.bottom + 6)}px`;
    list.dir = rtl ? 'rtl' : 'ltr';
  }, []);
  function show(
    index = selected >= 0 && !options[selected]?.disabled
      ? selected
      : (enabled[0] ?? -1),
  ) {
    if (trigger.current?.matches(':disabled') || !enabled.length) return;
    setActive(index);
    popup.current?.showPopover();
    position();
    setOpen(true);
  }
  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    close();
    onValueChange(option.value);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
      )
        close();
    };
    const update = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      if (
        !trigger.current?.getClientRects().length ||
        trigger.current.matches(':disabled')
      )
        close();
      else position();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [open, close, position]);
  useEffect(() => {
    if (!open) return;
    const item = document.getElementById(`${listId}-${active}`),
      list = popup.current;
    if (!item || !list) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (
      item.offsetTop + item.offsetHeight >
      list.scrollTop + list.clientHeight
    )
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [active, open, listId]);

  return (
    <>
      <button
        {...props}
        ref={trigger}
        id={triggerId}
        type="button"
        role="combobox"
        name={name}
        value={value}
        disabled={!ready || disabled || !enabled.length}
        className={`ui-select ${className}`}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        onClick={() => (open ? close() : show())}
        onBlur={(event) => {
          close();
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (event.key === 'Tab') {
            if (open) commit(active);
            return;
          }
          if (
            event.key === 'Enter' ||
            (event.key === ' ' && !search.current.text)
          ) {
            event.preventDefault();
            if (open) commit(active);
            else show();
            return;
          }
          if (
            [
              'ArrowDown',
              'ArrowUp',
              'Home',
              'End',
              'PageDown',
              'PageUp',
            ].includes(event.key)
          ) {
            event.preventDefault();
            if (!open) {
              show(
                event.key === 'End'
                  ? enabled.at(-1)
                  : event.key === 'Home'
                    ? enabled[0]
                    : undefined,
              );
              return;
            }
            const index = enabled.indexOf(active);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? enabled.length - 1
                  : index +
                    (event.key === 'ArrowUp'
                      ? -1
                      : event.key === 'PageUp'
                        ? -5
                        : event.key === 'PageDown'
                          ? 5
                          : 1);
            setActive(
              enabled[Math.max(0, Math.min(next, enabled.length - 1))] ?? -1,
            );
            return;
          }
          if (
            event.key.length === 1 &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            event.preventDefault();
            const at = Date.now();
            const previous =
              at - search.current.at < 800 ? search.current.text : '';
            const text =
              previous === event.key ? event.key : previous + event.key;
            search.current = { text, at };
            const ordered = [
              ...enabled.filter((index) => index > (open ? active : selected)),
              ...enabled.filter((index) => index <= (open ? active : selected)),
            ];
            const match = ordered.find((index) =>
              normalize(options[index]!.text).startsWith(normalize(text)),
            );
            if (match !== undefined) {
              if (open) setActive(match);
              else show(match);
            }
          }
        }}
      >
        {icon && (
          <span className="ui-select-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span
          className="ui-select-value"
          dir="auto"
          lang={options[selected]?.lang}
        >
          {options[selected]?.label ?? '—'}
        </span>
        <ChevronDown
          size={16}
          className="ui-select-chevron"
          aria-hidden="true"
        />
      </button>
      {name && (
        <input type="hidden" name={name} value={value} disabled={disabled} />
      )}
      <div
        ref={popup}
        popover="manual"
        role="listbox"
        id={listId}
        aria-labelledby={triggerId}
        className="ui-select-popup"
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === selected}
            aria-disabled={option.disabled || undefined}
            data-value={option.value}
            data-active={index === active}
            className="ui-select-option"
            lang={option.lang}
            dir={option.dir}
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => {
              if (!option.disabled) setActive(index);
            }}
            onClick={(event) => {
              event.preventDefault();
              commit(index);
            }}
          >
            <span dir="auto">{option.label}</span>
            <Check
              size={16}
              aria-hidden="true"
              className={index === selected ? '' : 'ui-select-check-hidden'}
            />
          </div>
        ))}
      </div>
    </>
  );
}
