"use client";

import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Blocks,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Fingerprint,
  FileCheck2,
  Globe2,
  Handshake,
  Inbox,
  Link2,
  LoaderCircle,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Wallet,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  toBytes,
  zeroAddress,
} from "viem";
import { WalletProvider, useRomeWallet } from "./wallet-provider";
import { demoProfiles, demoWork } from "@/lib/demo-data";
import {
  encodeHireHubCall,
  findPendingWalletLinkProfiles,
  loadEmployerInbox,
  loadProfileWork,
  loadProfiles,
  profileIdForWallet,
  publicClient,
} from "@/lib/contract";
import {
  encodeApproveCall,
  encodeEngagementCall,
  formatPayment,
  isStale,
  loadAllowance,
  loadProfileEngagements,
  loadTokenBalance,
  loadTokenInfo,
} from "@/lib/engagement-contract";
import { safeExternalUrl, validExternalUri, validateUtf8 } from "@/lib/urls";
import {
  HIREHUB_ADDRESS,
  HIREHUB_ENGAGEMENTS_ADDRESS,
  VIA_BASE_URL,
  isPreviewMode,
  shortAddress,
} from "@/lib/config";
import type { Engagement, Profile, WorkRecord } from "@/lib/types";

type ModalKind =
  | "profile"
  | "edit"
  | "work"
  | "link"
  | "accept"
  | "review"
  | "engagement"
  | "evidence"
  | "engagement-review"
  | null;

const ZERO_HASH = `0x${"0".repeat(64)}`;

const engagementActions: Partial<
  Record<string, Parameters<typeof encodeEngagementCall>[0]>
