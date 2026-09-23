import { MASTERCRAFTED_CONST } from './config.js';
import { registerSettings } from './settings.js';
import { ItemConfig } from './apps/ItemConfig.js';
import { RecipeBookApplication } from './apps/RecipeBookApplication.js';
import { MastercraftedRecipeSheet } from './journal/RecipeSheet.js';
import { MastercraftedPageData } from './journal/MastercraftedPageData.js';
import { SheetEmbed } from './journal/SheetEmbed.js';
import { MastercraftedMigration } from './migration.js';
import { RecipeBook } from './documents/RecipeBook.js';
import { Recipe } from './documents/Recipe.js';
import { CauldronApp } from './apps/CauldronApp.js';
import "../scss/module.scss";

export const MODULE_ID = 'mastercrafted';
export const API = {};

Hooks.once('init', async () => {

    customElements.define('mastercrafted-sheet-embed', SheetEmbed);
    SheetEmbed.setupHooks();

    Object.assign(CONFIG.JournalEntryPage.dataModels, {
        "mastercrafted.mastercrafted": MastercraftedPageData,
    });

    await foundry.applications.handlebars.loadTemplates([
        'modules/mastercrafted/templates/partials/recipe-sheet-folder-partial.hbs',
        'modules/mastercrafted/templates/partials/recipe-sheet-document-partial.hbs'
    ]);
    
    Handlebars.registerPartial('mastercrafted-recipe-sheet-folder-partial', 
        await foundry.applications.handlebars.getTemplate('modules/mastercrafted/templates/partials/recipe-sheet-folder-partial.hbs')
    );
    
    Handlebars.registerPartial('mastercrafted-recipe-sheet-entry-partial',
        await foundry.applications.handlebars.getTemplate('modules/mastercrafted/templates/partials/recipe-sheet-document-partial.hbs')
    );

    foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntryPage, MODULE_ID, MastercraftedRecipeSheet, {
        types: ["mastercrafted.mastercrafted"],
        label: "Mastercrafted Sheet",
    });

    const module = game.modules.get(MODULE_ID);
    module.API = API;

    registerSettings();

    let hookId = null;
    hookId = Hooks.on("renderChatMessageHTML", (message, html) => {
        if (!game.user.isGM) {
            Hooks.off("renderChatMessageHTML", hookId);
            return;
        }
        const confirmButton = html.querySelector(".confirm-recipe-discovery");
        if (!confirmButton) return;
        confirmButton.addEventListener("click", (e) => {
            RecipeBook.confirmDiscovery(e, message);
        });
    });

    API.migration = new MastercraftedMigration();
    API.RecipeBookApplication = RecipeBookApplication;
    API.CauldronApp = CauldronApp;
    API.processDelayedCrafting = RecipeBook.processDelayedCrafting;
});

Hooks.once("ready", () => {
    if (game.user.isGM && game.settings.get(MODULE_ID, "migrateOnStartup")) API.migration.migrateBooks();
    ItemConfig.setHooks();
});

Hooks.on("preCreateJournalEntryPage", (document, data, options, userId) => {
    if (document.type !== "mastercrafted.mastercrafted") return;

    if (document.flags.mastercrafted) return;
    const defaultFlags = Recipe.getDefaultFlags(RecipeBook.toObject(document.parent.uuid));
    document.updateSource({ flags: defaultFlags });
});

Hooks.on("renderItemDirectory", (app, html) => {
    const buttonContainer = html.querySelector(".header-actions.action-buttons");
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add(`${MODULE_ID}-open-recipe-app`);
    button.innerHTML = `<i class="fas fa-book"></i><span>${game.i18n.localize(`${MODULE_ID}.UI.open-recipe-app`)}</span>`;
    button.onclick = () => (new RecipeBookApplication()).render({ force: true });
    buttonContainer.appendChild(button);
})

Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    if (!app.document || !app.document.isOwner) return;
    if (game.settings.get(MODULE_ID, "dontShowButtonOnNpc") && !app.document.hasPlayerOwner) return;
    controls.push({
        label: "mastercrafted.craft",
        action: "mastercrafted",
        icon: "fas fa-hammer",
        onClick: () => { new RecipeBookApplication("", app.document).render({ force: true }) }
    });
    RecipeBook.processDelayedCrafting([app.document])
});

Hooks.on("getHeaderControlsDocumentSheetV2", (app, controls) => {
    if (app.document.documentName !== "Item" || !RecipeBook.getRecipesByIngredient(app.document.name).length) return;
    controls.push({
        label: "mastercrafted.show-recipes",
        icon: "fas fa-hammer",
        onClick: () => { new RecipeBookApplication(app.document.name, app.document.actor).render({ force: true }) }
    });
});

Hooks.on("item-piles-preRightClickItem", (item, buttons, actor) => {
    if (!RecipeBook.getRecipesByIngredient(item.name).length) return;
    buttons.push({
        label: "mastercrafted.show-recipes",
        icon: "fas fa-hammer",
        onPress: () => { new RecipeBookApplication(item.name).render({ force: true }) }
    });
});

function _refreshRecipeSheets(args) {
    const actor = args[0]?.parent ?? args[0];
    if (actor !== RecipeBook.actor && actor !== RecipeBook.inventoryActor) return;
    const pages = Array.from(foundry.applications.instances.values()).filter(app => app instanceof MastercraftedRecipeSheet);
    pages.forEach(page => page.render());
}

const refreshRecipeSheets = foundry.utils.debounce(_refreshRecipeSheets, 100);

Hooks.on("updateItem", (...args) => refreshRecipeSheets(args));
Hooks.on("deleteItem", (...args) => refreshRecipeSheets(args));
Hooks.on("createItem", (...args) => refreshRecipeSheets(args));
Hooks.on("updateActor", (...args) => refreshRecipeSheets(args));

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    if (app.object.isOwner) {
        buttons.unshift({
            label: "mastercrafted.craft",
            class: "mastercrafted",
            icon: "fas fa-hammer",
            onclick: () => { new RecipeBookApplication("", app.object).render({ force: true }); }
        });
        RecipeBook.processDelayedCrafting([app.object])
    }
})

Hooks.on("getItemSheetHeaderButtons", (app, buttons) => {
    if (RecipeBook.getRecipesByIngredient(app.object.name).length) {
        buttons.unshift({
            class: "mastercrafted",
            icon: "fas fa-hammer",
            onclick: () => { new RecipeBookApplication(app.object.name).render({ force: true }) }
        });
    }
})

Hooks.on("getApplicationHeaderButtons", (app, buttons) => {
    if (app.actor && app.actor.isOwner) {
        buttons.unshift({
            label: "mastercrafted.craft",
            class: "mastercrafted",
            icon: "fas fa-hammer",
            onclick: () => { new new RecipeBookApplication().render({ force: true }) }
        });
        RecipeBook.processDelayedCrafting([app.actor])
    }
});