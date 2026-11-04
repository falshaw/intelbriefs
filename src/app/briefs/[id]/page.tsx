import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BriefView from "@/components/BriefView";
import { getSessionUser } from "@/lib/session";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) notFound();

  // Only the owner may open a brief (same rule as GET /api/briefs/[id]).
  const brief = await prisma.brief.findUnique({
    where: { id, userId: user.id },
    include: { sources: true },
  });

  if (!brief) {
    notFound();
  }

  // Serialize dates for client component
  const serialized = {
    ...brief,
    createdAt: brief.createdAt.toISOString(),
    updatedAt: brief.updatedAt.toISOString(),
  };

  return (
    <div>
      <BriefView brief={serialized} />
    </div>
  );
}
