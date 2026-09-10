/**
 * THE DESIGN MODE PANEL.
 *
 * Opened by `?design=1` and by nothing else. Read `src/design/designMode.ts` first: it carries
 * the decision that this ships rather than being dead-stripped, and the argument for why that is
 * safe.
 *
 * WHAT IT WRITES, exhaustively:
 *   - inline CSS custom properties on `document.documentElement`, which are per tab and per
 *     device and reach no other viewer;
 *   - `document.documentElement.dataset.skin`, to preview a skin;
 *   - one namespaced `localStorage` key of its own (src/design/designStorage.ts).
 *
 * WHAT IT NEVER WRITES: the Zustand document, and any profile. It READS `ui.skin` through
 * `useSkin()` so it can start on the skin the app is actually in, and that is the whole of its
 * relationship with the store. `DesignPanel.test.tsx` asserts the store object is IDENTICAL -
 * the same reference, which is what a Zustand `set` would replace - after opening, editing,
 * previewing another skin, exporting, resetting and closing.
 *
 * THE SKIN SWITCHER IS A TOKEN PREVIEW, not a skin change, and the panel says so on its face.
 * It flips `<html data-skin>`, which is what the two attribute-scoped blocks in tokens.css key
 * on, so every colour, face and geometry re-renders in that skin. Component-level skin branches
 * - the marquee, the limelight icons - still follow `ui.skin`, because changing that would mean
 * writing to the store. Judging a COLOUR, which is what the switcher is for, needs the tokens.
 *
 * ITS LABELS ARE NOT APP COPY. Deliberately not in `src/content/copy.ts`, with no catalogue part
 * and no walk step. See designMode.ts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { SKIN_IDS, useSkin } from '../skins/skinContext';
import type { SkinId } from '../domain/types';
import { formatRatio, parseColour, toHex } from './colour';
import { readAllPairs } from './contrastPairs';
import { CopyEditLayer } from './CopyEditLayer';
import {
  TABLE_FILE,
  blockedReason,
  describeTarget,
  renderedRow,
  tableIdForSkin,
  tableRow,
  validateCopyEdit,
} from './copyEdits';
import { buildPatch, patchSize } from './designPatch';
import { clearStoredEdits, readStoredEdits, writeStoredEdits } from './designStorage';
import type { StoredEdits } from './designStorage';
import { describeFontStack } from './fontCheck';
import { groupedTokens, isColourToken, resolveValue, shippedValues } from './tokenSheet';
import type { TokenDecl } from './tokenSheet';
import './design.css';

/** An empty edit set. Also what RESET restores. */
const NO_EDITS: StoredEdits = { version: 1, tokens: {}, copy: {} };

/** The tokens whose value is a font stack, which get the availability reading. */
const FONT_TOKENS = new Set(['--mono', '--sans', '--disp', '--chrome']);

/** The effective value map for one skin: the sheet, overlaid with this session's edits. */
function effectiveValues(skin: SkinId, edits: StoredEdits): ReadonlyMap<string, string> {
  const map = new Map(shippedValues(skin));
  for (const [name, value] of Object.entries(edits.tokens[skin] ?? {})) map.set(name, value);
  return map;
}

interface TokenRowProps {
  readonly decl: TokenDecl;
  readonly skin: SkinId;
  readonly edited: string | undefined;
  readonly resolved: string | undefined;
  readonly onChange: (name: string, value: string) => void;
  readonly onReset: (name: string) => void;
}

/**
 * One declaration's controls.
 *
 * A colour token gets BOTH a colour input and a text input. The colour input cannot express
 * `rgba(...)` or `var(--x)`, and the sheet is full of both; the text input is the real control
 * and the swatch is the fast one. A non-colour token gets the text input alone.
 */
