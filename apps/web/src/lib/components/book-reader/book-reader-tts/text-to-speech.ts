/**
 * @license BSD-3-Clause
 * Copyright (c) 2026, ッツ Reader Authors
 * All rights reserved.
 */

import { getParagraphNodes } from '$lib/components/book-reader/get-paragraph-nodes';
import type { PageManager } from '$lib/components/book-reader/types';
import { ViewMode } from '$lib/data/view-mode';

export const TTS_RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const TTS_HIGHLIGHT_CLASS = 'ttu-tts-active';
export const TTS_HIGHLIGHT_NAME = 'ttu-tts';

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, td, th, pre, dt, dd';
const MAX_UTTERANCE_CHARS = 180;
const PAGE_FLIP_ATTEMPTS = 40;

interface MappedText {
  text: string;
  parts: { node: Text; start: number; end: number }[];
}

export interface TextToSpeechOptions {
  rate: number;
  voiceURI: string;
  autoScroll: boolean;
  viewMode: ViewMode;
  verticalMode: boolean;
}

export function isSpeechSynthesisSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  );
}

export function getSpeechVoices() {
  if (!isSpeechSynthesisSupported()) {
    return [];
  }

  return window.speechSynthesis.getVoices();
}

export interface SpeechVoiceCountryGroup {
  country: string;
  voices: SpeechSynthesisVoice[];
}

function regionCodeForLang(lang: string) {
  const normalized = lang.replace(/_/g, '-');

  try {
    return new Intl.Locale(normalized).maximize().region;
  } catch {
    const parts = normalized.split('-').filter(Boolean);
    const region = parts.find((part) => /^[A-Za-z]{2}$/.test(part) && part !== parts[0]);

    return region?.toUpperCase();
  }
}

function countryLabelForLang(lang: string, regionNames?: Intl.DisplayNames) {
  const region = regionCodeForLang(lang);

  if (!region) {
    return 'Other';
  }

  try {
    return regionNames?.of(region) || region;
  } catch {
    return region;
  }
}

export function countryLabelForVoice(voice: SpeechSynthesisVoice, regionNames?: Intl.DisplayNames) {
  return countryLabelForLang(voice.lang || '', regionNames);
}

export function groupSpeechVoicesByCountry(voices: SpeechSynthesisVoice[]): SpeechVoiceCountryGroup[] {
  const regionNames =
    typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(['en'], { type: 'region' })
      : undefined;
  const groups = new Map<string, SpeechSynthesisVoice[]>();

  for (const voice of voices) {
    const country = countryLabelForVoice(voice, regionNames);
    const grouped = groups.get(country) || [];

    grouped.push(voice);
    groups.set(country, grouped);
  }

  return [...groups.entries()]
    .sort(([firstCountry], [secondCountry]) => {
      if (firstCountry === 'Other') {
        return 1;
      }

      if (secondCountry === 'Other') {
        return -1;
      }

      return firstCountry.localeCompare(secondCountry);
    })
    .map(([country, groupedVoices]) => ({
      country,
      voices: groupedVoices.sort((first, second) => first.name.localeCompare(second.name))
    }));
}

export function listSpeechVoices() {
  const seen = new Set<string>();
  const voices = getSpeechVoices().filter((voice) => {
    if (!voice.voiceURI || seen.has(voice.voiceURI)) {
      return false;
    }

    seen.add(voice.voiceURI);
    return true;
  });

  return groupSpeechVoicesByCountry(voices).flatMap((group) => group.voices);
}

export function previewSpeechVoice(voiceURI: string, rate = 1) {
  if (!isSpeechSynthesisSupported()) {
    return;
  }

  window.speechSynthesis.cancel();

  const voices = getSpeechVoices();
  const selected = voiceURI ? voices.find((voice) => voice.voiceURI === voiceURI) : undefined;
  const language = selected?.lang.toLowerCase() || '';
  const japanese = !selected || language.startsWith('ja') || language.startsWith('jp');
  const utterance = new SpeechSynthesisUtterance(
    japanese ? 'これはテキスト読み上げのテストです。' : 'This is a text to speech voice preview.'
  );

  utterance.rate = Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
  utterance.lang = selected?.lang || 'ja-JP';
  if (selected) {
    utterance.voice = selected;
  } else {
    const autoVoice =
      voices.find((voice) => voice.lang.toLowerCase().startsWith('ja')) ||
      voices.find((voice) => voice.default) ||
      voices[0];
    if (autoVoice) {
      utterance.voice = autoVoice;
      utterance.lang = autoVoice.lang || 'ja-JP';
    }
  }

  window.speechSynthesis.speak(utterance);
}

