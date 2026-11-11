import { Suspense } from "react";
import { notFound } from "next/navigation";
import { HireHubApp } from "@/components/hirehub-app";

async function ProfileRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  return <HireHubApp initialProfileId={BigInt(id)} />;
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<HireHubApp />}>
      <ProfileRoute params={params} />
    </Suspense>
  );
}