function TokenRow({
  decl,
  skin,
  edited,
  resolved,
  onChange,
  onReset,
}: TokenRowProps): ReactElement {
  const value = edited ?? decl.value;
  const changed = edited !== undefined && edited.trim() !== decl.value.trim();
  /*
   * WHETHER a colour input is offered comes from the SHIPPED value; WHAT it shows comes from the
   * live one. Deciding presence from the live value would make the swatch vanish and reappear
   * while the owner is halfway through typing `rgba(2`, which reads as the tool breaking. An
   * unparseable value in progress falls back to black rather than removing the control.
   */
  const isColour = isColourToken(decl.name, skin);
  const rgb = resolved === undefined ? null : parseColour(resolved);

  return (
    <div className="dm-token" data-testid={`dm-token-${decl.name}`}>
      <span className="dm-token-name">
        {changed ? <mark>{decl.name}</mark> : decl.name}
        {resolved !== undefined && resolved !== value ? ` (resolves to ${resolved})` : ''}
      </span>
      {!isColour ? null : (
        <input
          type="color"
          aria-label={`${decl.name} Swatch`}
          value={rgb === null ? '#000000' : toHex(rgb)}
          onChange={(event) => {
            onChange(decl.name, event.currentTarget.value);
          }}
        />
      )}
      <input
        type="text"
        aria-label={decl.name}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          onChange(decl.name, event.currentTarget.value);
        }}
      />
      {changed ? (
        <button
          type="button"
          onClick={() => {
            onReset(decl.name);
          }}
        >
          Undo
        </button>
      ) : null}
      {FONT_TOKENS.has(decl.name) ? (
        <span className="dm-note">{describeFontStack(resolved ?? value)}</span>
      ) : null}
      {FONT_TOKENS.has(decl.name) ? (
        <span className="dm-note">
          A new web face cannot be typed here. tokens.css line 318 records the constraint:
          font-src &apos;self&apos;, self-hosted through @fontsource, no external font host. Adding
          one is a dependency and an import in src/main.tsx.
        </span>
      ) : null}
      <span className="dm-note">Shipped: {decl.value}</span>
      {skin === 'clinical' ? (
        <span className="dm-note">
          The bare :root block. Every skin inherits a token it does not restate.
        </span>
      ) : null}
    </div>
  );
}

/** The WCAG readout for the previewed skin. */
function ContrastReadout({
  values,
  root,
}: {
  readonly values: ReadonlyMap<string, string>;
  readonly root: ReadonlyMap<string, string>;
}): ReactElement {
  const readings = readAllPairs(values, root).filter((reading) => reading.ratio !== null);
  return (
    <div className="dm-rows" data-testid="dm-contrast">
      <p className="dm-note">
        WCAG 2.1 relative luminance. 4.5:1 is SC 1.4.3 for body text. 3:1 is SC 1.4.11 for
        anything else that has to be seen, and SC 1.4.3&apos;s large-text floor. A translucent
        colour is composited over what it sits on before the ratio is taken.
      </p>
      {readings.map((reading) => (
        <div className="dm-row" key={reading.pair.label} data-testid={`dm-pair-${reading.pair.fg}-on-${reading.pair.bg}`}>
          <span className="dm-row-label">{reading.pair.label}</span>
          <span className="dm-ratio">{formatRatio(reading.ratio ?? 0)}</span>
          <span className="dm-verdict" data-pass={String(reading.passes)}>
            {reading.passes === true ? 'PASS' : 'FAIL'} against {reading.threshold}:1
          </span>
          {reading.pair.note === undefined ? null : (
            <span className="dm-note">{reading.pair.note}</span>
          )}
        </div>
      ))}
    </div>
  );
}

interface CopySectionProps {
  /** The skin whose WORDS are on screen: `ui.skin`, never the token preview. */
  readonly skin: SkinId;
  readonly previewSkin: SkinId;
  readonly discovered: readonly string[];
  readonly edits: Readonly<Record<string, string>>;
  readonly onChange: (key: string, value: string) => void;
  readonly onUndo: (key: string) => void;
}

