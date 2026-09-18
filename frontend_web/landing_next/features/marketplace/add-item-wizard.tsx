'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ImagePlus,
  LockKeyhole,
  PackagePlus,
  ScanLine,
  ShieldCheck,
  Shirt,
  Store,
  Tag,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import { loginHref } from '@/shared/browser-session';
import { useSession } from '@/shared/session-provider';
import { marketplaceApi, type Blocker } from './api';
import styles from './add-item-wizard.module.css';

type PharmacyOption = { id: number; label: string; suburb: string; state: string };
type Category = {
  id: number;
  slug: string;
  name: string;
  description: string;
  context: string;
  permitted_modes: string[];
  maximum_buyer_roles: string[];
};
type ListingOptions = {
  can_trade_personally: boolean;
  can_trade_for_pharmacy: boolean;
  role_code: string | null;
  role_label: string | null;
  blockers: Blocker[];
  eligible_pharmacies: PharmacyOption[];
  role_guidance: string[];
  personal_categories: Category[];
  pharmacy_categories: Category[];
  ethical_entry_available: boolean;
};
type Context = 'PERSONAL' | 'PHARMACY';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Pharmacy owners',
  PHARMACIST: 'Pharmacists',
  INTERN: 'Intern pharmacists',
  TECHNICIAN: 'Dispensary technicians',
  ASSISTANT: 'Pharmacy assistants',
  STUDENT: 'Pharmacy students',
  EXPLORER: 'Explorers',
  CAREER_SWITCHER: 'Career explorers',
};

const STEP_TITLES = [
  'What are you listing?',
  'Listing mode',
  'Choose category',
  'Item details & photos',
  'Audience & visibility',
  'Location & delivery',
  'Privacy-safe preview',
  'Save draft or submit',
];

