import { InvoiceCreate } from '../../../../features/invoices/components/invoice-create';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoiceCreate id={id} />;
}