/**
 * The copy half of the panel.
 *
 * IT STATES THE TARGET TABLE BEFORE HE TYPES, rather than leaving it to be inferred from which
 * skin's colours happen to be previewed. That is the trap Task 2 exists to avoid: limelight is
 * deliberately lower case and the board deliberately upper, and scripts/check-title-case.mjs
 * skips both, so a misrouted edit would destroy a recorded design decision with nothing to catch
 * it at merge.
 *
 * IT ALSO CARRIES THE KEYS THE PAGE CANNOT MAKE EDITABLE IN PLACE: a string a FORMAT frame
 * substituted a number into, and a key rendered as part of a longer sentence. Editing the ROW is
 * always possible even where editing the rendered words is not, so nothing on screen is beyond
 * reach; it is reached through a field instead of through the page.
 */
function CopySection({
  skin,
  previewSkin,
  discovered,
  edits,
  onChange,
  onUndo,
}: CopySectionProps): ReactElement {
  const editedKeys = Object.keys(edits).sort();
  const rows = [...new Set([...editedKeys, ...discovered])].sort();

  return (
    <div className="dm-rows" data-testid="dm-copy">
      <p className="dm-note" data-testid="dm-copy-target">
        {describeTarget(skin)}
      </p>
      {previewSkin === skin ? null : (
        <p className="dm-note" data-testid="dm-copy-preview-warning">
          The token preview above is set to {previewSkin}, and that changes COLOURS only. The words
          on this page are still {skin}&apos;s, so an edit lands in{' '}
          {TABLE_FILE[tableIdForSkin(skin)]}. To edit {previewSkin}&apos;s words, set the app to
          that skin in Settings.
        </p>
      )}
      <p className="dm-note">
        Only copy.ts and the two skin tables are editable. The reference modules, which carry
        citations and doses, are not marked and never will be.
      </p>
      {rows.length === 0 ? (
        <p className="dm-note" data-testid="dm-copy-empty">
          No copy key has rendered yet on this screen. Close the panel, move to a screen with
          words on it, and they will appear here.
        </p>
      ) : null}
      {rows.map((key) => {
        const blocked = blockedReason(skin, key);
        const row = tableRow(skin, key);
        const value = edits[key] ?? row ?? renderedRow(skin, key) ?? '';
        const changed = row !== undefined && edits[key] !== undefined && edits[key] !== row;
        const violations = validateCopyEdit(skin, key, value);
        return (
          <div className="dm-token" key={key} data-testid={`dm-copy-${key}`}>
            <span className="dm-token-name">{changed ? <mark>{key}</mark> : key}</span>
            {blocked === null ? (
              <input
                type="text"
                aria-label={key}
                value={value}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => {
                  onChange(key, event.currentTarget.value);
                }}
              />
            ) : (
              <span className="dm-note" data-testid={`dm-copy-blocked-${key}`}>
                {blocked.message}
              </span>
            )}
            {changed ? (
              <button
                type="button"
                onClick={() => {
                  onUndo(key);
                }}
              >
                Undo
              </button>
            ) : null}
            {violations.map((violation) => (
              <span
                key={`${violation.rule}${violation.message}`}
                className="dm-copy-violation"
                data-severity={violation.severity}
                data-testid={`dm-copy-rule-${key}-${violation.rule}`}
              >
                {violation.message}
              </span>
            ))}
            {row === undefined ? null : <span className="dm-note">Shipped: {row}</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The panel itself. Mounted only behind `?design=1`, so every hook and listener below exists
 * only in a session that asked for the tool.
 */
export function DesignPanel(): ReactElement {
  const storeSkin = useSkin();
  const [open, setOpen] = useState(true);
  const [previewSkin, setPreviewSkin] = useState<SkinId>(storeSkin);
  const [edits, setEdits] = useState<StoredEdits>(() => readStoredEdits());
  const [exportText, setExportText] = useState<string>('');
  const [storageFailed, setStorageFailed] = useState(false);
  /** The copy keys the layer has seen render on this screen. Stable identity per pass. */
  const [discovered, setDiscovered] = useState<readonly string[]>([]);
  const exportRef = useRef<HTMLTextAreaElement | null>(null);
  const storeSkinRef = useRef<SkinId>(storeSkin);

  /*
   * The preview FOLLOWS the app's own skin whenever that changes, rather than fighting it. The
   * app mirrors `ui.skin` onto <html data-skin> from an effect in App.tsx, and effects run
   * child-before-parent: a preview that disagreed with the store would be overwritten by the
   * parent's effect on the next store change, and the panel would then be showing a skin
   * selector that no longer matched the page. Following it makes the two agree by construction.
   */
  useEffect(() => {
    storeSkinRef.current = storeSkin;
    setPreviewSkin(storeSkin);
  }, [storeSkin]);

  /* Restores the app's own skin when the panel unmounts, whatever was being previewed. */
  useEffect(() => {
    const root = document.documentElement;
    return () => {
      root.dataset.skin = storeSkinRef.current;
    };
  }, []);

  /* The preview itself: one attribute write, which is what the token blocks key on. */
  useEffect(() => {
    document.documentElement.dataset.skin = previewSkin;
  }, [previewSkin]);

  /*
   * The edits, as inline custom properties on <html>. An inline property outranks any rule, so
   * an override applies whichever skin block is active; the cleanup removes exactly the ones
   * this run set, so switching skin drops the previous skin's overrides rather than stacking
   * them.
   */
  useEffect(() => {
    const root = document.documentElement;
    const entries = Object.entries(edits.tokens[previewSkin] ?? {});
    for (const [name, value] of entries) root.style.setProperty(name, value);
    return () => {
      for (const [name] of entries) root.style.removeProperty(name);
    };
  }, [edits, previewSkin]);

  /* Persistence, so a reload does not lose an afternoon. A refusal is reported, not swallowed. */
  useEffect(() => {
    setStorageFailed(!writeStoredEdits(edits));
  }, [edits]);

  const setToken = useCallback(
    (name: string, value: string) => {
      setEdits((previous) => ({
        ...previous,
        version: 1,
        tokens: {
          ...previous.tokens,
          [previewSkin]: { ...(previous.tokens[previewSkin] ?? {}), [name]: value },
        },
      }));
    },
    [previewSkin],
  );

  const undoToken = useCallback(
    (name: string) => {
      setEdits((previous) => {
        const skinEdits = { ...(previous.tokens[previewSkin] ?? {}) };
        delete skinEdits[name];
        return { ...previous, version: 1, tokens: { ...previous.tokens, [previewSkin]: skinEdits } };
      });
    },
    [previewSkin],
  );

  /*
   * A COPY EDIT IS FILED UNDER `storeSkin`, NOT `previewSkin`, AND THE DIFFERENCE IS THE WHOLE
   * POINT. The switcher above previews TOKENS: it flips `<html data-skin>` and does not write
   * `ui.skin`. The WORDS on screen never move with it, because `useCopy()` reads the store. So an
   * edit typed while the board's colours are previewed and the app is set to clinical is an edit
   * to a CLINICAL sentence, and belongs in `DEFAULT_COPY`. src/design/copyEdits.ts states the
   * rule in full; the note under the Copy section states it to the owner before he types.
   */
  const setCopy = useCallback(
    (key: string, value: string) => {
      setEdits((previous) => {
        const row = tableRow(storeSkin, key);
        const rows = { ...(previous.copy[storeSkin] ?? {}) };
        // Typing the shipped words back is not an edit. Dropping it keeps the patch reviewable.
        if (row === undefined || value === row || value === '') delete rows[key];
        else rows[key] = value;
        return { ...previous, version: 1, copy: { ...previous.copy, [storeSkin]: rows } };
      });
    },
    [storeSkin],
  );

  const undoCopy = useCallback(
    (key: string) => {
      setEdits((previous) => {
        const rows = { ...(previous.copy[storeSkin] ?? {}) };
        delete rows[key];
        return { ...previous, version: 1, copy: { ...previous.copy, [storeSkin]: rows } };
      });
    },
    [storeSkin],
  );

  const resetAll = useCallback(() => {
    clearStoredEdits();
    setEdits(NO_EDITS);
    setExportText('');
  }, []);

  const values = useMemo(() => effectiveValues(previewSkin, edits), [previewSkin, edits]);
  const root = useMemo(() => effectiveValues('clinical', edits), [edits]);
  const groups = useMemo(() => groupedTokens(previewSkin), [previewSkin]);

  const exportPatch = useCallback(() => {
    const patch = buildPatch(edits, Date.now());
    setExportText(JSON.stringify(patch, null, 2));
  }, [edits]);

  const changedCount = useMemo(() => patchSize(buildPatch(edits, 0)), [edits]);

  /*
   * The layer is mounted in BOTH branches. Closing the panel is how the owner gets it out of the
   * way to see the screen he is editing, so closing it must not also stop the words being
   * editable; the bubble is the only feedback he has while the sheet is down.
   */
  const layer = (
    <CopyEditLayer
      skin={storeSkin}
      edits={edits.copy}
      onCommit={setCopy}
      onDiscovered={setDiscovered}
    />
  );

  if (!open) {
    return (
      <>
        {layer}
        <button
          type="button"
          className="dm-launcher"
          data-testid="dm-launcher"
          onClick={() => {
            setOpen(true);
          }}
        >
          Design
        </button>
      </>
    );
  }

  return (
    <section className="dm-panel" data-testid="dm-panel" aria-label="Design Mode">
      {layer}
      <div className="dm-strip">
        <span className="dm-strip-title">Design Mode</span>
        {SKIN_IDS.map((skin) => (
          <button
            key={skin}
            type="button"
            aria-pressed={skin === previewSkin}
            data-testid={`dm-skin-${skin}`}
            onClick={() => {
              setPreviewSkin(skin);
            }}
          >
            {skin}
          </button>
        ))}
        <button type="button" onClick={resetAll} data-testid="dm-reset">
          Reset
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
          data-testid="dm-close"
        >
          Close
        </button>
      </div>

      <div className="dm-body">
        <p className="dm-note" data-testid="dm-preamble">
          Previewing the {previewSkin} tokens. The switcher above flips &lt;html data-skin&gt;, so
          every colour, face and geometry re-renders in that skin. It does NOT change the app
          setting: nothing here is written to your saved data, and no profile is touched.{' '}
          {changedCount} declaration{changedCount === 1 ? '' : 's'} changed.
          {storageFailed ? ' Storage refused these edits: a reload will lose them.' : ''}
        </p>

        <details className="dm-section" open>
          <summary>Copy ({Object.keys(edits.copy[storeSkin] ?? {}).length})</summary>
          <div className="dm-section-body">
            <CopySection
              skin={storeSkin}
              previewSkin={previewSkin}
              discovered={discovered}
              edits={edits.copy[storeSkin] ?? {}}
              onChange={setCopy}
              onUndo={undoCopy}
            />
          </div>
        </details>

        <details className="dm-section" open>
          <summary>Contrast</summary>
          <div className="dm-section-body">
            <ContrastReadout values={values} root={root} />
          </div>
        </details>

        {groups.map(([group, decls]) => (
          <details className="dm-section" key={group}>
            <summary>
              {group} ({decls.length})
            </summary>
            <div className="dm-section-body">
              {decls.map((decl) => (
                <TokenRow
                  key={decl.name}
                  decl={decl}
                  skin={previewSkin}
                  edited={edits.tokens[previewSkin]?.[decl.name]}
                  resolved={resolveValue(decl.name, values, root)}
                  onChange={setToken}
                  onReset={undoToken}
                />
              ))}
            </div>
          </details>
        ))}

        <details className="dm-section" open>
          <summary>Export</summary>
          <div className="dm-section-body">
            <p className="dm-note">
              Only changed declarations are exported. Apply it with: node scripts/design-patch.mjs
              patch.json, which prints a diff and writes nothing until you add --write.
            </p>
            <div className="dm-row">
              <button type="button" onClick={exportPatch} data-testid="dm-export">
                Export Patch
              </button>
              <button
                type="button"
                data-testid="dm-select-all"
                onClick={() => {
                  exportRef.current?.select();
                }}
              >
                Select All
              </button>
            </div>
            <textarea
              className="dm-export"
              ref={exportRef}
              data-testid="dm-export-text"
              aria-label="Export Patch JSON"
              readOnly
              value={exportText}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
            />
          </div>
        </details>
      </div>
    </section>
  );
}
