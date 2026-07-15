import BriefPackClient from "@/components/BriefPackClient";

export const dynamic = "force-dynamic";

export default async function BriefPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseFileId: string }>;
  searchParams: Promise<{ consultId?: string }>;
}) {
  const { caseFileId } = await params;
  const { consultId } = await searchParams;
  return <BriefPackClient caseFileId={caseFileId} consultId={consultId ?? null} />;
}