export function getSpeakableText(element: HTMLElement) {
  return getMappedText(element).text.replace(/\s+/g, ' ').trim();
}

export function getSpeakableElements(root: HTMLElement) {
  const nodes = getParagraphNodes(root);
  const seen = new Set<HTMLElement>();
  const elements: HTMLElement[] = [];

  for (const node of nodes) {
    const parent = node instanceof HTMLElement ? node : node.parentElement;
    const block = parent?.closest(BLOCK_SELECTOR);
    let element: HTMLElement | undefined;

    if (block instanceof HTMLElement) {
      element = block;
    } else if (parent instanceof HTMLElement) {
      element = parent;
    }

    if (!element || seen.has(element)) {
      continue;
    }

    if (!getMappedText(element).text.replace(/\s+/g, '').length) {
      continue;
    }

    seen.add(element);
    elements.push(element);
  }

  return elements;
}

export function splitForSpeech(text: string) {
  const chunks: { text: string; offset: number }[] = [];

  const pushChunk = (value: string, offset: number) => {
    if (!value.trim()) {
      return;
    }

    if (value.length <= MAX_UTTERANCE_CHARS) {
      chunks.push({ text: value, offset });
      return;
    }

    let inner = 0;
    while (inner < value.length) {
      chunks.push({
        text: value.slice(inner, inner + MAX_UTTERANCE_CHARS),
        offset: offset + inner
      });
      inner += MAX_UTTERANCE_CHARS;
    }
  };

  let cursor = 0;
  const parts = text.split(/(?<=[。！？!?…\n])/u);
  for (const part of parts) {
    pushChunk(part, cursor);
    cursor += part.length;
  }

  if (!chunks.length && text.trim()) {
    pushChunk(text, 0);
  }

  return chunks;
}

export class TextToSpeechController {
  speaking = false;

  paused = false;

  private contentEl: HTMLElement | undefined;

  private pageManager: PageManager | undefined;

  private options: TextToSpeechOptions = {
    rate: 1,
    voiceURI: '',
    autoScroll: true,
    viewMode: ViewMode.Paginated,
    verticalMode: true
  };

  private blocks: HTMLElement[] = [];

  private index = 0;

  private resumeOffset = 0;

  private currentElement: HTMLElement | undefined;

  private advancing = false;

  private generation = 0;

  private onStateChange: (() => void) | undefined;

  private activeRange: Range | undefined;

  private overlayEl: HTMLElement | undefined;

