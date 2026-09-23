import { MASTERCRAFTED_CONST } from "../config.js";
import { HandlebarsApplication, mergeClone } from "../lib/utils.js";
import { MODULE_ID, API } from "../main.js";
import { RecipeBook } from "../documents/RecipeBook.js";
import { Recipe } from "../documents/Recipe.js";
import { CauldronApp } from "./CauldronApp.js";
import { Hook } from "../lib/hooks.js";

export class RecipeBookApplication extends HandlebarsApplication {
    constructor(filter = "", actor = null) {
        super();
        if (actor) {
            const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
            game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, actor: actor.id });
        }
        this.filter = filter;
        this.autoExpandFolderIds = new Set();
        this.refreshList = foundry.utils.debounce(this.refreshList.bind(this), 100);
        this.refreshList();
        this.setupHooks();
        this.onlyCraftable = false;
        RecipeBookApplication.instance = this;
    }

    static get DEFAULT_OPTIONS() {
        return mergeClone(super.DEFAULT_OPTIONS, {
            classes: ["mastercrafted-recipe-book"],
            window: {
                title: game.i18n.localize("mastercrafted.recipeApp.recipeBooks"),
                contentClasses: ["mastercrafted-journals-container", "journal-sidebar", "directory"],
                resizable: true,
                icon: "fas fa-hammer",
            },
            position: {
                width: window.innerWidth * 0.7,
                height: 700,
            },
            actions: {
                activateEntry: this._onClickEntry,
                createEntry: this._onCreateEntry,
                collapseFolders: this._onCollapseFolders,
                createFolder: this._onCreateFolder,
                toggleFolder: this._onToggleFolder,
                toggleSort: this._onToggleSort,
                toggleCraftable: this._onToggleCraftable,
            }
        });
    };

    get title() {
        return `${this.options.window.title}${this.folderName ? ": " + this.folderName : ""}`;
    }

    static get PARTS() {
        return {
            bookHeader: {
                template: "modules/mastercrafted/templates/book-header.hbs"
            },
            bookList: {
                template: "modules/mastercrafted/templates/book-list.hbs",
                scrollable: [""]
            },
            bookContent: {
                template: "modules/mastercrafted/templates/book-content.hbs"
            }
        }
    }

    static get APP_ID() {
        return "mastercrafted";
    }

    static _entryPartial = "modules/mastercrafted/templates/partials/recipe-sheet-document-partial.hbs";
    static _folderPartial = "modules/mastercrafted/templates/partials/recipe-sheet-folder-partial.hbs";

    #currentEmbeddedJournal = null;

    get currentEmbeddedJournal() {
        return this.#currentEmbeddedJournal;
    }

    set currentEmbeddedJournal({doc, pageId} = {}) {
        this.setCurrentEmbeddedJournal({doc, pageId});
    }

    async setCurrentEmbeddedJournal({doc, pageId}) {
        if((doc === this.currentEmbeddedJournal) || this.loading) {
            if (pageId) doc.sheet.goToPage(pageId);
            return;
        }
        this.loading = true;
        if(doc) {
            await doc.sheet.render({ force: true, animate: false });
            if (this.element) {
                const journalEntryContainer = this.element.querySelector(".mastercrafted-journalentry-container");
                journalEntryContainer.prepend(doc.sheet.element);
                await doc.sheet.render();
            } else {
                doc.sheet.close({ animate: false });
            }
            if (pageId) setTimeout(() => doc.sheet.goToPage(pageId), 0);
        }
        if (this.#currentEmbeddedJournal?.sheet?.element) {
            document.body.append(this.#currentEmbeddedJournal.sheet.element);
            this.#currentEmbeddedJournal.sheet.close({ animate: false });
        }
        this.#currentEmbeddedJournal = doc;
        if (doc) {
            const oldSettings = game.settings.get(MODULE_ID, "persistentClientSettings");
            game.settings.set(MODULE_ID, "persistentClientSettings", { ...oldSettings, lastOpenedBook: doc.id });
        }
        this.loading = false;
    }

    static async _onClickEntry(event, target) {
        event.preventDefault();
        const { bookId, pageId } = target.closest("[data-book-id]").dataset;
        const doc = fromUuidSync(bookId);
        this.currentEmbeddedJournal = {doc, pageId};
    }

    static async _onCreateEntry(event, target) {
        event.stopPropagation();
        const { folderId } = target.closest(".directory-item")?.dataset ?? {folderId: this.filteredCollection.folder } ?? {};
        const newJournal = await RecipeBook.create(folderId);
        RecipeBook.edit(newJournal.uuid);
        this.refreshList();
        this.render();
    }

    static _onCreateFolder(event, target) {
        event.stopPropagation();
        const { folderId } = target.closest(".directory-item")?.dataset ?? {};
        const data = { folder: folderId ?? this.filteredCollection?.folder?.id, type: "JournalEntry" };
        const sheetWidth = foundry.applications.sheets.FolderConfig.DEFAULT_OPTIONS.position.width;
        const options = {
            position: { top: target.offsetTop, left: window.innerWidth - 310 - sheetWidth }
        };
        const operation = {};
        if ( this.fullCollection instanceof CompendiumCollection ) operation.pack = this.fullCollection.collection;
        Folder.implementation.createDialog(data, operation, options);
        this.refreshList();
    }

    static _onToggleFolder(event, target) {
        const folder = target.closest(".directory-item");
        folder.classList.toggle("expanded");
        const expanded = folder.classList.contains("expanded");
        const { uuid } = folder.dataset;
        if ( expanded ) game.folders._expanded[uuid] = true;
        else delete game.folders._expanded[uuid];

        if ( !expanded ) {
            for ( const subfolder of folder.querySelectorAll(".directory-item.folder") ) {
                subfolder.classList.remove("expanded");
                delete game.folders._expanded[subfolder.dataset.uuid];
            }
        }
    }

    static _onCollapseFolders() {
        for ( const el of this.element.querySelectorAll(".directory-item.folder") ) {
            el.classList.remove("expanded");
            delete game.folders._expanded[el.dataset.uuid];
        }
    }

    static _onToggleCraftable() {
        this.onlyCraftable = !this.onlyCraftable;
        this.refreshList();
        this.render({ parts: ["bookHeader"] });
    }

    static async _onToggleSort() {
        if (this.folderName) {
            await this.fullCollection?.folder?.update({ sorting: this.fullCollection.folder.sorting == "a" ? "m" : "a" });
        } else {
            await game.journal.toggleSortingMode()
        }
        this.refreshList();
        this.render({ parts: ["bookHeader"] });
    }

    getRootFolder() {
        const userFolder = game.journal.folders.getName(game.settings.get(MODULE_ID, "mainFolderName"));
        if (userFolder) return userFolder;

        const allMastercraftedJournals = game.journal.contents.filter(journal => journal.pages.some(page => page.type === "mastercrafted.mastercrafted"));

        const allFolders = new Set(allMastercraftedJournals.map(journal => journal.folder?.ancestors.at(-1)));
        if (allFolders.size > 1 || allFolders.size === 0) return null;
        if (allFolders.size === 1) return Array.from(allFolders)[0];

        return null;
    }

    getRootTree() {
        const rootFolder = this.getRootFolder();
        this.folderName = "";
        if (!rootFolder) return game.journal.tree;
        this.folderName = rootFolder.name;
        return {
            children: rootFolder.children,
            entries: rootFolder.contents,
            depth: rootFolder.depth,
            folder: rootFolder.folder,
            visible: rootFolder.visible,
            root: false,
        }
    }

    filterMastercraftedTree(tree) {
        let expandFolder = false;
        const filter = this.filter?.toLowerCase();

        const filteredChildren = tree.children
            ?.map(child => this.filterMastercraftedTree(child))
            .filter(child => child.entries.length > 0 || child.children.length > 0 || child.empty)
            || [];

        if (tree.folder?.id && (filteredChildren.length != 0)) expandFolder = true;

        const entries = tree.entries?.filter(journal => {
            let showJournal = journal.name.toLowerCase().includes(filter);
            journal.searchedPages = [];
            journal.pages.forEach(page => {
                let showPage = false;
                if (!page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) && !page.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return;
                const recipe = new Recipe({
                    ...page.flags.mastercrafted,
                    document: page,
                    pageUuid: page.uuid,
                    pageId: page.id,
                    id: page.id,
                    name: page.name,
                    recipeBook: RecipeBook.toObject(journal),
                });
                if (this.onlyCraftable) {
                    const canCraft = RecipeBook.processRecipe(recipe, null);
                    if (!canCraft) return;
                    showPage = true;
                }
                if (filter) {
                    showPage = false;
                    if (recipe?.ingredients
                        .some(i => i.components
                            .some(c => c.name?.toLowerCase()?.includes(filter)))) showPage = true;
                    if (recipe?.products
                        .some(p => p.components
                            .some(c => c.name?.toLowerCase()?.includes(filter)))) showPage = true;
                    if (page.name?.toLowerCase()?.includes(filter)) showPage = true;
                } 
                if (showPage) journal.searchedPages.push(page);
            });
            return showJournal || !!journal.searchedPages.length;
        }) || [];

        if (tree.folder?.id && (entries.length != 0)) expandFolder = true;

        // Add folder to be expanded if at least one child entry or folder is not empty
        if (expandFolder && filter !== "") this.autoExpandFolderIds.add(tree.folder?.id);

        return {
            ...tree,
            entries: entries,
            children: filteredChildren,
            empty: !tree.entries?.length,
        };

    }

    _contextMenu(html) {

        const getBookId = (el) => el.dataset.bookId;
        
        new foundry.applications.ux.ContextMenu.implementation(html, ".recipe-book", [
            ...ui.journal._getEntryContextOptions(),
            {
                name: `${MODULE_ID}.recipeApp.bookcontext.add`,
                icon: `<i class="fas fa-plus"></i>`,
                callback: async (elem) => {
                    const bookId = getBookId(elem)
                    const recipe = await RecipeBook.addRecipe(bookId);
                    if (recipe) this.currentEmbeddedJournal = { doc: recipe.parent, pageId: recipe.id };
                },
            },
            {
                name: `${MODULE_ID}.recipeApp.bookcontext.edit`,
                icon: `<i class="fas fa-edit"></i>`,
                callback: async (elem) => {
                    const bookId = getBookId(elem)
                    RecipeBook.edit(bookId);
                },
            },
        ], {jQuery: false, fixed: true});

        new foundry.applications.ux.ContextMenu.implementation(html, ".folder-header", [
            ...ui.journal._getFolderContextOptions(),
        ], {jQuery: false, fixed: true});
    }

    _getHeaderControls() {
        let buttons = super._getHeaderControls();
        buttons.unshift({
            icon: "fa-solid fa-chart-tree-map",
            label: "JOURNAL.ConfigureCategories",
            onClick: () => {
                if (!this.currentEmbeddedJournal) return ui.notifications.error(game.i18n.localize("mastercrafted.recipeApp.errors.noJournal"));
                new foundry.applications.sheets.journal.JournalEntryCategoryConfig({ document: this.currentEmbeddedJournal }).render({ force: true });
            },
        });
        if (RecipeBook.inventoryActor && Object.values({ ...(RecipeBook.inventoryActor.flags[MODULE_ID] ?? {}) }).length) {
            buttons.unshift({
                class: "display-timed",
                icon: "fas fa-clock",
                label: game.i18n.localize(`${MODULE_ID}.recipeApp.timedCrafting`),
                onClick: async () => {
                    const actor = RecipeBook.inventoryActor;
                    const delayedCraftings = Object.values({ ...(actor.flags[MODULE_ID] ?? {}) }).sort((a, b) => a.time - b.time);
                    const html = `
                    <div class="timed-crafting">
                    <ul class="timed-crafting-list">
                    ${delayedCraftings
                        .map((crafting) => {
                            const timeRemaining = crafting.time - game.time.worldTime;
                            //time remaining is in seconds, convert to hours and minutes
                            const hours = Math.floor(timeRemaining / 3600);
                            const minutes = Math.floor((timeRemaining % 3600) / 60);
                            const time = `${hours}h ${minutes}m`;
                            return `<li><strong>${game.i18n.localize(`${MODULE_ID}.recipeApp.readyIn`)} ${time}</strong><ul>${crafting.items.map((item) => `<li><img src="${item.img}">${item.name} (${foundry.utils.getProperty(item.system, MASTERCRAFTED_CONST.QUANTITY)})</li>`).join("")}</ul></li>`;
                        })
                        .join("")}
                    </ul></div>`;
                    new foundry.applications.api.DialogV2({
                        window: { title: `${MODULE_ID}.recipeApp.timedCrafting` },
                        content: html,
                        buttons: [
                            {
                                label: game.i18n.localize("Close"),
                                callback: () => {},
                            },
                        ],
                    }).render({ force: true });
                },
            });
        }
        if (game.settings.get(MODULE_ID, "enableCauldron")) {
            buttons.unshift({
                class: "cauldron",
                icon: "fad fa-cauldron",
                label: game.i18n.localize(`${MODULE_ID}.recipeApp.cauldron`),
                onClick: () => {
                    new CauldronApp(RecipeBook.inventoryActor).render(true);
                },
            });
        }
        return buttons;
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);

        Object.assign(context, {
            canCreateFolder: () => game.user.isGM,
            canCreateEntry: () => game.user.isGM,
            folderIcon: CONFIG.Folder.sidebarIcon,
            sidebarIcon: "fa-solid fa-book-atlas",
            tree: this.filteredCollection,
        });
        
        switch(partId) {
            case "bookHeader": {
                const sortMode = this.fullCollection?.folder ? this.fullCollection.folder.sorting : game.journal.sortingMode;
                Object.assign(context, {
                    filter: this.filter,
                    searchPlaceholder: game.i18n.format("mastercrafted.recipeApp.searchRecipe"),
                    sortMode: sortMode === "a"
                        ? { icon: "fa-solid fa-arrow-down-a-z", label: "SIDEBAR.SortModeAlpha" }
                        : { icon: "fa-solid fa-arrow-down-short-wide", label: "SIDEBAR.SortModeManual" },
                    onlyCraftable: this.onlyCraftable
                        ? { icon: "fa-solid fa-hammer", label: "mastercrafted.recipeApp.onlyCraftable" }
                        : { icon: "fa-solid fa-a", label: "mastercrafted.recipeApp.all" },
                });
                break;
            }
            case "bookList": {
                Object.assign(context, { 
                    folderPartial: this.constructor._folderPartial,
                    entryPartial: this.constructor._entryPartial,
                    maxFolderDepth: game.journal.maxFolderDepth,
                });
                break;
            }
            case "bookContent": {
                break;
            }
        }
        
        return context;
    }

    refreshList() {
        this.fullCollection = this.getRootTree();
        this.filterCollection();
        this._updateFrame({ window: { title: this.title } });
    }

    _onSearchFilter(event) {
        this.filter = event.target.value;
        this.filterCollection();
    }

    filterCollection() {
        this.searchedPages = {};
        this.autoExpandFolderIds.clear();
        const filteredTree = this.filterMastercraftedTree(this.fullCollection);
        this.filteredCollection = {...this.collectionifier, ...filteredTree };
        this.render({parts: ["bookList"]});
    }

    autoExpandFolders() {
        // Toggle each directory entry.
        for ( const el of this.element.querySelectorAll(".directory-item") ) {
            if ( el.classList.contains("folder") ) {
                const { folderId, uuid } = el.dataset;
                if (this.autoExpandFolderIds.has(folderId)) el.classList.add("expanded");
                else el.classList.toggle("expanded", uuid in game.folders._expanded);
            }
        }
    }

    async _onFirstRender(context, options) {
        super._onFirstRender(context, options);
        this.element.querySelector("input[name='search']").addEventListener("input", foundry.utils.debounce(this._onSearchFilter.bind(this), 167));
    }

    async _onRender(context, options) {
        super._onRender(context, options);
        this.autoExpandFolders();

        this._contextMenu(this.element);

        new foundry.applications.ux.DragDrop.implementation({
            dragSelector: ".directory-item",
            dropSelector: ".directory-list",
            permissions: {
                dragstart: this._canDragStart,
                drop: this._canDragDrop
            },
            callbacks: {
                dragover: () => {},
                dragstart: ui.journal._onDragStart.bind(this),
                drop: async (e) => {
                    const data = await this._onDropProduct(e);
                    if (!data) return;
                    this._onDrop(e, data);
                }
            }
        }).bind(this.element);
        this.element.querySelectorAll(".directory-item.folder").forEach(folder => {
            folder.addEventListener("dragenter", ui.journal._onDragHighlight.bind(this));
            folder.addEventListener("dragleave", ui.journal._onDragHighlight.bind(this));
        });

        const lastOpenedBook = game.settings.get(MODULE_ID, "persistentClientSettings")?.lastOpenedBook;
        if (!lastOpenedBook) return;
        const doc = game.journal.get(lastOpenedBook);
        if (!doc) return;
        if (!doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) && !doc.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)) return;
        this.setCurrentEmbeddedJournal({doc, pageId: null});
    }

    _onDrop(event, data) {
        if ( !data.type ) return;
        const target = event.target.closest(".directory-item") ?? null;
        if ( data.type === "Folder" ) return this._handleDroppedFolder(target, data);
        else if ( data.type === this.documentName ) return this._handleDroppedEntry(target, data);
    }

    async _onDropProduct(event) {
        let data;
        try { data = JSON.parse(event.dataTransfer.getData("text/plain")) }
        catch (err) { return }
        if (data.type !== "Item") return data;
        const item = await fromUuid(data.uuid);
        const bookEl = event.target.closest(".recipe-book");
        const bookId = bookEl.dataset.entryId;
        const recipePage = await RecipeBook.addRecipe(bookId, {
            name: item.name,
            text: {
                content: item.system?.description?.value ?? "<p></p>",
            },
            flags: {
                mastercrafted: {
                    img: item.img,
                }
            }
        });
        if (!recipePage) return data;
        const recipe = new Recipe({
            ...recipePage.flags.mastercrafted,
            document: recipePage,
            pageUuid: recipePage.uuid,
            pageId: recipePage.id,
            id: recipePage.id,
            name: recipePage.name,
            recipeBook: RecipeBook.toObject(recipePage.parent),
        });
        if (!recipe) return data;
        recipe.addProduct(null, data.uuid, item.name, item.img);
        if (recipe) this.currentEmbeddedJournal = { doc: recipePage.parent, pageId: recipe.pageId };
        return;
    }

    _onClose(...args) {
        this.loading = false;
        this.currentEmbeddedJournal = {doc: null, page: null};
        this.hooks.forEach(hook => hook.destroy());
        RecipeBookApplication.instance = null;
        super._onClose(...args);
    }

    setupHooks() {
        this.hooks = [
            new Hook("createJournalEntry", () => this.refreshList()),
            new Hook("updateJournalEntry", () => this.refreshList()),
            new Hook("deleteJournalEntry", () => this.refreshList()),
            new Hook("createFolder", (folder) => { if (folder.type === "JournalEntry" && !folder.flags?.mastercrafted?.mainMastercraftedFolder) this.refreshList() }),
            new Hook("updateFolder", (folder) => { if (folder.type === "JournalEntry") this.refreshList() }),
            new Hook("deleteFolder", (folder) => { if (folder.type === "JournalEntry") this.refreshList() }),
        ];
    }

    // WorldCollection ninja masks
    collectionifier = {
        get index() { return game.journal.index },
        get documentName() { return game.journal.documentName },
        get documentClass() { return game.journal.documentClass },
        get folders() { return game.journal.folders },
        get maxFolderDepth() { return game.journal.maxFolderDepth },
        
        has(...args) { return game.journal.has(...args) },
        get(...args) { return game.journal.get(...args) },
        filter(...args) { return game.journal.filter(...args) },
        locked(...args) { return game.journal.locked(...args) },
        collection(...args) { return game.journal.collection(...args) },
        testUserPermission(...args) { return game.journal.testUserPermission(...args) },
        importFromCompendium(...args) { return game.journal.importFromCompendium(...args) },
        importDocument(...args) { return game.journal.importDocument(...args) },
    }

    // DocumentDirectory and JournalDirectory ninja trousers
    get collection() { return this.filteredCollection }
    get documentName() { return ui.journal.documentName }
    get documentClass() { return ui.journal.documentClass }
    async _handleDroppedEntry(...args) { return ui.journal._handleDroppedEntry.call(this, ...args) }
    async _handleDroppedFolder(...args) { return ui.journal._handleDroppedFolder(...args) }
    async _handleDroppedForeignFolder(...args) { return ui.journal._handleDroppedForeignFolder(...args) } 
    _canDragStart(...args) { return ui.journal._canDragStart(...args) }
    _canDragDrop(...args) { return ui.journal._canDragDrop(...args) }
    _onDragStart(...args) { return ui.journal._onDragStart.call(this, ...args) }
    _onDrop(...args) { return ui.journal._onDrop.call(this, ...args) }
    _getEntryDragData(...args) { return ui.journal._getEntryDragData.call(this, ...args) }
    _getFolderDragData(...args) { return ui.journal._getFolderDragData.call(this, ...args) }
    _entryAlreadyExists(...args) { return ui.journal._entryAlreadyExists.call(this,...args) }
    _entryBelongsToFolder(...args) { return ui.journal._entryBelongsToFolder.call(this, ...args) }
    _getDroppedEntryFromData(...args) { return ui.journal._getDroppedEntryFromData.call(this,...args) }
    _createDroppedEntry(...args) { return ui.journal._createDroppedEntry.call(this, ...args) }
    _onDragHighlight(...args) { ui.journal._onDragHighlight.call(this, ...args) }
}