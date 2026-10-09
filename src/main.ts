import { App, Modal, Notice, Plugin, Setting, TFile, WorkspaceLeaf, ItemView } from 'obsidian';
import { listEntries, saveEntry } from './storage';
import type { JournalEntry } from './models';

const VIEW_TYPE = 'deja-two-timeline';

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

class CaptureModal extends Modal {
  private mood = 'content';
  private energy = 5;
  private narrative = '';

  constructor(app: App, private readonly onSave: (entry: JournalEntry) => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Déjà-Two · New experience' });
    new Setting(contentEl).setName('How did you feel?').addDropdown(dropdown => dropdown
      .addOptions({ content: 'Content', energized: 'Energized', peaceful: 'Peaceful', anxious: 'Anxious', low: 'Low', other: 'Other' })
      .setValue(this.mood).onChange(value => { this.mood = value; }));
    new Setting(contentEl).setName('Energy (0–10)').addSlider(slider => slider
      .setLimits(0, 10, 1).setValue(this.energy).setDynamicTooltip()
      .onChange(value => { this.energy = value; }));
    new Setting(contentEl).setName('What happened?').addTextArea(area => {
      area.setPlaceholder('Today this happened, and I felt this…')
        .onChange(value => { this.narrative = value; });
      area.inputEl.rows = 5;
      area.inputEl.addClass('deja-two-narrative');
    });
    new Setting(contentEl).addButton(button => button.setButtonText('Save experience')
      .setCta().onClick(async () => {
        if (!this.narrative.trim()) { new Notice('Write a short note before saving.'); return; }
        const now = new Date().toISOString();
        const entry: JournalEntry = {
          id: newId(), recordedAt: now, occurredAt: now, mood: this.mood,
          energy: this.energy, narrative: this.narrative.trim(), tags: [], source: 'manual'
        };
        button.setDisabled(true);
        try { await this.onSave(entry); this.close(); }
        catch (error) { new Notice('Could not save experience.'); console.error('Déjà-Two save error', error); button.setDisabled(false); }
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}

class TimelineView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: DejaTwoPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Déjà-Two timeline'; }
  getIcon(): string { return 'book-heart'; }
  async onOpen(): Promise<void> { await this.render(); }
  async render(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.createEl('h2', { text: 'Déjà-Two · Timeline' });
    const files = listEntries(this.app.vault);
    if (files.length === 0) { container.createEl('p', { text: 'No experiences yet. Start with a new entry.' }); return; }
    for (const file of files.slice(0, 100)) {
      const row = container.createDiv({ cls: 'deja-two-timeline-row' });
      const link = row.createEl('button', { text: file.basename.replace(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-/, '') });
      link.addEventListener('click', () => { void this.app.workspace.getLeaf(false).openFile(file); });
      const cache = this.app.metadataCache.getFileCache(file);
      const mood = cache?.frontmatter?.mood;
      if (typeof mood === 'string') row.createEl('span', { text: ` · ${mood}` });
    }
  }
}

export default class DejaTwoPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, leaf => new TimelineView(leaf, this));
    this.addRibbonIcon('book-heart', 'Déjà-Two timeline', () => { void this.openTimeline(); });
    this.addCommand({ id: 'new-experience', name: 'Record an experience', callback: () => {
      new CaptureModal(this.app, async entry => {
        const path = await saveEntry(this.app.vault, entry);
        new Notice('Experience saved locally');
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
      }).open();
    }});
    this.addCommand({ id: 'open-timeline', name: 'Open experience timeline', callback: () => { void this.openTimeline(); } });
    this.registerEvent(this.app.vault.on('create', () => { void this.refreshTimeline(); }));
    this.registerEvent(this.app.vault.on('delete', () => { void this.refreshTimeline(); }));
  }
  async openTimeline(): Promise<void> {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  private async refreshTimeline(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof TimelineView) await leaf.view.render();
    }
  }
}