export default function AddItemWizard() {
  const session = useSession();
  const router = useRouter();

  const [options, setOptions] = useState<ListingOptions>();
  const [error, setError] = useState('');
  const [context, setContext] = useState<Context>();
  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState<number>();
  const [mode, setMode] = useState('SELL');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState('Used');
  const [quantity, setQuantity] = useState(1);
  const [brandModel, setBrandModel] = useState('');
  const [amount, setAmount] = useState('');
  const [desiredSwap, setDesiredSwap] = useState('');
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);

  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('QLD');
  const [postcode, setPostcode] = useState('');
  const [pickup, setPickup] = useState('');
  const [delivery, setDelivery] = useState('PICKUP');
  const [postagePayer, setPostagePayer] = useState('BUYER');
  const [postageOrganiser, setPostageOrganiser] = useState('SELLER');
  const [quoteRequired, setQuoteRequired] = useState(false);

  const [buyerRoles, setBuyerRoles] = useState<string[]>([]);
  const [pharmacyId, setPharmacyId] = useState<number>();
  const [maximumCircle, setMaximumCircle] = useState('PLATFORM');
  const [barcode, setBarcode] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const [created, setCreated] = useState<{ id: string; publication_status?: string }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session.status !== 'authenticated') return;
    marketplaceApi.getListingOptions()
      .then((next) => {
        setOptions(next);
        setPharmacyId(next.eligible_pharmacies[0]?.id);
      })
      .catch((reason) => setError((reason as Error).message));
  }, [session.status]);

  const categories = useMemo(
    () => (context === 'PHARMACY' ? options?.pharmacy_categories || [] : options?.personal_categories || []),
    [context, options]
  );
  const category = categories.find((row) => row.id === categoryId);

  useEffect(() => {
    if (!category) return;
    setBuyerRoles(context === 'PHARMACY' ? ['OWNER'] : [...category.maximum_buyer_roles]);
    if (!category.permitted_modes.includes(mode)) setMode(category.permitted_modes[0] || 'SELL');
  }, [categoryId, context]);

  function handlePhotoAdd(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files).slice(0, 6 - photos.length);
    const newItems = incoming.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newItems].slice(0, 6));
  }

  function handlePhotoRemove(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function lookup() {
    if (!barcode.trim()) return;
    setLookupMessage('Looking up barcode…');
    try {
      const data = await marketplaceApi.lookupCatalogue({ barcode: barcode.trim() });
      const product = data.results?.[0];
      if (!product) {
        setLookupMessage('No reviewed ordinary product matched. Enter it manually.');
        return;
      }
      setTitle(product.name);
      if (product.description) setDescription(product.description);
      const matched = categories.find((row) => row.slug === product.category?.slug);
      if (matched) setCategoryId(matched.id);
      setLookupMessage('Product details added from the reviewed catalogue.');
    } catch (reason) {
      setLookupMessage((reason as Error).message);
    }
  }

  async function handleComplete(submitForReview: boolean) {
    if (!context || !category) return;
    setBusy(true);
    setError('');
    try {
      const listing = await marketplaceApi.createListing({
        seller_context: context,
        pharmacy: context === 'PHARMACY' ? pharmacyId : null,
        category: category.id,
        mode,
        title,
        description: brandModel ? `${description}\n\nBrand/Model: ${brandModel}` : description,
        attributes: { barcode: barcode || undefined, brand_model: brandModel || undefined },
        condition,
        quantity,
        unit: 'item',
        amount: mode === 'SELL' ? amount : '0',
        desired_swap: mode === 'SWAP' ? desiredSwap : '',
        suburb,
        state,
        postcode,
        private_pickup_details: pickup,
        allowed_buyer_roles: buyerRoles,
        delivery: {
          method: delivery,
          postage_payer: delivery === 'PICKUP' ? '' : postagePayer,
          postage_organiser: delivery === 'PICKUP' ? '' : postageOrganiser,
          quote_required: quoteRequired,
        },
      } as Parameters<typeof marketplaceApi.createListing>[0]);

      if (context === 'PHARMACY') {
        await marketplaceApi.updateAudience(listing.id, {
          expected_version: listing.version,
          current_circle: 'OWNED_CHAIN',
          maximum_circle: maximumCircle,
          schedule: [],
        });
      }

      // Upload selected photos
      for (const item of photos) {
        const formData = new FormData();
        formData.append('image', item.file);
        try {
          await marketplaceApi.uploadImage(listing.id, formData);
        } catch {
          // Continue uploading remaining photos even if one fails
        }
      }

      // Submit for review / publication if chosen
      let finalStatus = 'DRAFT';
      if (submitForReview) {
        try {
          const res = await marketplaceApi.actOnListing(listing.id, 'submit', listing.version);
          finalStatus = res.publication_status || 'PENDING_REVIEW';
        } catch (subErr) {
          setError(`Listing created as draft, but submit failed: ${(subErr as Error).message}`);
        }
      }

      setCreated({ id: listing.id, publication_status: finalStatus });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (session.status === 'loading' || (!options && session.status === 'authenticated')) {
    return (
      <main className="market-workspace">
        <div className="container workspace-loading">Preparing your marketplace listing options…</div>
      </main>
    );
  }

  if (session.status === 'anonymous') {
    return (
      <main className="market-workspace">
        <div className="container">
          <section className="workspace-panel">
            <PackagePlus />
            <h1>Sign in to add an item</h1>
            <p>We will return you to this pathway after sign-in.</p>
            <a className="button primary" href={loginHref('/marketplace/new')}>
              Sign in to list
            </a>
          </section>
        </div>
      </main>
    );
  }

  if (!options) {
    return (
      <main className="market-workspace">
        <div className="container">
          <section className="workspace-panel">
            <h1>Marketplace unavailable</h1>
            <p>{error || 'Unable to load listing options.'}</p>
          </section>
        </div>
      </main>
    );
  }

  if (options.blockers.length) {
    return (
      <main className="market-workspace">
        <div className="container">
          <Header step={1} />
          <section className="workspace-panel">
            <LockKeyhole />
            <h2>Complete these steps before listing</h2>
            <ul>
              {options.blockers.map((row) => (
                <li key={row.code}>{row.message || row.detail}</li>
              ))}
            </ul>
            <Link className="button secondary" href="/dashboard">
              Open dashboard
            </Link>
          </section>
        </div>
      </main>
    );
  }

  if (created) {
    const isSubmitted = created.publication_status && created.publication_status !== 'DRAFT';
    return (
      <main className="market-workspace">
        <div className="container">
          <section className="workspace-panel workspace-empty">
            <CheckCircle2 />
            <h1>{isSubmitted ? 'Listing submitted' : 'Draft created'}</h1>
            <p>
              {isSubmitted
                ? 'Your item has been submitted for moderation and publication.'
                : 'Your draft has been saved. It remains private until submitted.'}
            </p>
            <div className={styles.actions}>
              <Link className="button primary" href="/marketplace/mine">
                Open my listings
              </Link>
              <button
                className="button secondary"
                onClick={() => {
                  setCreated(undefined);
                  setContext(undefined);
                  setStep(1);
                  setCategoryId(undefined);
                  setPhotos([]);
                  setTitle('');
                  setDescription('');
                }}
              >
                Add another item
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="market-workspace">
      <div className="container">
        <Header step={step} />

        {/* Step 1: Seller Context */}
        {step === 1 && (
          <section className={styles.contextGrid}>
            {options.can_trade_personally && (
              <button
                className={styles.contextCard}
                onClick={() => {
                  setContext('PERSONAL');
                  setStep(2);
                }}
              >
                <UserRound />
                <strong>Personal item</strong>
                <span>Something you personally own, within categories available for your verified role.</span>
              </button>
            )}
            {options.can_trade_for_pharmacy && (
              <button
                className={styles.contextCard}
                onClick={() => {
                  setContext('PHARMACY');
                  setStep(2);
                }}
              >
                <Store />
                <strong>Pharmacy-owned item</strong>
                <span>Fixtures, furniture and approved ordinary stock owned by a pharmacy you currently own.</span>
              </button>
            )}
            {options.ethical_entry_available && (
              <button
                className={`${styles.contextCard} ${styles.ethical}`}
                onClick={() => router.push('/marketplace/ethical/listings/new')}
              >
                <LockKeyhole />
                <strong>Medicine / ethical stock</strong>
                <span>Private only. Pharmacy approval and exact owner/admin authority are checked.</span>
              </button>
            )}
            <aside className={styles.guidance}>
              <h2>For {options.role_label || 'your role'}</h2>
              <ul>
                {options.role_guidance.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </section>
        )}

        {/* Step 2: Mode (Sell, Swap, Free) */}
        {step === 2 && context && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(1)} />
            <h2>How would you like to list this item?</h2>
            <p>Choose whether to sell at a set price, propose an exchange, or give it away freely.</p>
            <div className={styles.modeGrid}>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'SELL' ? styles.selected : ''}`}
                onClick={() => setMode('SELL')}
              >
                <Tag />
                <strong>Sell</strong>
                <span>Set an asking price in AUD</span>
              </button>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'SWAP' ? styles.selected : ''}`}
                onClick={() => setMode('SWAP')}
              >
                <Store />
                <strong>Swap</strong>
                <span>Exchange for other equipment or study gear</span>
              </button>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'FREE' ? styles.selected : ''}`}
                onClick={() => setMode('FREE')}
              >
                <CheckCircle2 />
                <strong>Free</strong>
                <span>Pass it forward to a colleague at no cost</span>
              </button>
            </div>
            <div className={styles.actions}>
              <button className="button primary" onClick={() => setStep(3)}>
                Continue to Category <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Category Selection */}
        {step === 3 && context && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(2)} />
            <h2>Choose the appropriate category</h2>
            <p>Only categories approved for your verified role and seller context are shown.</p>
            <div className={styles.categoryGrid}>
              {categories.map((row) => (
                <button
                  key={row.id}
                  className={`${styles.categoryCard} ${categoryId === row.id ? styles.selected : ''}`}
                  onClick={() => setCategoryId(row.id)}
                >
                  {row.slug.includes('workwear') ? (
                    <Shirt />
                  ) : row.slug.includes('fixtures') || row.slug.includes('stock') ? (
                    <Building2 />
                  ) : (
                    <BookOpen />
                  )}
                  <strong>{row.name}</strong>
                  <span>{row.description}</span>
                </button>
              ))}
            </div>
            {context === 'PHARMACY' && (
              <label className={styles.field}>
                <span>Listing pharmacy</span>
                <select value={pharmacyId || ''} onChange={(e) => setPharmacyId(Number(e.target.value))}>
                  {options.eligible_pharmacies.map((row) => (
                    <option value={row.id} key={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className={styles.actions}>
              <button className="button primary" disabled={!categoryId} onClick={() => setStep(4)}>
                Continue to Details <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* Step 4: Item Details & Photos */}
        {step === 4 && context && category && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(3)} />
            <h2>Item details & photos</h2>

            <div className={styles.lookup}>
              <label>
                <span>Barcode lookup (optional)</span>
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or enter barcode"
                />
              </label>
              <button className="button secondary" type="button" onClick={() => void lookup()}>
                <ScanLine size={16} /> Lookup
              </button>
              {lookupMessage && <p>{lookupMessage}</p>}
            </div>

            <div className={styles.formGrid}>
              <label>
                <span>Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. AMH 2024 Reference Guide"
                  required
                />
              </label>
              <label>
                <span>Condition</span>
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="New">Brand new / unused</option>
                  <option value="Like new">Like new</option>
                  <option value="Good">Good condition</option>
                  <option value="Used">Used / functional</option>
                </select>
              </label>
              <label>
                <span>Quantity</span>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  required
                />
              </label>
              <label>
                <span>Brand / Model (optional)</span>
                <input
                  value={brandModel}
                  onChange={(e) => setBrandModel(e.target.value)}
                  placeholder="e.g. Casio fx-82AU"
                />
              </label>
              {mode === 'SELL' && (
                <label>
                  <span>Price AUD ($)</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    required
                  />
                </label>
              )}
              {mode === 'SWAP' && (
                <label className={styles.full}>
                  <span>Requested swap item</span>
                  <input
                    value={desiredSwap}
                    onChange={(e) => setDesiredSwap(e.target.value)}
                    placeholder="What would you like in exchange?"
                    required
                  />
                </label>
              )}
              <label className={styles.full}>
                <span>Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe condition, edition, markings, or included accessories..."
                  required
                />
              </label>
            </div>

            {/* Photo Upload Section */}
            <div className={styles.photoSection}>
              <div className={styles.photoSectionHeader}>
                <span>Photos ({photos.length}/6)</span>
                {photos.length < 6 && (
                  <label className="button secondary small" style={{ cursor: 'pointer' }}>
                    <ImagePlus size={15} /> Choose photos
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => handlePhotoAdd(e.target.files)}
                    />
                  </label>
                )}
              </div>
              {photos.length > 0 ? (
                <div className={styles.photoThumbnails}>
                  {photos.map((item, idx) => (
                    <div key={idx} className={styles.photoThumb}>
                      <img src={item.url} alt={`Upload ${idx + 1}`} />
                      <button
                        type="button"
                        className={styles.photoRemove}
                        onClick={() => handlePhotoRemove(idx)}
                        aria-label="Remove photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--body)' }}>
                  Adding clear photos helps items trade faster. Upload up to 6 images.
                </p>
              )}
            </div>

            <div className={styles.actions}>
              <button
                className="button primary"
                disabled={
                  !title.trim() ||
                  !description.trim() ||
                  (mode === 'SELL' && !Number(amount)) ||
                  (mode === 'SWAP' && !desiredSwap.trim())
                }
                onClick={() => setStep(5)}
              >
                Continue to Audience <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Audience & Visibility */}
        {step === 5 && context && category && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(4)} />
            <h2>Audience & responders</h2>

            {context === 'PERSONAL' ? (
              <>
                <p>Select which verified pharmacy roles are eligible to view and respond to this listing.</p>
                <div className={styles.roleChecks}>
                  {category.maximum_buyer_roles.map((role) => (
                    <label key={role}>
                      <input
                        type="checkbox"
                        checked={buyerRoles.includes(role)}
                        onChange={(e) =>
                          setBuyerRoles((current) =>
                            e.target.checked
                              ? [...new Set([...current, role])]
                              : current.filter((v) => v !== role)
                          )
                        }
                      />
                      <span>{ROLE_LABELS[role] || role}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.audience}>
                <h3>Owner-network escalation</h3>
                <p>
                  Pharmacy listings begin safely at your <strong>Owned Chain</strong>. Select the furthest network circle
                  it may later escalate to.
                </p>
                <label>
                  <span>Maximum audience ceiling</span>
                  <select value={maximumCircle} onChange={(e) => setMaximumCircle(e.target.value)}>
                    <option value="OWNED_CHAIN">Owned chain only</option>
                    <option value="ORGANISATION">Organisation owners</option>
                    <option value="PLATFORM">All eligible ChemistTasker pharmacy owners</option>
                  </select>
                </label>
              </div>
            )}

            <div className={styles.actions}>
              <button
                className="button primary"
                disabled={!buyerRoles.length && context === 'PERSONAL'}
                onClick={() => setStep(6)}
              >
                Continue to Delivery <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* Step 6: Location & Delivery */}
        {step === 6 && context && category && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(5)} />
            <h2>Location & delivery terms</h2>
            <div className={styles.formGrid}>
              <label>
                <span>Suburb</span>
                <input
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  placeholder="e.g. Brisbane"
                  required
                />
              </label>
              <label>
                <span>State</span>
                <select value={state} onChange={(e) => setState(e.target.value)}>
                  <option value="QLD">Queensland (QLD)</option>
                  <option value="NSW">New South Wales (NSW)</option>
                  <option value="VIC">Victoria (VIC)</option>
                  <option value="WA">Western Australia (WA)</option>
                  <option value="SA">South Australia (SA)</option>
                  <option value="TAS">Tasmania (TAS)</option>
                  <option value="ACT">Australian Capital Territory (ACT)</option>
                  <option value="NT">Northern Territory (NT)</option>
                </select>
              </label>
              <label>
                <span>Postcode</span>
                <input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="e.g. 4000"
                />
              </label>
              <label>
                <span>Delivery method</span>
                <select value={delivery} onChange={(e) => setDelivery(e.target.value)}>
                  <option value="PICKUP">Pickup only</option>
                  <option value="POSTAGE">Postage only</option>
                  <option value="BOTH">Pickup or postage</option>
                </select>
              </label>

              {delivery !== 'PICKUP' && (
                <>
                  <label>
                    <span>Who pays postage?</span>
                    <select value={postagePayer} onChange={(e) => setPostagePayer(e.target.value)}>
                      <option value="BUYER">Buyer pays</option>
                      <option value="SELLER">Seller pays (included)</option>
                    </select>
                  </label>
                  <label>
                    <span>Who organises postage?</span>
                    <select value={postageOrganiser} onChange={(e) => setPostageOrganiser(e.target.value)}>
                      <option value="SELLER">Seller organises dispatch</option>
                      <option value="BUYER">Buyer provides shipping label</option>
                    </select>
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={quoteRequired}
                      onChange={(e) => setQuoteRequired(e.target.checked)}
                    />
                    <span>Postage quote required prior to agreement</span>
                  </label>
                </>
              )}

              <label className={styles.full}>
                <span>Private pickup instructions (hidden until agreed)</span>
                <textarea
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Specific room, collection times or access instructions..."
                />
              </label>
            </div>

            <div className={styles.actions}>
              <button
                className="button primary"
                disabled={!suburb.trim() || !state.trim()}
                onClick={() => setStep(7)}
              >
                Review Listing <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* Step 7: Privacy-Safe Preview */}
        {step === 7 && context && category && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(6)} />
            <h2>Privacy-safe listing preview</h2>
            <p>This is what eligible members will see in the catalogue. Your private address is never exposed.</p>

            <div className={styles.preview}>
              <span className={styles.previewCategory}>
                {context === 'PHARMACY' ? 'Pharmacy-owned asset' : 'Personal item'} · {mode}
              </span>
              <h3>{title}</h3>
              <p className={styles.previewDescription}>{description}</p>

              {photos.length > 0 && (
                <div className={styles.photoThumbnails} style={{ marginBottom: 18 }}>
                  {photos.map((item, idx) => (
                    <div key={idx} className={styles.photoThumb} style={{ width: 84, height: 84 }}>
                      <img src={item.url} alt={`Preview ${idx + 1}`} />
                    </div>
                  ))}
                </div>
              )}

              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>{category.name}</dd>
                </div>
                <div>
                  <dt>Condition & Quantity</dt>
                  <dd>
                    {condition} · {quantity} unit{quantity > 1 ? 's' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Mode & Value</dt>
                  <dd>
                    {mode === 'SELL' ? `$${parseFloat(amount || '0').toFixed(2)} AUD` : mode === 'SWAP' ? desiredSwap : 'Free'}
                  </dd>
                </div>
                <div>
                  <dt>Public Location</dt>
                  <dd>
                    {suburb}, {state}
                  </dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>{delivery === 'PICKUP' ? 'Local pickup' : delivery === 'POSTAGE' ? 'Postage' : 'Pickup or postage'}</dd>
                </div>
                <div>
                  <dt>Eligible Responders</dt>
                  <dd>{buyerRoles.map((role) => ROLE_LABELS[role] || role).join(', ')}</dd>
                </div>
              </dl>

              <div className={styles.privacyNotice}>
                <ShieldCheck size={20} />
                <span>
                  <strong>Privacy Protected:</strong> Your private pickup details and personal identity are withheld from
                  the public catalogue and only shared once an exchange is mutually confirmed.
                </span>
              </div>
            </div>

            <div className={styles.actions}>
              <button className="button primary" onClick={() => setStep(8)}>
                Proceed to Submit <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* Step 8: Save Draft / Submit */}
        {step === 8 && context && category && (
          <section className="workspace-panel">
            <Back onClick={() => setStep(7)} />
            <h2>Ready to finalize</h2>
            <p>You can save this listing as a private draft to edit later, or submit it for review and publication.</p>

            {error && (
              <p className="workspace-alert" role="alert">
                {error}
              </p>
            )}

            <div className={styles.actions}>
              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => void handleComplete(false)}
              >
                {busy ? 'Saving...' : 'Save as private draft'}
              </button>
              <button
                className="button primary"
                type="button"
                disabled={busy}
                onClick={() => void handleComplete(true)}
              >
                <PackagePlus size={16} />
                {busy ? 'Submitting...' : 'Submit for review'}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Header({ step }: { step: number }) {
  return (
    <header className={styles.header}>
      <p>ADD TO MARKETPLACE</p>
      <h1>{STEP_TITLES[step - 1] || 'Create listing'}</h1>
      <div className={styles.stepper}>
        {STEP_TITLES.map((title, idx) => {
          const stepNum = idx + 1;
          const isActive = step === stepNum;
          const isComplete = step > stepNum;
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                className={`${styles.stepDot} ${
                  isActive ? styles.stepDotActive : isComplete ? styles.stepDotComplete : ''
                }`}
              >
                <span
                  className={`${styles.stepBadge} ${
                    isActive ? styles.stepBadgeActive : isComplete ? styles.stepBadgeComplete : ''
                  }`}
                >
                  {isComplete ? '✓' : stepNum}
                </span>
                <span className="desktop-break">{title}</span>
              </div>
              {idx < STEP_TITLES.length - 1 && <div className={styles.stepLine} />}
            </div>
          );
        })}
      </div>
    </header>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button className={styles.back} type="button" onClick={onClick}>
      <ArrowLeft size={16} /> Back
    </button>
  );
}
