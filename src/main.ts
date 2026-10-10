import { App, Modal, Notice, Plugin, Setting, WorkspaceLeaf, ItemView } from 'obsidian';
import { listEntries, readEntry, saveEntry, type StoredEntry } from './storage';
import { EntryError, localTimestamp, newId, normalizeEntry, timestampLabel } from './core';
import type { JournalEntry } from './models';

const VIEW_TYPE = 'deja-two-timeline';

class CaptureModal extends Modal {
  constructor(app: App, private readonly onSave: (entry: JournalEntry) => Promise<void>) { super(app); }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('deja-two-capture');
    contentEl.createEl('h2', { text: 'Déjà-Two · New experience' });
    const now = localTimestamp();
    let occurred = now.slice(0, 19), offset = now.slice(-6);
    let mood = 'content', customMood = '', energy: number | null = null, narrative = '', saving = false;
    new Setting(contentEl).setName('When did it happen?').addText(text => {
      text.inputEl.type = 'datetime-local';
      text.inputEl.step = '1';
      text.inputEl.setAttribute('aria-label', 'Occurred-at local date and time');
      text.setValue(occurred).onChange(value => { occurred = value; });
    });
    new Setting(contentEl).setName('UTC offset at that time')
      .setDesc('Starts with your current offset. For a past event or travel, enter the offset where and when it happened, including daylight saving (for example +05:30 or -04:00).')
      .addText(text => text.setValue(offset).setPlaceholder('+00:00').onChange(value => { offset = value.trim(); })
        .inputEl.setAttribute('aria-label', 'UTC offset at the event'));
    new Setting(contentEl).setName('How did you feel?').addDropdown(dropdown => dropdown
      .addOptions({ content: 'Content', energized: 'Energized', peaceful: 'Peaceful', anxious: 'Anxious', low: 'Low', other: 'Other / custom' })
      .setValue(mood).onChange(value => { mood = value; })
      .selectEl.setAttribute('aria-label', 'Mood'));
    new Setting(contentEl).setName('Custom mood').setDesc('Overrides the selected mood. Required when you choose Other / custom.')
      .addText(text => text.setPlaceholder('Your own words').onChange(value => { customMood = value; })
        .inputEl.setAttribute('aria-label', 'Custom mood'));
    new Setting(contentEl).setName('Energy (optional)').addDropdown(dropdown => {
      dropdown.addOption('', 'Not recorded');
      for (let i = 0; i <= 10; i++) dropdown.addOption(String(i), String(i));
      dropdown.setValue('').onChange(value => { energy = value === '' ? null : Number(value); });
      dropdown.selectEl.setAttribute('aria-label', 'Energy from 0 to 10, optional');
    });
    new Setting(contentEl).setName('What happened?').addTextArea(area => {
      area.setPlaceholder('Today this happened, and I felt this…').onChange(value => { narrative = value; });
      area.inputEl.rows = 5;
      area.inputEl.addClass('deja-two-narrative');
      area.inputEl.setAttribute('aria-label', 'Experience narrative');
    });
    const status = contentEl.createEl('p', { cls: 'deja-two-status', attr: { role: 'status', 'aria-live': 'polite' } });
    new Setting(contentEl).addButton(button => button.setButtonText('Cancel').onClick(() => { if (!saving) this.close(); }))
      .addButton(button => button.setButtonText('Save experience').setCta().onClick(async () => {
        if (saving) return;
        saving = true;
        button.setDisabled(true).setButtonText('Saving…');
        status.setText('Saving to your vault…');
        try {
          const entry = normalizeEntry({
            id: newId(), recordedAt: localTimestamp(), occurredAt: `${occurred}${offset}`,
            mood: customMood.trim() || (mood === 'other' ? '' : mood), energy, narrative, tags: [], source: 'manual'
          });
          await this.onSave(entry);
          this.close();
        } catch (error) {
          status.setText(error instanceof EntryError ? error.message : 'Could not save to the journal folder. Your draft is still here. Check vault access and journal properties, then try again.');
        } finally {
          saving = false;
          button.setDisabled(false).setButtonText('Save experience');
        }
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}

class TimelineView extends ItemView {
  private revision = 0;
  constructor(leaf: WorkspaceLeaf, private readonly plugin: DejaTwoPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Déjà-Two timeline'; }
  getIcon(): string { return 'book-heart'; }
  async onOpen(): Promise<void> { await this.render(); }
  async onClose(): Promise<void> { this.revision++; }
  async render(): Promise<void> {
    const revision = ++this.revision;
    const container = this.contentEl;
    container.empty();
    container.addClass('deja-two-timeline');
    container.createEl('h2', { text: 'Déjà-Two · Timeline' });
    new Setting(container)
      .addButton(button => button.setButtonText('New experience').setCta().onClick(() => this.plugin.capture()))
      .addButton(button => button.setButtonText('Refresh').onClick(() => { void this.render(); }));
    const status = container.createEl('p', { text: 'Loading experiences…', attr: { role: 'status', 'aria-live': 'polite' } });
    try {
      const files = listEntries(this.app.vault);
      const entries: StoredEntry[] = [];
      const unreadable = [];
      for (const file of files) {
        try { entries.push({ file, entry: await readEntry(this.app.vault, file) }); }
        catch { unreadable.push(file); }
        if (revision !== this.revision) return;
      }
      entries.sort((a, b) => Date.parse(b.entry.occurredAt) - Date.parse(a.entry.occurredAt) || a.entry.id.localeCompare(b.entry.id));
      status.setText(files.length === 0 ? 'No experiences yet. Record your first experience above.' :
        `${entries.length} experience${entries.length === 1 ? '' : 's'}. Times include the saved UTC offset.`);
      for (const { file, entry } of entries) {
        const row = container.createDiv({ cls: 'deja-two-timeline-row' });
        const link = row.createEl('button', { cls: 'deja-two-entry', attr: { 'aria-label': `Open ${entry.mood}, ${timestampLabel(entry.occurredAt)}` } });
        link.createEl('time', { text: timestampLabel(entry.occurredAt), attr: { datetime: entry.occurredAt } });
        link.createEl('strong', { text: entry.mood });
        const preview = entry.narrative.replace(/\s+/g, ' ');
        link.createEl('span', { text: preview.length > 240 ? `${preview.slice(0, 240)}…` : preview });
        link.addEventListener('click', () => {
          void this.app.workspace.getLeaf(false).openFile(file).catch(() => new Notice('Could not open this note. Refresh the timeline and try again.'));
        });
      }
      if (unreadable.length) {
        container.createEl('p', { text: `${unreadable.length} note(s) could not be displayed. Their contents were not changed. Open them to check their journal properties, then refresh.` });
        for (const file of unreadable) {
          const link = container.createEl('button', { text: `Open ${file.basename}`, cls: 'deja-two-unreadable' });
          link.addEventListener('click', () => {
            void this.app.workspace.getLeaf(false).openFile(file).catch(() => new Notice('Could not open this note. Check vault access and try again.'));
          });
        }
      }
    } catch {
      if (revision === this.revision) status.setText('Could not load the timeline. Check vault access, then select Refresh.');
    }
  }
}

export default class DejaTwoPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, leaf => new TimelineView(leaf, this));
    this.addRibbonIcon('book-heart', 'Déjà-Two timeline', () => { void this.openTimeline(); });
    this.addCommand({ id: 'new-experience', name: 'Record an experience', callback: () => this.capture() });
    this.addCommand({ id: 'open-timeline', name: 'Open experience timeline', callback: () => { void this.openTimeline(); } });
    let timer: number | undefined;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
          if (leaf.view instanceof TimelineView) void leaf.view.render();
        }
      }, 150);
    };
    this.register(() => window.clearTimeout(timer));
    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('modify', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
  }
  capture(): void {
    new CaptureModal(this.app, async entry => {
      await saveEntry(this.app.vault, entry);
      new Notice('Experience saved locally');
    }).open();
  }
  async openTimeline(): Promise<void> {
    try {
      const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0] ?? this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      await this.app.workspace.revealLeaf(leaf);
    } catch { new Notice('Could not open the timeline. Try the command again.'); }
  }
}
