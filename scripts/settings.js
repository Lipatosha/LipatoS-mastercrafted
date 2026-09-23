import { MODULE_ID } from "./main.js";
import { MastercraftedRecipeSheet } from './journal/RecipeSheet.js';
import { RecipeBookApplication } from './apps/RecipeBookApplication.js';

export function registerSettings() {
    game.settings.register(MODULE_ID, "recipeBooks", {
        name: "",
        hint: "",
        scope: "world",
        config: false,
        type: Array,
        default: [],
        onChange: () => {
            const rApp = Object.values(ui.windows).find(w => w instanceof MastercraftedRecipeSheet);
            if(rApp) rApp.render(true);
        }
    });
    
    game.settings.register(MODULE_ID, "enableCauldron", {
        name: `${MODULE_ID}.settings.enableCauldron.name`,
        hint: `${MODULE_ID}.settings.enableCauldron.hint`,
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });
    
    game.settings.register(MODULE_ID, "customQuantityPath", {
        name: `${MODULE_ID}.settings.customQuantityPath.name`,
        hint: `${MODULE_ID}.settings.customQuantityPath.hint`,
        scope: "world",
        config: true,
        type: String,
        default: "",
    });

    game.settings.register(MODULE_ID, "persistentClientSettings", {
        name: "",
        hint: "",
        scope: "client",
        config: false,
        type: Object,
        default: { inventoryActor: "useCraftingActor" },
    });
    
    game.settings.register(MODULE_ID, "mainFolderName", {
        name: `${MODULE_ID}.settings.mainFolderName.name`,
        hint: `${MODULE_ID}.settings.mainFolderName.hint`,
        scope: "world",
        config: true,
        type: String,
        default: "",
        onChange: () => RecipeBookApplication.instance?.refreshList(),
    });
    
    game.settings.register(MODULE_ID, "dontShowButtonOnNpc", {
        name: game.i18n.localize(`${MODULE_ID}.settings.dontShowButtonOnNpc.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.dontShowButtonOnNpc.hint`),
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
    });

    game.settings.register(MODULE_ID, "migrateOnStartup", {
        name: game.i18n.localize(`${MODULE_ID}.settings.migrateOnStartup.name`),
        hint: game.i18n.localize(`${MODULE_ID}.settings.migrateOnStartup.hint`),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true,
    });
}