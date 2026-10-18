import { ProposalDetails } from '../../../features/proposals/components/proposal-details';
export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProposalDetails id={id} />;
}
