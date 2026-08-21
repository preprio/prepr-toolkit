import type { VNode } from 'preact';

import type { ToolbarState } from '../store';
import type { PreprSegment } from '../types';
import {
  CLOSE_ICON_SVG,
  LOGO_SVG,
  ROTATE_ICON_SVG,
  SORT_DOWN_ICON_SVG,
  TOGGLE_ICON_SVG,
  XMARK_ICON_SVG,
} from './icons';
import { TOOLBAR_CSS } from './styles';

type Translate = (key: string) => string;

/**
 * Callbacks + view flags the custom element hands down to the Preact tree.
 * Everything below is a pure view: it renders markup and forwards intent
 * through these handlers, never touching the store directly.
 */
export interface PanelHandlers {
  onToggle(): void;
  onClose(): void;
  onPreviewMode(value: boolean): void;
  onEditMode(value: boolean): void;
  onVariant(value: 'A' | 'B'): void;
  onReset(): void;
  onStatusPill(): void;
  onCloseEditPill(): void;
  onSegmentButtonClick(): void;
  onSegmentButtonKeydown(event: KeyboardEvent): void;
  onOptionsKeydown(event: KeyboardEvent): void;
  onChooseSegment(id: string): void;
  onSegmentFilterInput(value: string): void;
  onPreviewTooltipEnter(el: HTMLElement): void;
  onPreviewTooltipLeave(): void;
}

export interface PanelProps {
  state: ToolbarState;
  t: Translate;
  listboxOpen: boolean;
  segmentFilter: string;
  handlers: PanelHandlers;
}

