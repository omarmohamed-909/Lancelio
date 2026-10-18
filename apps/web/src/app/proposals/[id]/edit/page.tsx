import { ProposalEditorScreen } from '../../../../features/proposals/components/proposal-editor';
export default async function EditProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProposalEditorScreen id={id} />;
}
