import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPayment, loadEngagement } from "@/lib/engagement-contract";
import { VIA_BASE_URL, HIREHUB_ENGAGEMENTS_ADDRESS, shortAddress } from "@/lib/config";
import { safeExternalUrl } from "@/lib/urls";

async function EngagementRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !HIREHUB_ENGAGEMENTS_ADDRESS) notFound();

  let engagement;
  try {
    engagement = await loadEngagement(BigInt(id));
  } catch {
    notFound();
  }
  const evidenceUrl = safeExternalUrl(engagement.evidenceUri);

  return (
    <>
      <p className="eyebrow">Public bilateral agreement #{id}</p>
      <h1>{engagement.title}</h1>
      <p className="record-lead">{engagement.description}</p>
      <div className="record-grid">
        <div><span>Status</span><strong>{engagement.status}</strong></div>
        <div><span>Employer profile</span><strong>#{engagement.employerProfileId.toString()}</strong></div>
        <div><span>Contributor profile</span><strong>#{engagement.contributorProfileId.toString()}</strong></div>
        <div><span>Employer signer</span><strong>{shortAddress(engagement.employer)}</strong></div>
        <div><span>Rating</span><strong>{engagement.rating || "Pending"}</strong></div>
        <div><span>Payment</span><strong>{formatPayment(engagement) ?? "Reputation only"}</strong></div>
        <div><span>Evidence hash</span><strong>{shortAddress(engagement.evidenceHash, 9)}</strong></div>
      </div>
      {evidenceUrl && (
        <p>
          <a href={evidenceUrl} target="_blank" rel="noreferrer">Open submitted evidence</a>
        </p>
      )}
      {engagement.review && <blockquote>“{engagement.review}”</blockquote>}
      <div className="hero-actions">
        <Link className="button button-primary" href={`/profile/${engagement.contributorProfileId.toString()}`}>
          View contributor
        </Link>
        <a
          className="button"
          href={`${VIA_BASE_URL}/address/${HIREHUB_ENGAGEMENTS_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
        >
          Verify contract
        </a>
      </div>
    </>
  );
}

export default function EngagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="shell record-page">
      <Link className="brand" href="/">HIREhub</Link>
      <Suspense fallback={<p className="eyebrow">Loading agreement from Hadrian…</p>}>
        <EngagementRecord params={params} />
      </Suspense>
    </main>
  );
}
