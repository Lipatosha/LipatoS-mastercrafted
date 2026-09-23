export class SheetEmbed extends HTMLElement {

    static get observedAttributes() {
        return ['uuid'];
    }

    static setupHooks() {
        Hooks.on("updateJournalEntryPage", (page) => {
            const embeds = document.querySelectorAll(`mastercrafted-sheet-embed[uuid="${page.uuid}"]`);
            embeds.forEach(embed => {
                embed.render();
            });
        });
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'uuid' && oldValue !== newValue) this.render();
    }

    async render() {
        const uuid = this.getAttribute('uuid');
        if (!uuid) return;

        const page = await fromUuid(uuid);
        const sheet = page.sheet;

        this.sheet = sheet;
        sheet.startAsView = true;
        
        await sheet._configureRenderOptions({ forceView: true });
        const rendered = await sheet._renderHTML(
            await sheet._prepareContext({}), 
            { parts: Object.keys(sheet.constructor.VIEW_PARTS), forceView: true }
        );

        this.innerHTML = '';
        Object.values(rendered).forEach(part => {
            this.appendChild(part);
        });

        const html = this;
        this.sheet._setupEventListeners(html);
    }
}