function RawSvg({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}): VNode {
  return (
    <span
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function Header({ t, onClose }: { t: Translate; onClose(): void }): VNode {
  return (
    <div class="prepr-header">
      <div class="prepr-header-left">
        <RawSvg svg={LOGO_SVG} />
        <div class="prepr-badge" data-prepr="badge">
          {t('common.toolbar')}
        </div>
      </div>
      <button
        type="button"
        class="prepr-header-close"
        data-prepr="close"
        aria-label={t('common.toolbar')}
        onClick={onClose}
      >
        <RawSvg svg={CLOSE_ICON_SVG} />
      </button>
    </div>
  );
}

// Each radio carries a `data-tooltip-key` that the element resolves when the
// hover/focus callbacks fire.
function PreviewSelector({
  state,
  t,
  handlers,
}: {
  state: ToolbarState;
  t: Translate;
  handlers: PanelHandlers;
}): VNode {
  const value = String(state.previewMode);
  const options: Array<{
    v: boolean;
    label: string;
    off?: boolean;
    tooltipKey: string;
  }> = [
    {
      v: false,
      label: t('common.off'),
      off: true,
      tooltipKey: 'adaptiveContent.offDescription',
    },
    {
      v: true,
      label: t('common.on'),
      tooltipKey: 'adaptiveContent.onDescription',
    },
  ];
  return (
    <div class="prepr-radiogroup" role="radiogroup" data-prepr="preview-group">
      {options.map((opt) => {
        const checked = value === String(opt.v);
        return (
          <button
            type="button"
            class="prepr-radio"
            data-prepr="preview-mode"
            data-value={String(opt.v)}
            data-off={opt.off ? 'true' : undefined}
            role="radio"
            data-checked={String(checked)}
            aria-checked={checked}
            data-tooltip-key={opt.tooltipKey}
            onClick={() => handlers.onPreviewMode(opt.v)}
            onMouseEnter={(e) =>
              handlers.onPreviewTooltipEnter(e.currentTarget as HTMLElement)
            }
            onMouseLeave={() => handlers.onPreviewTooltipLeave()}
            onFocus={(e) =>
              handlers.onPreviewTooltipEnter(e.currentTarget as HTMLElement)
            }
            onBlur={() => handlers.onPreviewTooltipLeave()}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Keyboard nav and open state live on the element, not here.
function SegmentListbox({
  state,
  t,
  listboxOpen,
  segmentFilter,
  handlers,
}: {
  state: ToolbarState;
  t: Translate;
  listboxOpen: boolean;
  segmentFilter: string;
  handlers: PanelHandlers;
}): VNode {
  const segments = state.segments;
  const hasSegments = segments.length > 0;
  const filter = segmentFilter.trim().toLowerCase();
  const visibleSegments = filter
    ? segments.filter((s) => s.name.toLowerCase().includes(filter))
    : segments;

  let label: string;
  if (!hasSegments) {
    label = t('adaptiveContent.none');
  } else if (state.selectedSegment === null) {
    label = t('adaptiveContent.chooseSegment');
  } else {
    const seg = segments.find((s) => s._id === state.selectedSegment);
    label = seg ? seg.name : t('adaptiveContent.chooseSegment');
  }

  const disabled = !hasSegments || !state.previewMode;

  return (
    <div class="prepr-listbox">
      <button
        type="button"
        class="prepr-segment-button"
        data-prepr="segment-button"
        aria-haspopup="listbox"
        aria-expanded={listboxOpen}
        disabled={disabled}
        onClick={() => handlers.onSegmentButtonClick()}
        onKeyDown={(e) => handlers.onSegmentButtonKeydown(e as KeyboardEvent)}
      >
        <span class="prepr-segment-label" data-prepr="segment-button-label">
          {label}
        </span>
        <span class="prepr-segment-caret">
          <RawSvg svg={SORT_DOWN_ICON_SVG} />
        </span>
      </button>
      <ul
        class="prepr-options"
        data-prepr="options"
        role="listbox"
        hidden={!listboxOpen}
        onKeyDown={(e) => handlers.onOptionsKeydown(e as KeyboardEvent)}
      >
        <li class="prepr-option-search" role="none">
          <input
            type="text"
            class="prepr-segment-search"
            data-prepr="segment-search"
            placeholder={t('adaptiveContent.searchSegments')}
            value={segmentFilter}
            onInput={(e) =>
              handlers.onSegmentFilterInput(
                (e.currentTarget as HTMLInputElement).value,
              )
            }
          />
        </li>
        {visibleSegments.map((seg) => (
          <SegmentOption
            key={seg._id}
            seg={seg}
            selected={seg._id === state.selectedSegment}
            onChoose={handlers.onChooseSegment}
          />
        ))}
      </ul>
    </div>
  );
}

function SegmentOption({
  seg,
  selected,
  onChoose,
}: {
  seg: PreprSegment;
  selected: boolean;
  onChoose(id: string): void;
}): VNode {
  return (
    <li
      class="prepr-option"
      role="option"
      data-value={seg._id}
      tabIndex={-1}
      aria-selected={selected}
      onClick={() => onChoose(seg._id)}
    >
      <span class="prepr-option-label">{seg.name}</span>
    </li>
  );
}

function VariantSelector({
  state,
  handlers,
}: {
  state: ToolbarState;
  handlers: PanelHandlers;
}): VNode {
  const variantValue = state.selectedVariant === 'B' ? 'B' : 'A';
  const values: Array<'A' | 'B'> = ['A', 'B'];
  return (
    <div
      class="prepr-radiogroup"
      role="radiogroup"
      data-prepr="variant-group"
      data-disabled={String(!state.previewMode)}
    >
      {values.map((v) => {
        const checked = variantValue === v;
        return (
          <button
            type="button"
            class="prepr-radio prepr-radio-variant"
            data-prepr="variant"
            data-value={v}
            role="radio"
            data-checked={String(checked)}
            aria-checked={checked}
            onClick={() => handlers.onVariant(v)}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

function EditModeSelector({
  state,
  t,
  handlers,
}: {
  state: ToolbarState;
  t: Translate;
  handlers: PanelHandlers;
}): VNode {
  const value = String(state.editMode);
  const options: Array<{ v: boolean; label: string; off?: boolean }> = [
    { v: false, label: t('common.off'), off: true },
    { v: true, label: t('common.on') },
  ];
  return (
    <div class="prepr-radiogroup" role="radiogroup" data-prepr="edit-group">
      {options.map((opt) => {
        const checked = value === String(opt.v);
        return (
          <button
            type="button"
            class="prepr-radio"
            data-prepr="edit-mode"
            data-value={String(opt.v)}
            data-off={opt.off ? 'true' : undefined}
            role="radio"
            data-checked={String(checked)}
            aria-checked={checked}
            onClick={() => handlers.onEditMode(opt.v)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({
  state,
  t,
  handlers,
}: {
  state: ToolbarState;
  t: Translate;
  handlers: PanelHandlers;
}): VNode {
  const { features } = state;
  const defaultSegmentName =
    state.segments.find((s) => s._id === 'all_other_users')?.name ??
    t('adaptiveContent.allOtherUsers');

  // With segments off there is no segment to name, so the pill falls back to
  // the generic "user" label rather than rendering a dangling "Viewing as:".
  let segmentLabel: string;
  if (!state.previewMode || !features.segments) {
    segmentLabel = t('common.user');
  } else if (state.selectedSegment !== null) {
    const seg = state.segments.find((s) => s._id === state.selectedSegment);
    segmentLabel = seg ? seg.name : defaultSegmentName;
  } else {
    segmentLabel = defaultSegmentName;
  }

  return (
    <button
      type="button"
      class="prepr-status-pill"
      data-prepr="status-pill"
      hidden={state.isIframe}
      onClick={() => handlers.onStatusPill()}
    >
      <span class="prepr-status-viewing" data-prepr="status-viewing">
        {t('common.viewingAs')}
      </span>
      <span class="prepr-status-segment" data-prepr="status-segment">
        {segmentLabel}
      </span>
      <span
        class="prepr-status-variant"
        data-prepr="status-variant"
        hidden={!features.abTesting || !state.previewMode}
      >
        {state.selectedVariant === 'B' ? 'B' : 'A'}
      </span>
      {/* Mirrors the reset the pill performs: it clears the segment and puts
          the variant back to 'A', so the X must appear whenever either is
          off-default. A disabled feature can never be off-default. */}
      <span
        class="prepr-status-x"
        data-prepr="status-x"
        hidden={
          !state.previewMode ||
          !(
            (features.segments && state.selectedSegment !== null) ||
            (features.abTesting && state.selectedVariant === 'B')
          )
        }
      >
        <RawSvg svg={XMARK_ICON_SVG} />
      </span>
    </button>
  );
}

function CloseEditPill({
  state,
  t,
  handlers,
}: {
  state: ToolbarState;
  t: Translate;
  handlers: PanelHandlers;
}): VNode {
  return (
    <button
      type="button"
      class="prepr-close-edit-pill"
      data-prepr="close-edit-pill"
      aria-label={t('editingTools.ariaCloseEditMode')}
      hidden={!state.features.editMode || !state.editMode || state.isIframe}
      onClick={() => handlers.onCloseEditPill()}
    >
      <span data-prepr="close-edit-label">{t('editingTools.editMode')}</span>
      <span class="prepr-close-edit-x">
        <RawSvg svg={XMARK_ICON_SVG} />
      </span>
    </button>
  );
}

export function Panel({
  state,
  t,
  listboxOpen,
  segmentFilter,
  handlers,
}: PanelProps): VNode {
  const { features } = state;
  // Only count what the user can actually see, or Reset lights up on state
  // they have no control over.
  const hasPersonalization =
    (features.segments && state.selectedSegment !== null) ||
    (features.abTesting && state.selectedVariant !== null);
  const showAdaptive = features.segments || features.abTesting;

  return (
    <>
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: TOOLBAR_CSS }}
      />

      <div
        class="prepr-backdrop"
        data-prepr="backdrop"
        data-open={String(state.toolbarOpen)}
      />

      <div class="prepr-container">
        <div class="prepr-toggle-holder">
          <button
            type="button"
            class="prepr-toggle"
            data-prepr="toggle"
            aria-label={t('common.toolbar')}
            onClick={() => handlers.onToggle()}
          >
            <RawSvg svg={TOGGLE_ICON_SVG} />
          </button>
        </div>
      </div>

      <div
        class="prepr-panel"
        data-prepr="panel"
        data-open={String(state.toolbarOpen)}
      >
        <div
          class="prepr-content"
          data-prepr="content"
          role="dialog"
          aria-label={t('common.toolbar')}
        >
          <Header t={t} onClose={handlers.onClose} />

          {/* Preview mode only drives segments/AB, so with both features
              disabled the whole section is hidden. */}
          {showAdaptive && (
            <div class="prepr-section" data-prepr="section-adaptive">
              <span class="prepr-section-label" data-prepr="adaptive-label">
                {t('adaptiveContent.adaptiveContent')}
              </span>

              <div class="prepr-row">
                <h2 class="prepr-row-title" data-prepr="preview-label">
                  {t('adaptiveContent.enablePreview')}
                </h2>
                <PreviewSelector state={state} t={t} handlers={handlers} />
              </div>

              {features.segments && (
                <div class="prepr-row">
                  <h2 class="prepr-row-title" data-prepr="segment-label">
                    {t('adaptiveContent.segment')}
                  </h2>
                  <SegmentListbox
                    state={state}
                    t={t}
                    listboxOpen={listboxOpen}
                    segmentFilter={segmentFilter}
                    handlers={handlers}
                  />
                </div>
              )}

              {features.abTesting && (
                <div class="prepr-row">
                  <h2 class="prepr-row-title" data-prepr="variant-label">
                    {t('adaptiveContent.ABVariant')}
                  </h2>
                  <VariantSelector state={state} handlers={handlers} />
                </div>
              )}
            </div>
          )}

          {features.editMode && (
            <div class="prepr-section" data-prepr="section-editing">
              <span class="prepr-section-label" data-prepr="editing-label">
                {t('editingTools.editingTools')}
              </span>
              <div class="prepr-row">
                <h2 class="prepr-row-title" data-prepr="edit-label">
                  {t('editingTools.editMode')}
                </h2>
                <EditModeSelector state={state} t={t} handlers={handlers} />
              </div>
            </div>
          )}

          <button
            type="button"
            class="prepr-reset"
            data-prepr="reset"
            disabled={!hasPersonalization}
            onClick={() => handlers.onReset()}
          >
            <RawSvg svg={ROTATE_ICON_SVG} />
            <span data-prepr="reset-label">{t('common.reset')}</span>
          </button>
        </div>
      </div>

      <div class="prepr-indicators">
        <StatusPill state={state} t={t} handlers={handlers} />
        <CloseEditPill state={state} t={t} handlers={handlers} />
      </div>

      <div class="prepr-tip" data-prepr="tooltip" role="tooltip" hidden>
        <span data-prepr="tooltip-text" />
        <span class="prepr-tip-arrow" data-prepr="tooltip-arrow" />
      </div>
    </>
  );
}