  constructor() {
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.getVoices();
    }
  }

  setStateChangeListener(listener: (() => void) | undefined) {
    this.onStateChange = listener;
  }

  configure(options: Partial<TextToSpeechOptions>) {
    const previousRate = this.options.rate;
    this.options = { ...this.options, ...options };

    if (
      this.speaking &&
      !this.paused &&
      options.rate !== undefined &&
      options.rate !== previousRate
    ) {
      this.generation += 1;
      this.cancelEngine();
      this.speakCurrent();
    }
  }

  setPageManager(pageManager: PageManager | undefined) {
    this.pageManager = pageManager;
  }

  setContent(contentEl: HTMLElement | undefined) {
    this.contentEl = contentEl;
    this.blocks = contentEl ? getSpeakableElements(contentEl) : [];

    if (!this.currentElement || !this.contentEl || this.contentEl.contains(this.currentElement)) {
      return;
    }

    const previousText = getSpeakableText(this.currentElement);
    const match = this.blocks.findIndex((block) => getSpeakableText(block) === previousText);

    if (match > -1) {
      this.currentElement = this.blocks[match];
      this.index = match;
      return;
    }

    if (!this.speaking) {
      this.currentElement = undefined;
      this.resumeOffset = 0;
      this.clearHighlight();
    }
  }

  private resolveContentEl() {
    if (this.contentEl?.isConnected) {
      return;
    }

    const fallback =
      document.querySelector<HTMLElement>('.book-content-container') ||
      document.querySelector<HTMLElement>('.book-content');
    if (fallback) {
      this.setContent(fallback);
    }
  }

  toggle() {
    if (!isSpeechSynthesisSupported()) {
      return false;
    }

    if (this.speaking && !this.paused) {
      this.pause();
      return true;
    }

    if (this.speaking && this.paused) {
      this.resume();
      return true;
    }

    return this.start();
  }

  stopOrRestart() {
    if (!isSpeechSynthesisSupported()) {
      return false;
    }

    if (this.speaking && this.paused) {
      return this.start({ fromCurrent: true });
    }

    if (this.speaking) {
      this.stop({ keepPosition: true });
      return true;
    }

    if (this.currentElement) {
      return this.start({ fromCurrent: true });
    }

    return false;
  }

  start(options: { fromCurrent?: boolean } = {}) {
    if (!isSpeechSynthesisSupported()) {
      return false;
    }

    this.resolveContentEl();
    if (!this.contentEl) {
      return false;
    }

    this.blocks = getSpeakableElements(this.contentEl);
    if (!this.blocks.length) {
      return false;
    }

    this.cancelEngine();
    const selected = this.readSelectionPosition();
    if (selected) {
      this.index = selected.index;
      this.currentElement = selected.element;
      this.resumeOffset = selected.offset;
    } else if (options.fromCurrent && this.currentElement) {
      const currentIndex = this.blocks.indexOf(this.currentElement);
      this.index = currentIndex > -1 ? currentIndex : this.findStartIndex();
    } else {
      this.index = this.findStartIndex();
      this.resumeOffset = 0;
    }
    this.speaking = true;
    this.paused = false;
    this.generation += 1;
    this.emitState();
    this.speakCurrent();
    return true;
  }

  seekToSelection() {
    if (!isSpeechSynthesisSupported() || (!this.speaking && !this.paused)) {
      return false;
    }

    this.resolveContentEl();
    if (!this.contentEl) {
      return false;
    }

    this.blocks = getSpeakableElements(this.contentEl);
    const selected = this.readSelectionPosition();
    if (!selected) {
      return false;
    }

    const alreadyThere =
      this.currentElement === selected.element && this.resumeOffset === selected.offset;
    this.index = selected.index;
    this.currentElement = selected.element;
    this.resumeOffset = selected.offset;

    if (this.paused) {
      this.highlightWord(getMappedText(selected.element), selected.offset, 0);
      if (this.activeRange) {
        void this.ensureVisible(this.activeRange);
      }
      this.emitState();
      return true;
    }

    if (alreadyThere) {
      return true;
    }

    this.generation += 1;
    this.cancelEngine();
    this.emitState();
    this.speakCurrent();
    return true;
  }

  pause() {
    if (!this.speaking || this.paused) {
      return;
    }

    this.paused = true;
    this.generation += 1;
    this.cancelEngine();
    this.emitState();
  }

  resume() {
    if (!this.speaking || !this.paused) {
      return;
    }

    this.paused = false;
    this.generation += 1;
    this.cancelEngine();
    this.emitState();
    this.speakCurrent();
  }

  stop(options: { keepPosition?: boolean } = {}) {
    this.speaking = false;
    this.paused = false;
    this.advancing = false;
    this.generation += 1;
    if (!options.keepPosition) {
      this.index = 0;
      this.resumeOffset = 0;
      this.currentElement = undefined;
      this.clearHighlight();
    }
    this.cancelEngine();
    this.emitState();
  }

  skip(offset: number) {
    if (!this.speaking || !this.blocks.length) {
      return;
    }

    this.index = Math.min(Math.max(this.index + offset, 0), this.blocks.length - 1);
    this.resumeOffset = 0;
    this.paused = false;
    this.generation += 1;
    this.cancelEngine();
    this.speakCurrent();
    this.emitState();
  }

  private findStartIndex() {
    const selected = this.readSelectionPosition();
    if (selected) {
      return selected.index;
    }

    const visibleIndex = this.blocks.findIndex((block) => this.isMostlyVisible(block));
    return visibleIndex > -1 ? visibleIndex : 0;
  }

  private readSelectionPosition() {
    if (typeof window === 'undefined' || !this.blocks.length) {
      return undefined;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return undefined;
    }

    if (!selection.toString().replace(/\s+/g, '')) {
      return undefined;
    }

    let range: Range;
    try {
      range = selection.getRangeAt(0);
    } catch {
      return undefined;
    }

    const start = this.resolveTextPoint(range.startContainer, range.startOffset);
    if (!start) {
      return undefined;
    }

    const index = this.blocks.findIndex((block) => block.contains(start.node));
    if (index < 0) {
      return undefined;
    }

    const element = this.blocks[index];
    const mapped = getMappedText(element);
    const part = mapped.parts.find((entry) => entry.node === start.node);
    const charIndex = part
      ? part.start + Math.min(Math.max(start.offset, 0), part.node.length)
      : 0;

    return {
      index,
      element,
      offset: wordSpanAt(mapped.text, charIndex).start
    };
  }

  private resolveTextPoint(node: Node, offset: number) {
    if (node.nodeType === Node.TEXT_NODE) {
      return { node: node as Text, offset };
    }

    const child = node.childNodes[offset] || node.childNodes[offset - 1] || node;
    const textNode = this.firstTextNode(child);
    if (!textNode) {
      return undefined;
    }

    return { node: textNode, offset: 0 };
  }

  private firstTextNode(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node as Text;
    }

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    return (walker.nextNode() as Text | null) || undefined;
  }

  private speakCurrent() {
    const generation = this.generation;
    const element = this.blocks[this.index];

    if (!element) {
      this.finishOrAdvance(generation);
      return;
    }

    const mapped = getMappedText(element);
    if (!mapped.text.replace(/\s+/g, '').length) {
      this.index += 1;
      this.speakCurrent();
      return;
    }

    this.currentElement = element;
    void this.ensureVisible(this.activeRange || element);
    this.speakTextChunks(mapped, generation, () => {
      if (generation !== this.generation || !this.speaking) {
        return;
      }

      this.resumeOffset = 0;
      this.index += 1;
      this.speakCurrent();
    });
  }

  private speakTextChunks(mapped: MappedText, generation: number, onComplete: () => void) {
    const startOffset = Math.min(Math.max(this.resumeOffset, 0), mapped.text.length);
    const chunks = splitForSpeech(mapped.text.slice(startOffset)).map((chunk) => ({
      text: chunk.text,
      offset: startOffset + chunk.offset
    }));
    const speakNext = (chunkIndex: number) => {
      if (generation !== this.generation || !this.speaking) {
        return;
      }

      if (chunkIndex >= chunks.length) {
        onComplete();
        return;
      }

      const chunk = chunks[chunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.rate = this.clampRate(this.options.rate);
      utterance.lang = 'ja-JP';
      const voice = this.resolveVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || 'ja-JP';
      }

      const highlightAt = (charIndex: number) => {
        if (generation !== this.generation || !this.speaking) {
          return;
        }

        this.highlightWord(mapped, chunk.offset, charIndex);
        if (this.activeRange) {
          void this.ensureVisible(this.activeRange);
        }
      };

      utterance.onstart = () => highlightAt(0);

      utterance.onboundary = (event) => {
        if (event.name !== 'word') {
          return;
        }

        highlightAt(event.charIndex);
      };

      utterance.onend = () => {
        if (generation !== this.generation) {
          return;
        }

        speakNext(chunkIndex + 1);
      };

      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') {
          return;
        }

        if (generation !== this.generation) {
          return;
        }

        speakNext(chunkIndex + 1);
      };

      highlightAt(0);
      window.speechSynthesis.speak(utterance);
    };

    speakNext(0);
  }

  private async finishOrAdvance(generation: number) {
    if (generation !== this.generation || !this.speaking) {
      return;
    }

    if (this.options.viewMode !== ViewMode.Paginated || !this.pageManager || this.advancing) {
      this.stop();
      return;
    }

    this.advancing = true;
    const previousElement = this.blocks[this.blocks.length - 1];
    const previousLastText = previousElement ? getSpeakableText(previousElement) : '';

    for (let attempt = 0; attempt < 8; attempt += 1) {
      this.pageManager.nextPage();
      await waitMs(120);

      if (generation !== this.generation) {
        this.advancing = false;
        return;
      }

      if (this.contentEl) {
        this.blocks = getSpeakableElements(this.contentEl);
      }

      const lastBlock = this.blocks[this.blocks.length - 1];
      const lastText = lastBlock ? getSpeakableText(lastBlock) : '';
      const previousIndex = this.blocks.findIndex(
        (block) => getSpeakableText(block) === previousLastText
      );

      if (previousIndex > -1 && previousIndex < this.blocks.length - 1) {
        this.advancing = false;
        this.resumeOffset = 0;
        this.index = previousIndex + 1;
        this.speakCurrent();
        return;
      }

      if (this.blocks.length && previousIndex === -1) {
        this.advancing = false;
        this.resumeOffset = 0;
        this.index = 0;
        this.speakCurrent();
        return;
      }

      if (!this.blocks.length || lastText === previousLastText) {
        continue;
      }
    }

    this.advancing = false;
    this.stop();
  }

  private async ensureVisible(target: HTMLElement | Range) {
    if (!this.options.autoScroll) {
      return;
    }

    if (this.options.viewMode === ViewMode.Continuous) {
      if (!this.isMostlyVisible(target)) {
        this.scrollTargetIntoView(target);
      }
      return;
    }

    if (!this.pageManager) {
      return;
    }

    for (let attempt = 0; attempt < PAGE_FLIP_ATTEMPTS; attempt += 1) {
      const connected =
        target instanceof Range ? target.startContainer.isConnected : target.isConnected;
      if (!connected || this.isMostlyVisible(target)) {
        return;
      }

      const direction = this.pageFlipDirection(target);
      if (!direction) {
        this.scrollTargetIntoView(target);
        return;
      }

      if (direction > 0) {
        this.pageManager.nextPage();
      } else {
        this.pageManager.prevPage();
      }

      await waitMs(40);
      this.paintOverlay();
    }
  }

  private scrollTargetIntoView(target: HTMLElement | Range) {
    const rect = target.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      return;
    }

    const viewport = this.getViewportRect();
    const deltaX = (rect.left + rect.right) / 2 - (viewport.left + viewport.right) / 2;
    const deltaY = (rect.top + rect.bottom) / 2 - (viewport.top + viewport.bottom) / 2;

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
      return;
    }

    window.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' });
  }

  private pageFlipDirection(target: HTMLElement | Range): 1 | -1 | 0 {
    const rect = target.getBoundingClientRect();
    const viewport = this.getViewportRect();
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;

    if (this.options.verticalMode) {
      if (centerY < viewport.top) {
        return -1;
      }
      if (centerY > viewport.bottom) {
        return 1;
      }
      if (centerX < viewport.left) {
        return 1;
      }
      if (centerX > viewport.right) {
        return -1;
      }
      return 0;
    }

    if (centerY > viewport.bottom) {
      return 1;
    }
    if (centerY < viewport.top) {
      return -1;
    }
    if (centerX > viewport.right) {
      return 1;
    }
    if (centerX < viewport.left) {
      return -1;
    }
    return 0;
  }

  private isMostlyVisible(target: HTMLElement | Range) {
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return false;
    }

    const viewport = this.getViewportRect();
    const padding = 32;
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;

    return (
      centerX >= viewport.left + padding &&
      centerX <= viewport.right - padding &&
      centerY >= viewport.top + padding &&
      centerY <= viewport.bottom - padding
    );
  }

  private getViewportRect() {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight
    };
  }

  private highlightWord(mapped: MappedText, chunkOffset: number, charIndex: number) {
    const span = wordSpanAt(mapped.text, chunkOffset + Math.max(0, charIndex));

    const range = rangeFromMappedText(mapped, span.start, span.length);
    if (!range) {
      return;
    }

    this.activeRange = range;
    this.resumeOffset = span.start;

    if (hasHighlightApi()) {
      const highlight = new Highlight(range);
      CSS.highlights.set(TTS_HIGHLIGHT_NAME, highlight);
      this.removeOverlay();
      return;
    }

    this.paintOverlay();
  }

  private paintOverlay() {
    if (!this.activeRange || hasHighlightApi()) {
      return;
    }

    const overlay = this.ensureOverlay();
    overlay.replaceChildren();

    const rects = this.activeRange.getClientRects();
    for (const rect of Array.from(rects)) {
      if (!rect.width || !rect.height) {
        continue;
      }

      const mark = document.createElement('div');
      mark.className = TTS_HIGHLIGHT_CLASS;
      mark.style.left = `${rect.left}px`;
      mark.style.top = `${rect.top}px`;
      mark.style.width = `${rect.width}px`;
      mark.style.height = `${rect.height}px`;
      overlay.appendChild(mark);
    }
  }

  private ensureOverlay() {
    if (this.overlayEl) {
      return this.overlayEl;
    }

    const overlay = document.createElement('div');
    overlay.className = 'ttu-tts-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    return overlay;
  }

  private removeOverlay() {
    this.overlayEl?.remove();
    this.overlayEl = undefined;
  }

  private clearHighlight() {
    this.activeRange = undefined;

    if (hasHighlightApi()) {
      CSS.highlights.delete(TTS_HIGHLIGHT_NAME);
    }

    this.removeOverlay();
    this.contentEl
      ?.querySelectorAll(`.${TTS_HIGHLIGHT_CLASS}`)
      .forEach((node) => node.classList.remove(TTS_HIGHLIGHT_CLASS));
  }

  private resolveVoice() {
    const voices = getSpeechVoices();
    if (!voices.length) {
      return undefined;
    }

    if (this.options.voiceURI) {
      return voices.find((voice) => voice.voiceURI === this.options.voiceURI);
    }

    return (
      voices.find((voice) => voice.lang.toLowerCase().startsWith('ja')) ||
      voices.find((voice) => voice.default) ||
      voices[0]
    );
  }

  private clampRate(rate: number) {
    if (!Number.isFinite(rate)) {
      return 1;
    }

    return Math.min(2, Math.max(0.5, rate));
  }

  private cancelEngine() {
    if (!isSpeechSynthesisSupported()) {
      return;
    }

    window.speechSynthesis.cancel();
  }

  private emitState() {
    this.onStateChange?.();
  }
}

