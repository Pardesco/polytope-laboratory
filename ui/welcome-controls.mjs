// SPDX-License-Identifier: GPL-3.0-only
import gallery from './welcome-gallery.json';
import { readWelcomeSetting, writeWelcomeSetting, shouldShowWelcome, featuredView } from './welcome-state.mjs';
import { Walkthrough, WALKTHROUGHS } from './walkthrough.mjs';
import { Viewer } from './viewer.js';
import { revealWalkthrough } from './welcome-reveal.mjs';
import { Tips } from './tips.mjs';
import './tips.css';
import './welcome.css';
import './welcome-refresh.css';

export class WelcomeControls {
  constructor(context) {
    this.context = context;
    this.hiddenMode = false;
    this.cache = new Map();
    this.queue = [];
    const panel = document.createElement('section');
    this.panel = panel;
    panel.id = 'welcome-panel';
    panel.hidden = true;
    panel.setAttribute('aria-labelledby', 'welcome-title');
    panel.innerHTML =
      '<div class="welcome-heading"><div><p class="welcome-eyebrow">POLYTOPE LABORATORY · OFFLINE</p><h1 id="welcome-title">Explore shapes in three and four dimensions</h1><p>Start with a shape, follow your curiosity, and see where it takes you.</p></div><button id="welcome-close" aria-label="Close welcome">Close</button></div><div id="welcome-primary" class="welcome-primary"></div><p id="welcome-error" role="status" hidden></p><div id="welcome-shortcuts" class="welcome-links"></div><h2>Featured shapes</h2><p class="muted">Pick a shape to explore. Each opens in its own document.</p><div id="welcome-gallery"></div><h2>Show me how</h2><p class="muted">Short walkthroughs open a learning copy. Your existing documents stay available.</p><div id="welcome-tours" class="welcome-links"></div><h2>Sample projects</h2><div id="welcome-samples" class="welcome-links"></div><div class="welcome-footer"><label><input id="welcome-never" type="checkbox"> Show at startup</label><span>Reopen from Help → Welcome or Search commands.</span></div>';
    document.body.append(panel);
    this.primary(panel.querySelector('#welcome-primary'), 'welcome');
    this.shortcuts(panel.querySelector('#welcome-shortcuts'), 'welcome');
    this.tips = new Tips();
    panel.querySelector('#welcome-close').onclick = () => this.close(true);
    const whatsNew = document.createElement('button');
    whatsNew.id = 'welcome-whats-new';
    whatsNew.textContent = 'What’s new';
    whatsNew.onclick = () => {
      this.close();
      context.showWhatsNew?.();
    };
    panel.querySelector('#welcome-shortcuts').append(whatsNew);
    panel.querySelector('#welcome-never').onchange = (event) =>
      writeWelcomeSetting(localStorage, !event.target.checked);
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            this.observer.unobserve(entry.target);
            this.queue.push(entry.target);
          }
        this.pump();
      },
      { root: panel, rootMargin: '80px' }
    );
    for (const entry of gallery) {
      const button = document.createElement('button');
      button.id = 'featured-' + entry.key;
      button.className = 'welcome-card';
      button.dataset.featuredKey = entry.key;
      const preview = document.createElement('span');
      preview.className = 'welcome-thumbnail';
      preview.textContent = entry.dimension + 'D · Preview loading';
      const title = document.createElement('strong');
      title.textContent = entry.name;
      const caption = document.createElement('small');
      caption.textContent = entry.caption;
      button.append(preview, title, caption);
      button.onclick = this.action(() => context.openFeatured(entry));
      panel.querySelector('#welcome-gallery').append(button);
    }
    for (const tour of WALKTHROUGHS) {
      const button = document.createElement('button');
      button.id = 'walkthrough-' + tour.id;
      button.textContent = tour.title;
      button.onclick = this.action(() => this.startTour(tour));
      panel.querySelector('#welcome-tours').append(button);
    }
    for (const sample of context.samples) {
      const button = document.createElement('button');
      button.id = 'sample-' + sample.id;
      button.textContent = sample.title;
      button.onclick = this.action(() => context.openSample(sample));
      panel.querySelector('#welcome-samples').append(button);
    }
    const empty = document.getElementById('empty-workspace-message');
    empty.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = 'Your next shape starts here.';
    const hint = document.createElement('span');
    hint.textContent = ' Explore the bundled library, open a project, or try a guided first step.';
    const links = document.createElement('span');
    links.className = 'welcome-primary';
    empty.append(heading, hint, links);
    this.primary(links, 'empty');
    const shortcuts = document.createElement('span');
    shortcuts.className = 'welcome-links';
    empty.append(shortcuts);
    this.shortcuts(shortcuts, 'empty');
    const coach = document.createElement('section');
    this.coach = coach;
    coach.id = 'walkthrough-coach';
    coach.hidden = true;
    coach.setAttribute('aria-labelledby', 'walkthrough-title');
    coach.innerHTML =
      '<div class="welcome-heading"><strong id="walkthrough-title"></strong><button id="walkthrough-exit">Exit tour</button></div><p id="walkthrough-step" aria-live="polite"></p><p id="walkthrough-text"></p><div class="welcome-links"><button id="walkthrough-skip">Skip step</button><button id="walkthrough-next">Next</button></div>';
    document.body.append(coach);
    this.walkthrough = new Walkthrough({
      find: (id) => document.getElementById(id),
      onStep: (step) => this.showStep(step),
      onEnd: (reason) => {
        this.clearAnchor();
        coach.hidden = true;
        document.body.append(coach);
        context.setStatus(
          reason === 'complete'
            ? 'Walkthrough complete. Keep exploring, or open Welcome for another.'
            : 'Walkthrough closed.'
        );
      },
    });
    coach.querySelector('#walkthrough-exit').onclick = () => this.walkthrough.stop();
    for (const id of ['walkthrough-skip', 'walkthrough-next'])
      coach.querySelector('#' + id).onclick = () => this.walkthrough.next();
    for (const type of ['click', 'change', 'input'])
      document.addEventListener(
        type,
        (event) => {
          const anchor = event.target.closest?.('[id]');
          if (!anchor || anchor.matches(':disabled')) return;
          const tour = this.walkthrough.tour,
            index = this.walkthrough.index,
            value = anchor.value;
          queueMicrotask(() => {
            if (this.walkthrough.tour === tour && this.walkthrough.index === index)
              this.walkthrough.event(anchor.id, type, value);
          });
        },
        true
      );
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (this.walkthrough.tour) {
          this.walkthrough.stop();
          event.preventDefault();
        } else if (!panel.hidden && !document.querySelector('dialog[open]')) {
          this.close(true);
          event.preventDefault();
        }
      }
    });
    document.addEventListener(
      'close',
      (event) => {
        if (event.target.contains?.(coach) && this.walkthrough.tour) this.walkthrough.stop();
      },
      true
    );
  }
  primary(host, prefix) {
    for (const [id, label, run] of [
      ['library', 'Browse the library', () => this.context.explore()],
      ['symmetry', 'Build from symmetry', () => window.openCoxeterBuilder?.()],
      ['open', 'Open a file', () => this.context.openFile()],
    ]) {
      const button = document.createElement('button');
      button.id = prefix + '-' + id;
      button.textContent = label;
      button.onclick = this.action(run);
      host.append(button);
    }
  }
  shortcuts(host, prefix) {
    for (const [id, label, run] of [
      ['motion', 'See 4D in motion', () => this.context.openFeatured(gallery[0], { motion: true })],
      ['paper', 'Make a paper model', () => this.startTour(WALKTHROUGHS.find((t) => t.id === 'paper'))],
    ]) {
      const button = document.createElement('button');
      button.id = prefix + '-' + id;
      button.textContent = label;
      button.onclick = this.action(run);
      host.append(button);
    }
  }
  action(run) {
    return this.context.guard(async () => {
      this.close();
      try {
        return await run();
      } catch (error) {
        this.show();
        const notice = this.panel.querySelector('#welcome-error');
        notice.hidden = false;
        notice.textContent = 'That action could not finish: ' + error.message + ' Try again, or explore another model.';
        throw error;
      }
    });
  }
  auto(options) {
    this.hiddenMode = options.hidden === true;
    this.tips.start(options);
    if (shouldShowWelcome({ ...options, dismissed: readWelcomeSetting(localStorage) })) this.show();
  }
  show() {
    if (this.hiddenMode || document.querySelector('dialog[open]')) return;
    this.context.refreshRecent?.();
    if (!this.panel.hidden) {
      this.panel.querySelector('#welcome-close').focus({ preventScroll: true });
      return;
    }
    this.walkthrough.stop();
    this.previousFocus = document.activeElement;
    this.panel.hidden = false;
    this.panel.querySelector('#welcome-never').checked = !readWelcomeSetting(localStorage);
    this.panel.querySelector('#welcome-error').hidden = true;
    this.panel.querySelector('#welcome-close').focus({ preventScroll: true });
    this.previewController = new AbortController();
    for (const card of this.panel.querySelectorAll('.welcome-card')) this.observer.observe(card);
  }
  close(save = false) {
    if (this.panel.hidden) return;
    if (save) writeWelcomeSetting(localStorage, !this.panel.querySelector('#welcome-never').checked);
    this.panel.hidden = true;
    this.observer.disconnect();
    this.queue = [];
    this.previewController?.abort();
    if (this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
  }
  async startTour(tour) {
    this.walkthrough.stop();
    const result = await this.context.openFeatured(
      { key: tour.key, name: tour.title },
      { split: ['paper', 'slice'].includes(tour.id) }
    );
    if (result) this.walkthrough.start(tour);
  }
  clearAnchor() {
    this.anchor?.classList.remove('walkthrough-anchor');
    this.anchor = null;
  }
  showStep({ tour, step, anchor, index }) {
    this.clearAnchor();
    revealWalkthrough(anchor, { reveal: (node) => this.context.reveal(node) });
    if (this.walkthrough.tour !== tour || this.walkthrough.index !== index) return;
    anchor.classList.add('walkthrough-anchor');
    this.anchor = anchor;
    const modal = anchor.closest('dialog[open]'),
      host = modal || document.body;
    if (this.coach.parentElement !== host) host.append(this.coach);
    this.coach.classList.toggle('walkthrough-in-dialog', !!modal);
    this.coach.hidden = false;
    this.coach.querySelector('#walkthrough-title').textContent = tour.title;
    this.coach.querySelector('#walkthrough-step').textContent = 'Step ' + (index + 1) + ' of ' + tour.steps.length;
    this.coach.querySelector('#walkthrough-text').textContent =
      step.text + (anchor.matches(':disabled') ? ' Wait for the current operation to finish, or choose Next.' : '');
    this.coach.querySelector('#walkthrough-next').textContent = index === tour.steps.length - 1 ? 'Finish' : 'Next';
  }
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length && !this.panel.hidden) {
        const card = this.queue.shift(),
          key = card.dataset.featuredKey,
          slot = card.querySelector('.welcome-thumbnail'),
          controller = this.previewController;
        try {
          let url = this.cache.get(key);
          if (!url) {
            await new Promise((resolve) => setTimeout(resolve, 80));
            if (controller.signal.aborted) continue;
            const model = await this.context.readPreview({ key, name: key }, { signal: controller.signal });
            if (controller.signal.aborted) continue;
            if (!this.preview) {
              this.host = document.createElement('div');
              this.host.className = 'welcome-render-host';
              this.host.setAttribute('aria-hidden', 'true');
              document.body.append(this.host);
              this.preview = new Viewer(this.host);
              this.preview.controls.enabled = false;
            }
            this.preview.setModel(model);
            this.preview.setDisplay(featuredView(model.dimension));
            this.preview.fit();
            url = this.preview.image();
            this.preview.clear();
            if (this.cache.size >= 12) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, url);
          }
          if (controller.signal.aborted) continue;
          const img = document.createElement('img');
          img.alt = '';
          img.src = url;
          slot.replaceChildren(img);
        } catch (error) {
          if (!controller.signal.aborted) slot.textContent = 'Preview unavailable · click to open';
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}
