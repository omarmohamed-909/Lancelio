'use client';
import { useI18n } from '../../i18n/language-provider';
import Image from 'next/image';
import Link from 'next/link';
import logo from './assets/logo.png';
import greenLogo from './assets/logo-green.png';
export function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <>
      <Image
        src={light ? logo : greenLogo}
        width={36}
        height={36}
        className={'brand-image' + (light ? '' : ' brand-image-day')}
        alt=""
        aria-hidden="true"
        unoptimized
      />
      {!light && (
        <Image
          src={logo}
          width={36}
          height={36}
          className="brand-image brand-image-night"
          alt=""
          aria-hidden="true"
          unoptimized
        />
      )}
    </>
  );
}
export function Brand({ light = false }: { light?: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      className={'brand' + (light ? ' brand-light' : '')}
      aria-label={t('Lancelio — الرئيسية')}
    >
      <span className="brand-mark">
        <BrandMark light={light} />
      </span>
      <span lang="en" dir="ltr">
        lancelio<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