> = {
  accept: "acceptEngagement",
  decline: "declineEngagement",
  cancel: "cancelProposal",
  withdraw: "withdrawEngagement",
  reclaim: "reclaimStaleEngagement",
  dispute: "raiseDispute",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ProfileAvatar({ profile, large = false }: { profile: Profile; large?: boolean }) {
  const avatarUrl = safeExternalUrl(profile.avatarUrl);
  return (
    <div className={`avatar ${large ? "avatar-large" : ""}`}>
      {avatarUrl ? (
        // User-supplied image URLs cannot use next/image without a fixed remote allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
      ) : (
        initials(profile.displayName)
      )}
    </div>
  );
}

function ProfileCard({ profile, onOpen }: { profile: Profile; onOpen(): void }) {
  const walletKinds = [...new Set(profile.wallets.map((wallet) => wallet.kind))];

  return (
    <button className="profile-card" type="button" onClick={onOpen}>
      <div className="profile-top">
        <ProfileAvatar profile={profile} />
        <div className="profile-identity">
          <h3 className="profile-name">{profile.displayName}</h3>
          <div className="profile-address">{shortAddress(profile.owner)}</div>
        </div>
        <BadgeCheck className="verified-mark" size={19} aria-label="On-chain profile" />
      </div>
      <div className="wallet-badges">
        {walletKinds.map((kind) => (
          <span className={`wallet-badge wallet-badge-${kind}`} key={kind}>
            {kind === "solana" ? <Sparkles size={12} /> : <Wallet size={12} />}
            {kind === "solana" ? "Solana signer" : kind === "evm" ? "EVM" : "Rome address"}
          </span>
        ))}
      </div>
      <div className="profile-headline">{profile.headline}</div>
      <p className="profile-bio">{profile.bio}</p>
      <div className="profile-stats">
        <div className="stat">
          <strong>{profile.workCount}</strong>
          <span>work records</span>
        </div>
        <div className="stat">
          <strong>{profile.attestationCount}</strong>
          <span>attestations</span>
        </div>
        <div className="stat">
          <strong>{profile.wallets.length}</strong>
          <span>wallets</span>
        </div>
      </div>
      <span className="profile-open">
        View on-chain profile <ArrowRight size={15} />
      </span>
    </button>
  );
}

function StatusPill({ status }: { status: WorkRecord["status"] }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}

function WorkCard({
  record,
  canReview,
  onReview,
}: {
  record: WorkRecord;
  canReview: boolean;
  onReview(): void;
}) {
  return (
    <article className="work-card">
      <div className="work-card-top">
        <div>
          <h4>{record.title}</h4>
          <p className="profile-address">Employer {shortAddress(record.employer)}</p>
        </div>
        <StatusPill status={record.status} />
      </div>
      <p>{record.description}</p>
      {record.status === "approved" && (
        <div className="stars" aria-label={`${record.rating} of 5 stars`}>
          {"★".repeat(record.rating)}
          {"☆".repeat(5 - record.rating)}
        </div>
      )}
      {record.review && record.status !== "pending" && <p>“{record.review}”</p>}
      <div className="work-card-top">
        {safeExternalUrl(record.evidenceUrl) && (
          <a href={safeExternalUrl(record.evidenceUrl) ?? undefined} target="_blank" rel="noreferrer">
            View evidence <ExternalLink size={11} />
          </a>
        )}
        {canReview && record.status === "pending" && (
          <button className="button button-small" onClick={onReview}>
            Review work
          </button>
        )}
      </div>
    </article>
  );
}

function EngagementCard({
  engagement,
  activeProfileId,
  onAction,
}: {
  engagement: Engagement;
  activeProfileId: bigint | null;
  onAction(action: string, engagement: Engagement): void;
}) {
  const isEmployer = activeProfileId === engagement.employerProfileId;
  const isContributor = activeProfileId === engagement.contributorProfileId;
  const evidenceUrl = safeExternalUrl(engagement.evidenceUri);
  return (
    <article className="work-card engagement-card">
      <div className="work-card-top">
        <div>
          <p className="eyebrow">
            Agreement #{engagement.id.toString()} ·{" "}
            {isEmployer ? "Employer lane" : isContributor ? "Contributor lane" : "Public record"}
          </p>
          <h4>{engagement.title}</h4>
        </div>
        <span className={`status-pill status-${engagement.status}`}>
          {engagement.status.replace("-", " ")}
        </span>
      </div>
      <p>{engagement.description}</p>
      {engagement.paymentAmount > 0n && (
        <div className="escrow-note">
          {engagement.status === "completed"
            ? "Paid"
            : ["cancelled", "rejected"].includes(engagement.status)
              ? "Refunded"
              : "Escrowed"}
          : {formatPayment(engagement)}
        </div>
      )}
      {evidenceUrl && (
        <a href={evidenceUrl} target="_blank" rel="noreferrer">
          Evidence <ExternalLink size={11} />
        </a>
      )}
      {engagement.review && <p>“{engagement.review}”</p>}
      {engagement.status === "completed" && (
        <div className="stars" aria-label={`${engagement.rating} of 5 stars`}>
          {"★".repeat(engagement.rating)}
          {"☆".repeat(5 - engagement.rating)}
        </div>
      )}
      <div className="card-actions">
        <a className="button button-small" href={`/engagement/${engagement.id.toString()}`}>
          Share
        </a>
        {isContributor && engagement.status === "proposed" && (
          <>
            <button className="button button-small button-primary" onClick={() => onAction("accept", engagement)}>
              Accept
            </button>
            <button className="button button-small" onClick={() => onAction("decline", engagement)}>
              Decline
            </button>
          </>
        )}
        {isContributor &&
          ["accepted", "revision-requested"].includes(engagement.status) && (
            <button className="button button-small button-primary" onClick={() => onAction("evidence", engagement)}>
              Submit evidence
            </button>
          )}
        {isEmployer && engagement.status === "submitted" && (
          <button className="button button-small button-primary" onClick={() => onAction("review", engagement)}>
            Review delivery
          </button>
        )}
        {isEmployer && engagement.status === "proposed" && (
          <button className="button button-small" onClick={() => onAction("cancel", engagement)}>
            Cancel proposal
          </button>
        )}
        {isEmployer &&
          engagement.status === "disputed" &&
          engagement.evidenceHash !== ZERO_HASH && (
            <button className="button button-small button-primary" onClick={() => onAction("review", engagement)}>
              Settle and pay
            </button>
          )}
        {isEmployer && isStale(engagement) && (
          <button className="button button-small" onClick={() => onAction("reclaim", engagement)}>
            Reclaim stale escrow
          </button>
        )}
        {isContributor &&
          ["accepted", "revision-requested", "disputed"].includes(engagement.status) && (
            <button className="button button-small" onClick={() => onAction("withdraw", engagement)}>
              Withdraw and refund
            </button>
          )}
        {(isEmployer || isContributor) &&
          ["accepted", "submitted", "revision-requested"].includes(engagement.status) && (
            <button className="button button-small button-danger" onClick={() => onAction("dispute", engagement)}>
              Raise dispute
            </button>
          )}
      </div>
    </article>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose(): void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      "button, input, textarea, select, a[href]",
    );
    focusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(
        "button, input, textarea, select, a[href]",
      )].filter((item) => !item.hasAttribute("disabled"));
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="button button-quiet button-small" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function TextField({
  label,
  name,
  placeholder,
  maxLength,
  required,
  wide = false,
  textarea = false,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  wide?: boolean;
  textarea?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className={`field ${wide ? "field-wide" : ""}`}>
      <span className="field-label">
        {label} {maxLength && <span>max {maxLength}</span>}
      </span>
      {textarea ? (
        <textarea
          name={name}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          defaultValue={defaultValue}
        />
      ) : (
        <input
          name={name}
          type={type}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          defaultValue={defaultValue}
        />
      )}
    </label>
  );
}

function HireHubExperience({ initialProfileId }: { initialProfileId?: bigint }) {
  const wallet = useRomeWallet();
  const [profiles, setProfiles] = useState<Profile[]>(isPreviewMode ? demoProfiles : []);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [work, setWork] = useState<WorkRecord[]>(isPreviewMode ? demoWork : []);
  const [allWork, setAllWork] = useState<WorkRecord[]>(isPreviewMode ? demoWork : []);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [dashboardEngagements, setDashboardEngagements] = useState<Engagement[]>([]);
  const [connectedProfileId, setConnectedProfileId] = useState<bigint | null>(null);
  const [pendingLinkIds, setPendingLinkIds] = useState<bigint[]>([]);
  const [employerInbox, setEmployerInbox] = useState<WorkRecord[]>([]);
  const [selectedEngagement, setSelectedEngagement] = useState<Engagement | null>(null);
  const [reviewRecord, setReviewRecord] = useState<WorkRecord | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!isPreviewMode);
  const [notice, setNotice] = useState<string | null>(null);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [connectingLane, setConnectingLane] = useState<"evm" | "solana" | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [chainHealth, setChainHealth] = useState<{
    online: boolean | null;
    block?: number;
  }>({ online: null });

  useEffect(() => {
    if (!selected || modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modal, selected]);

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      publicClient
        .getBlockNumber()
        .then((block) => !cancelled && setChainHealth({ online: true, block: Number(block) }))
        .catch(() => !cancelled && setChainHealth({ online: false }));
    void check();
    const interval = window.setInterval(check, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const classifiedProfiles = useMemo(
    () =>
      profiles.map((profile) => ({
        ...profile,
        wallets: profile.wallets.map((identity) => ({
          ...identity,
          kind:
            wallet.syntheticAddress?.toLowerCase() === identity.address.toLowerCase()
              ? ("solana" as const)
              : wallet.evmAddress?.toLowerCase() === identity.address.toLowerCase()
                ? ("evm" as const)
                : identity.kind,
        })),
      })),
    [profiles, wallet.evmAddress, wallet.syntheticAddress],
  );

  const refresh = useCallback(async () => {
    if (isPreviewMode) return;
    setLoading(true);
    try {
      const next = await loadProfiles();
      setProfiles(next);
      if (selected) {
        const nextSelected = next.find((profile) => profile.id === selected.id) ?? null;
        setSelected(nextSelected);
        if (nextSelected) {
          const [nextWork, nextEngagements] = await Promise.all([
            loadProfileWork(nextSelected.id),
            loadProfileEngagements(nextSelected.id),
          ]);
          setWork(nextWork);
          setEngagements(nextEngagements);
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not read HireHub from Hadrian.");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    if (!isPreviewMode) {
      void loadProfiles()
        .then(async (next) => {
          setProfiles(next);
          const records = await Promise.all(next.map((profile) => loadProfileWork(profile.id)));
          setAllWork(records.flat());
        })
        .catch((error: unknown) =>
          setNotice(error instanceof Error ? error.message : "Could not read HireHub from Hadrian."),
        )
        .finally(() => setLoading(false));
    }
  }, []);

  const openProfile = useCallback(async (profile: Profile) => {
    setSelected(profile);
    setDetailLoading(true);
    if (isPreviewMode) {
      setWork(demoWork.filter((record) => record.profileId === profile.id));
      setDetailLoading(false);
      return;
    }
    try {
      const [nextWork, nextEngagements] = await Promise.all([
        loadProfileWork(profile.id),
        loadProfileEngagements(profile.id),
      ]);
      setWork(nextWork);
      setEngagements(nextEngagements);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load profile activity.");
      setWork([]);
      setEngagements([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openedInitialProfile = useRef(false);
  useEffect(() => {
    if (!initialProfileId || openedInitialProfile.current || !classifiedProfiles.length) return;
    const profile = classifiedProfiles.find((item) => item.id === initialProfileId);
    if (profile) {
      const timeout = window.setTimeout(() => {
        openedInitialProfile.current = true;
        void openProfile(profile);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [classifiedProfiles, initialProfileId, openProfile]);

  useEffect(() => {
    if (!wallet.activeAddress || isPreviewMode) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      profileIdForWallet(wallet.activeAddress),
      findPendingWalletLinkProfiles(wallet.activeAddress),
      loadEmployerInbox(wallet.activeAddress),
    ])
      .then(([profileId, links, inbox]) => {
        if (cancelled) return;
        setConnectedProfileId(profileId === 0n ? null : profileId);
        setPendingLinkIds(links);
        setEmployerInbox(inbox);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : "Could not load wallet dashboard.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.activeAddress]);

  useEffect(() => {
    if (!connectedProfileId) {
      void Promise.resolve().then(() => setDashboardEngagements([]));
      return undefined;
    }
    void loadProfileEngagements(connectedProfileId)
      .then(setDashboardEngagements)
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : "Could not load engagements."),
      );
  }, [connectedProfileId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return classifiedProfiles;
    return classifiedProfiles.filter(
      (profile) =>
        profile.displayName.toLowerCase().includes(term) ||
        profile.headline.toLowerCase().includes(term) ||
        profile.bio.toLowerCase().includes(term) ||
        profile.wallets.some((item) => item.address.toLowerCase().includes(term)) ||
        allWork.some(
          (record) =>
            record.profileId === profile.id &&
            [record.title, record.description, record.review].some((value) =>
              value.toLowerCase().includes(term),
            ),
        ),
    );
  }, [allWork, classifiedProfiles, query]);

  const networkStats = useMemo(
    () => ({
      profiles: profiles.length,
      records: profiles.reduce((total, profile) => total + profile.workCount, 0),
      attestations: profiles.reduce(
        (total, profile) => total + profile.attestationCount,
        0,
      ),
      wallets: profiles.reduce((total, profile) => total + profile.wallets.length, 0),
    }),
    [profiles],
  );

  const run = async (
    data: `0x${string}`,
    close = true,
    target = HIREHUB_ADDRESS ?? undefined,
  ) => {
    setNotice(null);
    setFormError(null);
    try {
      await wallet.executeCall(data, target);
      if (close) setModal(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed.";
      setFormError(message);
      return false;
    }
    try {
      await refresh();
      if (connectedProfileId) {
        setDashboardEngagements(await loadProfileEngagements(connectedProfileId));
      }
    } catch {
      setNotice("Transaction confirmed, but the latest records could not be refreshed yet.");
    }
    return true;
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      displayName: String(data.get("displayName") ?? ""),
      headline: String(data.get("headline") ?? ""),
      bio: String(data.get("bio") ?? ""),
      avatarUrl: String(data.get("avatarUrl") ?? ""),
    };
    const validationError =
      validateUtf8(values.displayName, 64, "Display name") ??
      validateUtf8(values.headline, 120, "Headline") ??
      validateUtf8(values.bio, 500, "Bio") ??
      validateUtf8(values.avatarUrl, 256, "Avatar URL");
    if (validationError) return setFormError(validationError);
    if (values.avatarUrl && !validExternalUri(values.avatarUrl)) {
      return setFormError("Avatar must use an HTTPS URL.");
    }
    await run(
      encodeHireHubCall("createProfile", [
        values.displayName,
        values.headline,
        values.bio,
        values.avatarUrl,
      ]),
    );
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const avatarUrl = String(data.get("avatarUrl") ?? "");
    if (avatarUrl && !validExternalUri(avatarUrl)) {
      return setFormError("Avatar must use an HTTPS URL.");
    }
    await run(
      encodeHireHubCall("updateProfile", [
        selected.id,
        data.get("displayName"),
        data.get("headline"),
        data.get("bio"),
        avatarUrl,
      ]),
    );
  };

  const handleWork = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const employer = String(data.get("employer"));
    const evidenceUrl = String(data.get("evidenceUrl"));
    if (!isAddress(employer)) return setFormError("Enter a valid employer Rome address.");
    if (!validExternalUri(evidenceUrl)) {
      return setFormError("Evidence must use an HTTPS or IPFS URL.");
    }
    await run(
      encodeHireHubCall("submitWork", [
        selected.id,
        getAddress(employer),
        data.get("title"),
        data.get("description"),
        evidenceUrl,
      ]),
    );
  };

  const handleLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const target = String(new FormData(event.currentTarget).get("wallet"));
    if (!isAddress(target)) return setFormError("Enter a valid Rome address.");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const functionName =
      submitter?.value === "cancel" ? "cancelWalletProposal" : "proposeWallet";
    await run(encodeHireHubCall(functionName, [selected.id, getAddress(target)]));
  };

  const handleAccept = async (profileId: bigint) => {
    if (await run(encodeHireHubCall("acceptWalletLink", [profileId]))) {
      setPendingLinkIds((items) => items.filter((item) => item !== profileId));
    }
  };

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewRecord) return;
    const data = new FormData(event.currentTarget);
    const approved = data.get("decision") === "approve";
    const rating = approved ? Number(data.get("rating")) : 0;
    if (await run(
      encodeHireHubCall("reviewWork", [
        reviewRecord.id,
        approved,
        rating,
        data.get("review"),
      ]),
    )) {
      setReviewRecord(null);
    }
  };

  const handleCreateEngagement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !HIREHUB_ENGAGEMENTS_ADDRESS) return;
    const data = new FormData(event.currentTarget);
    const token = String(data.get("paymentToken") ?? "").trim();
    const amount = String(data.get("paymentAmount") ?? "").trim();
    const validationError =
      validateUtf8(String(data.get("title") ?? ""), 100, "Milestone title") ??
      validateUtf8(String(data.get("description") ?? ""), 500, "Scope");
    if (validationError) return setFormError(validationError);
    if (Boolean(token) !== Boolean(amount)) {
      return setFormError("Provide both a token address and amount, or leave both blank.");
    }
    if (token && !isAddress(token)) return setFormError("Enter a valid ERC-20 token address.");
    let paymentAmount = 0n;
    if (token) {
      const tokenAddress = getAddress(token);
      const owner = wallet.activeAddress;
      if (!owner) return setFormError("Connect the employer wallet first.");
      setFormError(null);
      try {
        const info = await loadTokenInfo(tokenAddress);
        if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error("amount");
        paymentAmount = parseUnits(amount, info.decimals);
        if (paymentAmount === 0n) throw new Error("amount");
        const [balance, allowance] = await Promise.all([
          loadTokenBalance(tokenAddress, owner),
          loadAllowance(tokenAddress, owner),
        ]);
        if (balance < paymentAmount) {
          return setFormError(`This wallet holds less than ${amount} ${info.symbol}.`);
        }
        if (allowance < paymentAmount) {
          const approved = await run(encodeApproveCall(paymentAmount), false, tokenAddress);
          if (!approved) return;
        }
      } catch (error) {
        return setFormError(
          error instanceof Error && error.message === "amount"
            ? "Enter a positive token amount."
            : "This address does not behave like an ERC-20 token on Hadrian.",
        );
      }
    }
    await run(
      encodeEngagementCall("createEngagement", [
        selected.id,
        data.get("title"),
        data.get("description"),
        token ? getAddress(token) : zeroAddress,
        paymentAmount,
      ]),
      true,
      HIREHUB_ENGAGEMENTS_ADDRESS,
    );
  };

  const handleEngagementAction = async (action: string, record: Engagement) => {
    if (!HIREHUB_ENGAGEMENTS_ADDRESS) return;
    setSelectedEngagement(record);
    if (action === "evidence") return setModal("evidence");
    if (action === "review") return setModal("engagement-review");
    const functionName = engagementActions[action];
    if (!functionName) return;
    const succeeded = await run(
      encodeEngagementCall(functionName, [record.id]),
      false,
      HIREHUB_ENGAGEMENTS_ADDRESS,
    );
    if (succeeded && selected) {
      setEngagements(await loadProfileEngagements(selected.id));
    }
  };

  const handleEvidence = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEngagement || !HIREHUB_ENGAGEMENTS_ADDRESS) return;
    const uri = String(new FormData(event.currentTarget).get("evidenceUri"));
    if (!validExternalUri(uri)) {
      return setFormError("Evidence must use an HTTPS or IPFS URL.");
    }
    await run(
      encodeEngagementCall("submitEvidence", [
        selectedEngagement.id,
        uri,
        keccak256(toBytes(uri)),
      ]),
      true,
      HIREHUB_ENGAGEMENTS_ADDRESS,
    );
  };

  const handleEngagementReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEngagement || !HIREHUB_ENGAGEMENTS_ADDRESS) return;
    const data = new FormData(event.currentTarget);
    const decision = String(data.get("decision"));
    const feedback = String(data.get("review") ?? "");
    const functionName =
      decision === "approve"
        ? "approveEngagement"
        : decision === "revision"
          ? "requestRevision"
          : "rejectEngagement";
    const args =
      decision === "approve"
        ? [selectedEngagement.id, Number(data.get("rating")), feedback]
        : [selectedEngagement.id, feedback];
    await run(
      encodeEngagementCall(functionName, args),
      true,
      HIREHUB_ENGAGEMENTS_ADDRESS,
    );
  };

  const activeIsOwner =
    selected && wallet.activeAddress?.toLowerCase() === selected.owner.toLowerCase();
  const activeIsMember =
    selected &&
    wallet.activeAddress &&
    selected.wallets.some(
      (item) => item.address.toLowerCase() === wallet.activeAddress?.toLowerCase(),
    );

  const connect = async (lane: "evm" | "solana") => {
    setNotice(null);
    setWalletNotice(null);
    setConnectingLane(lane);
    try {
      if (lane === "evm") await wallet.connectEvm();
      else await wallet.connectSolana();
    } catch (error) {
      setWalletNotice(error instanceof Error ? error.message : "Wallet connection failed.");
    } finally {
      setConnectingLane(null);
    }
  };

  return (
    <>
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#">
            <Image
              className="brand-logo"
              src="/hirehub-mark.svg"
              alt=""
              width={34}
              height={34}
              priority
            />
            HIREhub
          </a>
          <nav className="nav" aria-label="Primary navigation">
            <a href="#dashboard">My dashboard</a>
            <a href="#contributors">Contributors</a>
            <a href="#how-it-works">How it works</a>
            <a href="#built-on-rome">Built on Rome</a>
          </nav>
          <div className="wallet-cluster">
            {wallet.evmAddress ? (
              <button
                className={`button button-small ${wallet.activeLane === "evm" ? "button-primary" : ""}`}
                onClick={() => wallet.selectLane("evm")}
                title={wallet.evmAddress}
                aria-label={`Use MetaMask address ${wallet.evmAddress}`}
              >
                <Wallet size={14} /> <span>{shortAddress(wallet.evmAddress)}</span>
              </button>
            ) : (
              <button
                className="button button-small"
                type="button"
                disabled={connectingLane === "evm"}
                onClick={() => void connect("evm")}
                aria-label="Connect MetaMask"
              >
                <Wallet size={14} /> <span>{connectingLane === "evm" ? "Connecting…" : "MetaMask"}</span>
              </button>
            )}
            {wallet.syntheticAddress ? (
              <button
                className={`button button-small ${wallet.activeLane === "solana" ? "button-primary" : ""}`}
                onClick={() => wallet.selectLane("solana")}
                title={`Solana synthetic: ${wallet.syntheticAddress}`}
                aria-label={`Use Solflare synthetic address ${wallet.syntheticAddress}`}
              >
                <Sparkles size={14} /> <span>{shortAddress(wallet.syntheticAddress)}</span>
              </button>
            ) : (
              <button
                className="button button-small"
                type="button"
                disabled={connectingLane === "solana"}
                onClick={() => void connect("solana")}
                aria-label="Connect Solflare"
              >
                <Sparkles size={14} />{" "}
                <span>{connectingLane === "solana" ? "Connecting…" : "Solflare"}</span>
              </button>
            )}
          </div>
        </div>
        {walletNotice && (
          <div className="wallet-alert" role="alert">
            {walletNotice}
          </div>
        )}
      </header>

      <main>
        <section className="shell hero">
          <div className="hero-content">
            <div className="hero-kicker">
              <span className="live-indicator">
                <span className="dot" />{" "}
                {isPreviewMode ? "Preview mode" : chainHealth.online ? "Live on Hadrian" : "Hadrian status"}
              </span>
              <span>One identity layer · Two wallet ecosystems</span>
            </div>
            <h1>
              One reputation. <em>Both wallet worlds.</em>
            </h1>
            <p className="hero-copy">
              Employers propose real engagements. Contributors accept, deliver, and earn
              portable attestations from either EVM or Solana wallets in one Rome state.
            </p>
            <div className="hero-actions">
              <a className="button button-primary button-large" href="#contributors">
                Explore contributors <ArrowRight size={17} />
              </a>
              <a
                className="button button-large"
                href={HIREHUB_ADDRESS ? `${VIA_BASE_URL}/address/${HIREHUB_ADDRESS}` : VIA_BASE_URL}
                target="_blank"
                rel="noreferrer"
              >
                View contract <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="hero-trust">
              <span><Handshake size={15} /> Bilateral consent</span>
              <span><Fingerprint size={15} /> Consent-linked</span>
              <span><Blocks size={15} /> On-chain metadata</span>
            </div>
          </div>
          <aside className="hero-note">
            <div className="hero-note-head">
              <span
                className={`network-pill ${chainHealth.online === false ? "network-pill-offline" : ""}`}
                data-testid="network-health"
              >
                <span className="dot" />{" "}
                {chainHealth.online === null
                  ? "Checking Hadrian…"
                  : chainHealth.online
                    ? `Block ${chainHealth.block?.toLocaleString("en-US")}`
                    : "Hadrian RPC unreachable"}
              </span>
              <Activity size={18} />
            </div>
            <strong>Work agreements both sides sign.</strong>
            <p>Profiles, consent, agreement state, evidence hashes, escrow, and reviews settle to shared Rome contracts.</p>
            <div className="network-stack">
              <div><span>Contracts</span><strong>Identity + Engagements</strong></div>
              <div><span>Network</span><strong>Hadrian · 200010</strong></div>
              <div><span>Wallet lanes</span><strong>MetaMask + Solflare</strong></div>
            </div>
          </aside>
        </section>

        <section className="shell network-stats" aria-label="HIREhub network statistics">
          <div><strong>{loading ? "—" : networkStats.profiles}</strong><span>contributors</span></div>
          <div><strong>{loading ? "—" : networkStats.wallets}</strong><span>consent-linked addresses</span></div>
          <div><strong>{loading ? "—" : networkStats.records}</strong><span>work records</span></div>
          <div><strong>{loading ? "—" : networkStats.attestations}</strong><span>attestations</span></div>
        </section>

        <section className="shell section dashboard" id="dashboard">
          <div className="section-head">
            <div>
              <p className="eyebrow">Connected-wallet workspace</p>
              <h2>Your HIREhub dashboard.</h2>
              <p>Proposals, employer reviews, and active agreements appear automatically.</p>
            </div>
            {wallet.activeAddress && (
              <span className="network-pill">{shortAddress(wallet.activeAddress)} · {wallet.activeLane}</span>
            )}
          </div>
          {!wallet.activeAddress ? (
            <div className="empty-state compact">
              Connect MetaMask or Solflare to load your profile and action inbox.
            </div>
          ) : (
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <div className="dashboard-card-head">
                  <Fingerprint size={20} />
                  <span>Identity</span>
                </div>
                {connectedProfileId ? (
                  <>
                    <strong>Profile #{connectedProfileId.toString()}</strong>
                    <p>Your active Rome address is linked to this profile.</p>
                    <button
                      className="button button-small"
                      onClick={() => {
                        const profile = classifiedProfiles.find((item) => item.id === connectedProfileId);
                        if (profile) void openProfile(profile);
                      }}
                    >
                      Open my profile
                    </button>
                  </>
                ) : (
                  <>
                    <strong>No profile yet</strong>
                    <p>Create a profile or accept a pending wallet link.</p>
                    <button className="button button-small button-primary" onClick={() => setModal("profile")}>
                      Create profile
                    </button>
                  </>
                )}
              </article>
              <article className="dashboard-card">
                <div className="dashboard-card-head"><Link2 size={20} /><span>Wallet links</span></div>
                <strong>{pendingLinkIds.length} pending</strong>
                <p>Only your active wallet can accept these consent requests.</p>
                {pendingLinkIds.map((profileId) => (
                  <button
                    className="button button-small"
                    disabled={wallet.isBusy}
                    key={profileId.toString()}
                    onClick={() => void handleAccept(profileId)}
                  >
                    Accept profile #{profileId.toString()}
                  </button>
                ))}
              </article>
              <article className="dashboard-card">
                <div className="dashboard-card-head"><Inbox size={20} /><span>Employer inbox</span></div>
                <strong>{employerInbox.length} legacy reviews</strong>
                <p>Pending v1 attestations addressed to this exact Rome address.</p>
                {employerInbox.map((record) => (
                  <button
                    className="button button-small"
                    key={record.id.toString()}
                    onClick={() => {
                      setReviewRecord(record);
                      setModal("review");
                    }}
                  >
                    Review {record.title}
                  </button>
                ))}
              </article>
            </div>
          )}
          {wallet.activeAddress && (
            <div className="dashboard-feed">
              <div className="subsection-head">
                <h3>Agreement activity</h3>
                <span className="preview-pill">{dashboardEngagements.length} records</span>
              </div>
              {HIREHUB_ENGAGEMENTS_ADDRESS ? (
                dashboardEngagements.length ? (
                  dashboardEngagements.map((record) => (
                    <EngagementCard
                      key={record.id.toString()}
                      engagement={record}
                      activeProfileId={connectedProfileId}
                      onAction={(action, item) => void handleEngagementAction(action, item)}
                    />
                  ))
                ) : (
                  <div className="empty-state compact">No bilateral agreements for this profile yet.</div>
                )
              ) : (
                <div className="empty-state compact">
                  Engagement companion is ready in code and awaiting Hadrian deployment.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="shell section section-rule" id="contributors">
          <div className="section-head">
            <div>
              <p className="eyebrow">{profiles.length} on-chain contributors</p>
              <h2>Find people by their work.</h2>
              <p>Search a name, skill, EVM address, or Rome synthetic address.</p>
            </div>
            <div className="search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contributors or paste an address"
                aria-label="Search contributors"
              />
            </div>
          </div>

          <div className="detail-actions">
            <button className="button button-primary" onClick={() => setModal("profile")}>
              Create your profile <ChevronRight size={16} />
            </button>
            {pendingLinkIds.length > 0 && (
              <button className="button" onClick={() => setModal("accept")}>
                Accept wallet link ({pendingLinkIds.length})
              </button>
            )}
            {isPreviewMode && <span className="preview-pill">Preview data · read only</span>}
          </div>

          {notice && (
            <div className="form-note" role="alert">
              <CircleAlert size={15} style={{ display: "inline", marginRight: 7 }} />
              {notice}
            </div>
          )}

          <div className="profile-grid">
            {loading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" /> Loading Hadrian records…
              </div>
            ) : filtered.length ? (
              filtered.map((profile) => (
                <ProfileCard
                  key={profile.id.toString()}
                  profile={profile}
                  onOpen={() => void openProfile(profile)}
                />
              ))
            ) : (
              <div className="empty-state">No contributor matches that search yet.</div>
            )}
          </div>
        </section>

        <section className="shell section" id="how-it-works">
          <div className="section-head">
            <div>
              <p className="eyebrow">Designed for trust</p>
              <h2>Simple proof, useful reputation.</h2>
            </div>
          </div>
          <div className="how-grid">
            <article className="how-card">
              <div className="how-top"><span className="how-number">01</span><Fingerprint size={22} /></div>
              <h3>Create one contributor profile</h3>
              <p>Start with MetaMask or Solflare. Your signing wallet becomes the profile owner.</p>
            </article>
            <article className="how-card">
              <div className="how-top"><span className="how-number">02</span><Link2 size={22} /></div>
              <h3>Link wallets with consent</h3>
              <p>The owner proposes a wallet. The target wallet must sign separately before it joins.</p>
            </article>
            <article className="how-card">
              <div className="how-top"><span className="how-number">03</span><ShieldCheck size={22} /></div>
              <h3>Agree, deliver, attest</h3>
              <p>An employer proposes the work first. The contributor accepts, submits a hashed proof, and earns a review after approval.</p>
            </article>
          </div>
        </section>

        <section className="shell section architecture" id="built-on-rome">
          <div className="architecture-copy">
            <p className="eyebrow">Rome-native by design</p>
            <h2>One labor market.<br /><em>No identity bridge.</em></h2>
            <p>
              Solana users control a Rome synthetic address directly from Solflare.
              EVM users arrive through MetaMask. Both write to the same Solidity state,
              so reputation never needs to be mirrored or synchronized.
            </p>
            <a href="https://docs.rome.builders" target="_blank" rel="noreferrer">
              Explore Rome documentation <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="architecture-map" aria-label="HIREhub wallet architecture">
            <div className="architecture-node">
              <Wallet size={20} /><span>MetaMask</span><small>EVM wallet</small>
            </div>
            <span className="architecture-line" />
            <div className="architecture-core">
              <Image
                className="architecture-logo"
                src="/hirehub-mark.svg"
                alt=""
                width={44}
                height={44}
              />
              <strong>HIREhub protocol</strong>
              <small>Shared Rome state</small>
            </div>
            <span className="architecture-line" />
            <div className="architecture-node">
              <Sparkles size={20} /><span>Solflare</span><small>Solana wallet</small>
            </div>
            <div className="architecture-settlement">
              <Globe2 size={15} /> Settled through Rome on Solana
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="shell footer-inner">
          <span>HIREhub · Built for the Rome Arena on Hadrian</span>
          <span>
            Shared contracts, EVM and Solana wallets ·{" "}
            <a href={HIREHUB_ADDRESS ? `${VIA_BASE_URL}/address/${HIREHUB_ADDRESS}` : VIA_BASE_URL}>
              View on Via
            </a>
          </span>
        </div>
      </footer>

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.displayName} profile`}
          >
            <button
              className="button button-quiet button-small drawer-close"
              onClick={() => setSelected(null)}
            >
              <X size={18} /> Close
            </button>
            <div className="detail-header">
              <ProfileAvatar profile={selected} large />
              <div>
                <h2>{selected.displayName}</h2>
                <p>{selected.headline}</p>
              </div>
            </div>
            <p className="detail-bio">{selected.bio}</p>
            <div className="detail-actions">
              {activeIsMember && (
                <button className="button button-primary" onClick={() => setModal("work")}>
                  <BriefcaseBusiness size={15} /> Add work
                </button>
              )}
              {activeIsOwner && (
                <>
                  <button className="button" onClick={() => setModal("edit")}>
                    <Pencil size={15} /> Edit profile
                  </button>
                  <button className="button" onClick={() => setModal("link")}>
                    <Link2 size={15} /> Link wallet
                  </button>
                </>
              )}
              {connectedProfileId &&
                connectedProfileId !== selected.id &&
                HIREHUB_ENGAGEMENTS_ADDRESS && (
                  <button className="button button-primary" onClick={() => setModal("engagement")}>
                    <Handshake size={15} /> Propose engagement
                  </button>
                )}
              <a className="button" href={`/profile/${selected.id.toString()}`}>
                <ExternalLink size={15} /> Share profile
              </a>
              {!HIREHUB_ENGAGEMENTS_ADDRESS && connectedProfileId !== selected.id && (
                <span className="form-note inline-note">Agreement v2 awaiting deployment</span>
              )}
            </div>

            <section className="subsection">
              <div className="subsection-head">
                <h3>Consent-linked Rome addresses</h3>
                <span className="preview-pill">{selected.wallets.length} linked</span>
              </div>
              {selected.wallets.map((item) => (
                <div className="wallet-row" key={item.address}>
                  <span className="wallet-icon">
                    {item.kind === "solana" ? <Sparkles size={17} /> : <Wallet size={17} />}
                  </span>
                  <div className="wallet-meta">
                    <strong>{item.label}</strong>
                    <span>{item.address}</span>
                  </div>
                </div>
              ))}
            </section>

            <section className="subsection">
              <div className="subsection-head">
                <h3>Work & attestations</h3>
                <ShieldCheck size={20} color="var(--plum)" />
              </div>
              {detailLoading ? (
                <div className="empty-state compact"><LoaderCircle className="spin" /> Loading activity…</div>
              ) : work.length ? (
                work.map((record) => (
                  <WorkCard
                    key={record.id.toString()}
                    record={record}
                    canReview={
                      wallet.activeAddress?.toLowerCase() === record.employer.toLowerCase()
                    }
                    onReview={() => {
                      setReviewRecord(record);
                      setModal("review");
                    }}
                  />
                ))
              ) : (
                <div className="empty-state">No work records submitted yet.</div>
              )}
            </section>
            <section className="subsection">
              <div className="subsection-head">
                <h3>Bilateral agreements</h3>
                <Handshake size={20} color="var(--plum)" />
              </div>
              {detailLoading ? (
                <div className="empty-state compact">Loading agreements…</div>
              ) : engagements.length ? (
                engagements.map((record) => (
                  <EngagementCard
                    key={record.id.toString()}
                    engagement={record}
                    activeProfileId={connectedProfileId}
                    onAction={(action, item) => void handleEngagementAction(action, item)}
                  />
                ))
              ) : (
                <div className="empty-state compact">No agreements recorded yet.</div>
              )}
            </section>
          </aside>
        </>
      )}

      {modal === "profile" && (
        <Modal
          title="Create your profile"
          description="The active wallet becomes the owner. Profile fields are stored on Hadrian."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleCreate(event)}>
            <div className="form-grid">
              <TextField label="Display name" name="displayName" maxLength={64} required />
              <TextField label="Headline" name="headline" maxLength={120} required />
              <TextField label="Bio" name="bio" maxLength={500} textarea wide />
              <TextField
                label="Avatar URL"
                name="avatarUrl"
                maxLength={256}
                type="url"
                wide
                placeholder="https://…"
              />
            </div>
            <div className="form-note">
              Connect the wallet you want to use as the profile owner before signing.
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button-primary" disabled={!wallet.activeAddress || wallet.isBusy}>
                Create on Hadrian
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "edit" && selected && (
        <Modal
          title="Edit profile"
          description="Only the original profile owner can update these public fields."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleUpdate(event)}>
            <div className="form-grid">
              <TextField label="Display name" name="displayName" maxLength={64} required defaultValue={selected.displayName} />
              <TextField label="Headline" name="headline" maxLength={120} required defaultValue={selected.headline} />
              <TextField label="Bio" name="bio" maxLength={500} textarea wide defaultValue={selected.bio} />
              <TextField label="Avatar HTTPS URL" name="avatarUrl" maxLength={256} type="url" wide defaultValue={selected.avatarUrl} />
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="button button-primary" disabled={wallet.isBusy}>Save on Hadrian</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "work" && selected && (
        <Modal
          title="Submit completed work"
          description="Only the employer address you name can review this record."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleWork(event)}>
            <div className="form-grid">
              <TextField label="Project title" name="title" maxLength={100} required wide />
              <TextField
                label="Employer address"
                name="employer"
                placeholder="0x…"
                required
                wide
              />
              <TextField label="What you delivered" name="description" maxLength={500} textarea wide />
              <TextField
                label="Evidence URL"
                name="evidenceUrl"
                maxLength={256}
                type="url"
                placeholder="GitHub, live demo, or IPFS"
                required
                wide
              />
            </div>
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button-primary" disabled={wallet.isBusy}>Submit record</button>
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
          </form>
        </Modal>
      )}

      {modal === "link" && selected && (
        <Modal
          title="Propose a wallet link"
          description="The target wallet must accept from its own key before it appears on this profile."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleLink(event)}>
            <TextField
              label="Target EVM or synthetic address"
              name="wallet"
              placeholder="0x…"
              defaultValue={wallet.syntheticAddress ?? ""}
              required
              wide
            />
            <div className="form-note">
              For a Solana wallet, connect it once to reveal its Rome synthetic address.
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button" name="action" value="cancel" disabled={wallet.isBusy}>
                Cancel proposal
              </button>
              <button className="button button-primary" name="action" value="propose" disabled={wallet.isBusy}>
                Propose link
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "accept" && (
        <Modal
          title="Accept a wallet link"
          description="These profiles proposed your currently active Rome address."
          onClose={() => setModal(null)}
        >
          <div className="request-list">
            {pendingLinkIds.map((profileId) => (
              <div className="request-row" key={profileId.toString()}>
                <span>Profile #{profileId.toString()}</span>
                <button
                  className="button button-primary button-small"
                  disabled={wallet.isBusy}
                  onClick={() => void handleAccept(profileId)}
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
          {formError && <div className="form-error" role="alert">{formError}</div>}
        </Modal>
      )}

      {modal === "engagement" && selected && (
        <Modal
          title={`Propose work to ${selected.displayName}`}
          description="The contributor must accept before they can submit evidence. Payment escrow is optional."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleCreateEngagement(event)}>
            <div className="form-grid">
              <TextField label="Milestone title" name="title" maxLength={100} required wide />
              <TextField label="Scope and acceptance criteria" name="description" maxLength={500} textarea wide />
              <TextField label="ERC-20 token address (optional)" name="paymentToken" placeholder="0x…" wide />
              <TextField label="Token amount (optional)" name="paymentAmount" placeholder="100.00" wide />
            </div>
            <div className="form-note">
              HIREhub reads the token&apos;s decimals, checks your balance, and asks for an allowance first when needed. Leave both fields blank for a reputation-only agreement. Fee-on-transfer tokens are rejected.
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="button button-primary" disabled={wallet.isBusy}>
                <Handshake size={15} /> Create agreement
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "evidence" && selectedEngagement && (
        <Modal
          title="Submit delivery evidence"
          description="HIREhub stores the URI and its deterministic hash in the agreement."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleEvidence(event)}>
            <TextField
              label="Evidence URL or IPFS URI"
              name="evidenceUri"
              maxLength={256}
              placeholder="https://… or ipfs://…"
              required
              wide
            />
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="button button-primary" disabled={wallet.isBusy}>
                <FileCheck2 size={15} /> Submit proof
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "engagement-review" && selectedEngagement && (
        <Modal
          title={
            selectedEngagement.status === "disputed"
              ? "Settle disputed agreement"
              : "Review agreement delivery"
          }
          description={
            selectedEngagement.status === "disputed"
              ? "Settling a dispute approves the submitted evidence and releases any escrow to the contributor."
              : "Approve to finalize the attestation and release escrow, request a revision, or reject and refund."
          }
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleEngagementReview(event)}>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Decision</span>
                <select name="decision" defaultValue="approve">
                  <option value="approve">Approve and attest</option>
                  {selectedEngagement.status !== "disputed" && (
                    <>
                      <option value="revision">Request revision</option>
                      <option value="reject">Reject and refund</option>
                    </>
                  )}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Rating</span>
                <select name="rating" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>{rating} / 5</option>
                  ))}
                </select>
              </label>
              <TextField label="Public feedback" name="review" maxLength={500} textarea required wide />
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>Cancel</button>
              <button className="button button-primary" disabled={wallet.isBusy}>
                Sign decision
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "review" && reviewRecord && (
        <Modal
          title="Review delivered work"
          description="Your employer wallet signs this permanent attestation."
          onClose={() => {
            setModal(null);
            setReviewRecord(null);
          }}
        >
          <form onSubmit={(event) => void handleReview(event)}>
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Decision</span>
                <select name="decision" className="button" defaultValue="approve">
                  <option value="approve">Approve</option>
                  <option value="reject">Reject</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Rating</span>
                <select name="rating" className="button" defaultValue="5">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating} / 5
                    </option>
                  ))}
                </select>
              </label>
              <TextField label="Public review" name="review" maxLength={500} textarea wide />
            </div>
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button-primary" disabled={wallet.isBusy}>
                <Star size={15} /> Sign review
              </button>
            </div>
            {formError && <div className="form-error" role="alert">{formError}</div>}
          </form>
        </Modal>
      )}

      {wallet.transaction.status !== "idle" && (
        <div className="tx-toast" role="status">
          <span className="tx-icon">
            {["preparing", "signing", "confirming"].includes(wallet.transaction.status) ? (
              <LoaderCircle className="spin" size={18} />
            ) : wallet.transaction.status === "success" ? (
              <Check size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
          </span>
          <div>
            <strong>
              {wallet.transaction.status === "success"
                ? "Confirmed"
                : wallet.transaction.status === "error"
                  ? "Action failed"
                  : "Transaction in progress"}
            </strong>
            <span>{wallet.transaction.message}</span>
            {"hash" in wallet.transaction && wallet.transaction.hash && (
              <a
                href={`${VIA_BASE_URL}/tx/${wallet.transaction.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Via <ArrowUpRight size={11} />
              </a>
            )}
          </div>
          <button
            className="button button-quiet button-small"
            onClick={wallet.resetTransaction}
            aria-label="Dismiss transaction status"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

export function HireHubApp({ initialProfileId }: { initialProfileId?: bigint }) {
  return (
    <WalletProvider>
      <HireHubExperience initialProfileId={initialProfileId} />
    </WalletProvider>
  );
}
