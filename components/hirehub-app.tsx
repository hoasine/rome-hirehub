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
  Globe2,
  Link2,
  LoaderCircle,
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
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import { getAddress, isAddress } from "viem";
import { WalletProvider, useRomeWallet } from "./wallet-provider";
import { demoProfiles, demoWork } from "@/lib/demo-data";
import {
  encodeHireHubCall,
  loadProfileWork,
  loadProfiles,
} from "@/lib/contract";
import {
  HIREHUB_ADDRESS,
  VIA_BASE_URL,
  isPreviewMode,
  shortAddress,
} from "@/lib/config";
import type { Profile, WorkRecord } from "@/lib/types";

type ModalKind = "profile" | "work" | "link" | "accept" | "review" | null;

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ProfileAvatar({ profile, large = false }: { profile: Profile; large?: boolean }) {
  return (
    <div className={`avatar ${large ? "avatar-large" : ""}`}>
      {profile.avatarUrl ? (
        // User-supplied image URLs cannot use next/image without a fixed remote allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" />
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
            {kind === "evm" ? <Wallet size={12} /> : <Sparkles size={12} />}
            {kind === "evm" ? "EVM" : "Solana"}
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
        <a href={record.evidenceUrl} target="_blank" rel="noreferrer">
          View evidence <ExternalLink size={11} />
        </a>
        {canReview && record.status === "pending" && (
          <button className="button button-small" onClick={onReview}>
            Review work
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
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
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

function HireHubExperience() {
  const wallet = useRomeWallet();
  const [profiles, setProfiles] = useState<Profile[]>(isPreviewMode ? demoProfiles : []);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [work, setWork] = useState<WorkRecord[]>(isPreviewMode ? demoWork : []);
  const [reviewRecord, setReviewRecord] = useState<WorkRecord | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!isPreviewMode);
  const [notice, setNotice] = useState<string | null>(null);
  const [walletNotice, setWalletNotice] = useState<string | null>(null);
  const [connectingLane, setConnectingLane] = useState<"evm" | "solana" | null>(null);

  const refresh = useCallback(async () => {
    if (isPreviewMode) return;
    setLoading(true);
    try {
      const next = await loadProfiles();
      setProfiles(next);
      if (selected) {
        const nextSelected = next.find((profile) => profile.id === selected.id) ?? null;
        setSelected(nextSelected);
        if (nextSelected) setWork(await loadProfileWork(nextSelected.id));
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
        .then(setProfiles)
        .catch((error: unknown) =>
          setNotice(error instanceof Error ? error.message : "Could not read HireHub from Hadrian."),
        )
        .finally(() => setLoading(false));
    }
  }, []);

  const openProfile = useCallback(async (profile: Profile) => {
    setSelected(profile);
    if (isPreviewMode) {
      setWork(demoWork.filter((record) => record.profileId === profile.id));
      return;
    }
    setWork(await loadProfileWork(profile.id));
  }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return profiles;
    return profiles.filter(
      (profile) =>
        profile.displayName.toLowerCase().includes(term) ||
        profile.headline.toLowerCase().includes(term) ||
        profile.bio.toLowerCase().includes(term) ||
        profile.wallets.some((item) => item.address.toLowerCase().includes(term)),
    );
  }, [profiles, query]);

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

  const run = async (data: `0x${string}`, close = true) => {
    setNotice(null);
    try {
      await wallet.executeCall(data);
      if (close) setModal(null);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed.");
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run(
      encodeHireHubCall("createProfile", [
        data.get("displayName"),
        data.get("headline"),
        data.get("bio"),
        data.get("avatarUrl"),
      ]),
    );
  };

  const handleWork = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const employer = String(data.get("employer"));
    if (!isAddress(employer)) return setNotice("Enter a valid employer EVM address.");
    await run(
      encodeHireHubCall("submitWork", [
        selected.id,
        getAddress(employer),
        data.get("title"),
        data.get("description"),
        data.get("evidenceUrl"),
      ]),
    );
  };

  const handleLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const target = String(new FormData(event.currentTarget).get("wallet"));
    if (!isAddress(target)) return setNotice("Enter a valid EVM or synthetic address.");
    await run(encodeHireHubCall("proposeWallet", [selected.id, getAddress(target)]));
  };

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const profileId = BigInt(String(new FormData(event.currentTarget).get("profileId")));
    await run(encodeHireHubCall("acceptWalletLink", [profileId]));
  };

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewRecord) return;
    const data = new FormData(event.currentTarget);
    const approved = data.get("decision") === "approve";
    const rating = approved ? Number(data.get("rating")) : 0;
    await run(
      encodeHireHubCall("reviewWork", [
        reviewRecord.id,
        approved,
        rating,
        data.get("review"),
      ]),
    );
    setReviewRecord(null);
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
              >
                <Wallet size={14} /> <span>{shortAddress(wallet.evmAddress)}</span>
              </button>
            ) : (
              <button
                className="button button-small"
                type="button"
                disabled={connectingLane === "evm"}
                onClick={() => void connect("evm")}
              >
                <Wallet size={14} /> <span>{connectingLane === "evm" ? "Connecting…" : "MetaMask"}</span>
              </button>
            )}
            {wallet.syntheticAddress ? (
              <button
                className={`button button-small ${wallet.activeLane === "solana" ? "button-primary" : ""}`}
                onClick={() => wallet.selectLane("solana")}
                title={`Solana synthetic: ${wallet.syntheticAddress}`}
              >
                <Sparkles size={14} /> <span>{shortAddress(wallet.syntheticAddress)}</span>
              </button>
            ) : (
              <button
                className="button button-small"
                type="button"
                disabled={connectingLane === "solana"}
                onClick={() => void connect("solana")}
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
                <span className="dot" /> Live on Hadrian
              </span>
              <span>One identity layer · Two wallet ecosystems</span>
            </div>
            <h1>
              One reputation. <em>Both wallet worlds.</em>
            </h1>
            <p className="hero-copy">
              HIREhub turns shipped work and employer attestations into a shared
              contributor record for EVM and Solana wallets—one application, one state.
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
              <span><ShieldCheck size={15} /> Employer-signed</span>
              <span><Fingerprint size={15} /> Consent-linked</span>
              <span><Blocks size={15} /> Fully on-chain</span>
            </div>
          </div>
          <aside className="hero-note">
            <div className="hero-note-head">
              <span className="network-pill"><span className="dot" /> Network online</span>
              <Activity size={18} />
            </div>
            <strong>Your work, independently verifiable.</strong>
            <p>Every profile, wallet consent, delivery record, and employer review settles to one shared state.</p>
            <div className="network-stack">
              <div><span>Contract</span><strong>HireHub.sol</strong></div>
              <div><span>Network</span><strong>Hadrian · 200010</strong></div>
              <div><span>Wallet lanes</span><strong>MetaMask + Solflare</strong></div>
            </div>
          </aside>
        </section>

        <section className="shell network-stats" aria-label="HIREhub network statistics">
          <div><strong>{loading ? "—" : networkStats.profiles}</strong><span>contributors</span></div>
          <div><strong>{loading ? "—" : networkStats.wallets}</strong><span>verified wallets</span></div>
          <div><strong>{loading ? "—" : networkStats.records}</strong><span>work records</span></div>
          <div><strong>{loading ? "—" : networkStats.attestations}</strong><span>attestations</span></div>
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
            {wallet.activeAddress && (
              <button className="button" onClick={() => setModal("accept")}>
                Accept wallet link
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
              <h3>Turn delivery into proof</h3>
              <p>Submit evidence to an employer, who approves or rejects it and signs a public review.</p>
            </article>
          </div>
        </section>

        <section className="shell section architecture" id="built-on-rome">
          <div className="architecture-copy">
            <p className="eyebrow">Rome-native by design</p>
            <h2>One contract.<br /><em>No identity bridge.</em></h2>
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
              <strong>HireHub.sol</strong>
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
            One contract, EVM and Solana wallets ·{" "}
            <a href={HIREHUB_ADDRESS ? `${VIA_BASE_URL}/address/${HIREHUB_ADDRESS}` : VIA_BASE_URL}>
              View on Via
            </a>
          </span>
        </div>
      </footer>

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="drawer" aria-label={`${selected.displayName} profile`}>
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
                <button className="button" onClick={() => setModal("link")}>
                  <Link2 size={15} /> Link wallet
                </button>
              )}
            </div>

            <section className="subsection">
              <div className="subsection-head">
                <h3>Verified wallets</h3>
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
              {work.length ? (
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
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button-primary" disabled={!wallet.activeAddress}>
                Create on Hadrian
              </button>
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
              <button className="button button-primary">Submit record</button>
            </div>
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
            <div className="form-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button-primary">Propose link</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "accept" && (
        <Modal
          title="Accept a wallet link"
          description="Enter the profile ID that proposed your currently active wallet."
          onClose={() => setModal(null)}
        >
          <form onSubmit={(event) => void handleAccept(event)}>
            <TextField label="Profile ID" name="profileId" type="number" required wide />
            <div className="form-actions" style={{ marginTop: 18 }}>
              <button type="button" className="button" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="button button-primary">Accept link</button>
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
              <button className="button button-primary">
                <Star size={15} /> Sign review
              </button>
            </div>
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

export function HireHubApp() {
  return (
    <WalletProvider>
      <HireHubExperience />
    </WalletProvider>
  );
}