function getMappedText(element: HTMLElement): MappedText {
  const nodes = getParagraphNodes(element).filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE
  );
  const parts: MappedText['parts'] = [];
  let text = '';

  for (const node of nodes) {
    const content = node.textContent || '';
    if (!content) {
      continue;
    }

    const start = text.length;
    text += content;
    parts.push({ node, start, end: text.length });
  }

  return { text, parts };
}

function rangeFromMappedText(mapped: MappedText, start: number, length: number) {
  const end = Math.min(mapped.text.length, start + Math.max(1, length));
  if (start >= mapped.text.length || end <= start) {
    return undefined;
  }

  const range = document.createRange();
  let started = false;

  for (const part of mapped.parts) {
    if (!started && start < part.end) {
      range.setStart(part.node, Math.max(0, start - part.start));
      started = true;
    }

    if (started && end <= part.end) {
      range.setEnd(part.node, Math.max(0, end - part.start));
      return range;
    }
  }

  if (started) {
    const last = mapped.parts[mapped.parts.length - 1];
    range.setEnd(last.node, last.node.length);
    return range;
  }

  return undefined;
}

function wordSpanAt(text: string, charIndex: number) {
  if (!text.length) {
    return { start: 0, length: 0 };
  }

  const index = Math.max(0, Math.min(charIndex, text.length - 1));

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segments = [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)];

    for (let i = 0; i < segments.length; i += 1) {
      const current = segments[i];
      const nextIndex = segments[i + 1]?.index ?? text.length;

      if (index < current.index || index >= nextIndex) {
        continue;
      }

      if (!current.isWordLike && !current.segment.trim()) {
        const nextWord = segments
          .slice(i + 1)
          .find((segment) => segment.isWordLike || segment.segment.trim());
        if (nextWord) {
          return { start: nextWord.index, length: nextWord.segment.length };
        }
      }

      return { start: current.index, length: Math.max(current.segment.length, 1) };
    }
  }

  if (/\s/.test(text[index] || '')) {
    return { start: index, length: 1 };
  }

  let end = index + 1;
  if (/[A-Za-z0-9]/.test(text[index])) {
    while (end < text.length && /[A-Za-z0-9']/.test(text[end])) {
      end += 1;
    }
    return { start: index, length: end - index };
  }

  return { start: index, length: 1 };
}

function hasHighlightApi() {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
