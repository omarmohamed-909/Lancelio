import { ProjectDetails } from '../../../features/projects/components/project-details';
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProjectDetails id={id} />;
}
